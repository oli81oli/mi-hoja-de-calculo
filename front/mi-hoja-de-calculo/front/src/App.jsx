import { useState, useEffect, useRef, useMemo } from 'react';
import './App.css';

const PERSONAS = ['Daniel', 'Oliver', 'Carlos'];
const LETRAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const OBJETIVO = 120;
const NOMBRES_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const MES_INICIAL = { anio: 2026, mes: 9 }; // octubre

// Solo permite numeros (enteros o decimales con un unico separador)
const soloNumeros = (texto) => {
  const limpio = texto
    .replace(/[^0-9.,]/g, '')
    .replace(/[.,]/g, (m, i) => (i === 0 || /[0-9]/.test(texto[i - 1]) ? '.' : ''));
  const [entero, ...resto] = limpio.split('.');
  return resto.length > 0 ? `${entero}.${resto.join('')}` : entero;
};

const aNumero = (valor) => {
  const n = parseFloat(valor);
  return Number.isFinite(n) ? n : 0;
};

const formato = (n) =>
  Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');

// Divide el mes en semanas de lunes a domingo
function obtenerSemanas({ anio, mes }) {
  const ultimoDia = new Date(anio, mes + 1, 0).getDate();
  const desplazamiento = (new Date(anio, mes, 1).getDay() + 6) % 7; // lunes = 0
  const total = Math.ceil((desplazamiento + ultimoDia) / 7);
  const inicio = 1 - desplazamiento;

  return Array.from({ length: total }, (_, s) =>
    LETRAS.map((letra, i) => {
      const dia = inicio + s * 7 + i;
      return {
        letra,
        dia,
        delMes: dia >= 1 && dia <= ultimoDia,
        finde: i >= 5,
      };
    })
  );
}

// Cuando termina el mes en curso, la hoja pasa sola al mes siguiente (reseteada)
const mesSiguiente = (p) => {
  if (new Date() < new Date(p.anio, p.mes + 1, 1)) return p;
  return p.mes === 11 ? { anio: p.anio + 1, mes: 0 } : { anio: p.anio, mes: p.mes + 1 };
};

function usePeriodo() {
  const [periodo, setPeriodo] = useState(() => mesSiguiente(MES_INICIAL));

  useEffect(() => {
    const id = setInterval(() => setPeriodo(mesSiguiente), 30000);
    return () => clearInterval(id);
  }, []);

  return periodo;
}

function App() {
  const periodo = usePeriodo();
  const [cells, setCells] = useState({});
  const [marcados, setMarcados] = useState({});
  const temporizador = useRef(null);

  const clave = `${periodo.anio}-${periodo.mes + 1}`;
  const semanas = useMemo(() => obtenerSemanas(periodo), [periodo]);

  useEffect(() => {
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    fetch(`${API_URL}/api/cells`)
      .then((res) => res.json())
      .then((data) => {
        const loaded = {};
        data.cells.forEach((cell) => {
          loaded[cell.id] = cell.value;
        });
        setCells(loaded);
      })
      .catch((err) => console.error('Error al cargar celdas:', err));
  }, []);

  // Cada mes tiene su propio prefijo de celdas, asi que al cambiar de mes
  // la hoja aparece reseteada: sin numeros, sin sumas y sin marcas
  const handleChange = (id, value) => {
    setCells((prev) => ({ ...prev, [id]: value }));
    fetch('http://localhost:3001/api/cells', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, value }),
    }).catch((err) => console.error('Error al guardar celda:', err));
  };

  // Pulsacion mantenida: marca la celda para poder deshacerla
  const pararTemporizador = () => {
    if (temporizador.current) {
      clearTimeout(temporizador.current);
      temporizador.current = null;
    }
  };

  useEffect(() => pararTemporizador, []);

  const mantenerPulsado = (id) => {
    pararTemporizador();
    if (marcados[id]) return;
    temporizador.current = setTimeout(() => {
      temporizador.current = null;
      setMarcados((prev) => ({ ...prev, [id]: true }));
      if (navigator.vibrate) navigator.vibrate(20);
    }, 400);
  };

  const desmarcar = (id) => {
    pararTemporizador();
    setMarcados((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const borrarCelda = (id) => {
    desmarcar(id);
    if (cells[id]) handleChange(id, '');
  };

  const sumaPersona = (persona, semana, i) =>
    semana.reduce(
      (acc, d) => (d.delMes ? acc + aNumero(cells[`${clave}-${persona}-${d.dia}-${i + 1}`]) : acc),
      0
    );

  // Suma de todos los totales: semanas x personas
  const totalGeneral = semanas.reduce(
    (acc, semana, i) => acc + PERSONAS.reduce((s, p) => s + sumaPersona(p, semana, i), 0),
    0
  );
  const restante = OBJETIVO - totalGeneral;

  return (
    <div className="hoja">
      {semanas.map((semana, i) => (
        <table className="semana" key={`${clave}-${i}`}>
          <colgroup>
            <col className="col-nombre" />
            <col span={7} />
            <col className="col-total" />
          </colgroup>

          <thead>
            <tr>
              <th className="titulo" colSpan={9}>
                {NOMBRES_MES[periodo.mes].toUpperCase()} {periodo.anio} — SEMANA {i + 1}
              </th>
            </tr>
            <tr>
              <th className="esquina" />
              {semana.map((d) => (
                <th key={d.letra} className={d.finde ? 'letra finde' : 'letra'}>
                  {d.letra}
                </th>
              ))}
              <th className="esquina total">Σ</th>
            </tr>
            <tr>
              <th className="esquina" />
              {semana.map((d) => (
                <th
                  key={d.letra}
                  className={`numero ${d.finde ? 'finde' : ''} ${d.delMes ? '' : 'fuera'}`}
                >
                  {d.dia}
                </th>
              ))}
              <th className="numero total">Total</th>
            </tr>
          </thead>

          <tbody>
            {PERSONAS.map((persona) => {
              const suma = sumaPersona(persona, semana, i);

              return (
                <tr key={persona}>
                  <th className="nombre">{persona}</th>
                  {semana.map((d) => {
                    const id = `${clave}-${persona}-${d.dia}-${i + 1}`;
                    const marcado = Boolean(marcados[id]);

                    return (
                      <td
                        key={d.letra}
                        className={`celda ${d.finde ? 'finde' : ''} ${
                          d.delMes ? '' : 'fuera'
                        } ${marcado ? 'marcada' : ''}`}
                      >
                        <input
                          type="text"
                          inputMode="decimal"
                          value={cells[id] ?? ''}
                          onChange={(e) => handleChange(id, soloNumeros(e.target.value))}
                          onPointerDown={() => mantenerPulsado(id)}
                          onPointerUp={pararTemporizador}
                          onPointerLeave={pararTemporizador}
                          onPointerCancel={pararTemporizador}
                          disabled={!d.delMes}
                        />
                        {marcado && (
                          <button
                            type="button"
                            className="borrar"
                            title="Deshacer"
                            aria-label={`Deshacer celda de ${persona} dia ${d.dia}`}
                            onClick={() => borrarCelda(id)}
                          >
                            x
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className={`suma ${suma > 0 ? 'activa' : ''}`}>{formato(suma)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ))}

      <div className="resumen">
        <div className="marca">
          <span className="marca-titulo">Suma de los totales</span>
          <span className="marca-valor">{formato(totalGeneral)}</span>
        </div>
        <div className={`marca ${restante > 0 ? 'ok' : 'mal'}`}>
          <span className="marca-titulo">
            {OBJETIVO} - {formato(totalGeneral)}
          </span>
          <span className="marca-valor">{formato(restante)}</span>
        </div>
      </div>
    </div>
  );
}

export default App;
