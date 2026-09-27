import { useState, useEffect, useRef, useMemo } from 'react';
import './App.css';

const PERSONAS = ['Daniel', 'Oliver', 'Carlos'];
const LETRAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const OBJETIVO = 120;
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const ESPERA_GUARDADO = 300; // ms de espera antes de enviar cada celda
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
  const [estado, setEstado] = useState('guardado');
  const [cells, setCells] = useState({});

  const celdaVacia = { valor: '', marcado: false };
  const celdas = useRef(cells);
  const temporizador = useRef(null);
  const temporizadores = useRef(new Map());
  const sinConfirmar = useRef(new Map());

  const clave = `${periodo.anio}-${periodo.mes + 1}`;
  const semanas = useMemo(() => obtenerSemanas(periodo), [periodo]);

  const leer = (id) => cells[id] || celdaVacia;

  // Espejo de las celdas para usarlo dentro de manejadores de eventos
  useEffect(() => {
    celdas.current = cells;
  }, [cells]);

  // 1. Enviar valor + formato de una celda al servidor (SQLite)
  const enviar = async (id, celda) => {
    setEstado('guardando');
    try {
      const res = await fetch(`${API_URL}/api/cells`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, value: celda.valor, marked: celda.marcado }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const actual = sinConfirmar.current.get(id);
      if (actual && actual.valor === celda.valor && actual.marcado === celda.marcado) {
        sinConfirmar.current.delete(id);
      }
      setEstado(sinConfirmar.current.size > 0 ? 'guardando' : 'guardado');
    } catch (err) {
      console.error('Error al guardar celda:', err);
      setEstado('error');
    }
  };

  const programarEnvio = (id, inmediato) => {
    clearTimeout(temporizadores.current.get(id));
    const lanzar = () => {
      temporizadores.current.delete(id);
      const celda = sinConfirmar.current.get(id);
      if (celda) enviar(id, celda);
    };
    temporizadores.current.set(id, inmediato ? lanzar() : setTimeout(lanzar, ESPERA_GUARDADO));
  };

  // 2. Unico punto de escritura: actualiza la celda y la guarda
  const guardar = (id, cambios, inmediato = false) => {
    const nuevo = { ...(celdas.current[id] || celdaVacia), ...cambios };
    setCells((prev) => (prev[id] === nuevo ? prev : { ...prev, [id]: nuevo }));
    sinConfirmar.current.set(id, nuevo);
    setEstado('guardando');
    programarEnvio(id, inmediato);
  };

  const handleChange = (id, valor) => guardar(id, { valor }, false);

  // Al salir de la celda, se envia sin esperar
  const guardarYa = (id) => {
    const celda = sinConfirmar.current.get(id);
    if (!celda) return;
    clearTimeout(temporizadores.current.get(id));
    temporizadores.current.delete(id);
    enviar(id, celda);
  };

  const reintentar = () => {
    new Map(sinConfirmar.current).forEach((celda, id) => enviar(id, celda));
  };

  // 3. Al cerrar la pagina, mandar lo que quedase pendiente
  useEffect(() => {
    const alSalir = () => {
      if (!navigator.sendBeacon) return;
      sinConfirmar.current.forEach((celda, id) =>
        navigator.sendBeacon(
          `${API_URL}/api/cells`,
          new Blob([JSON.stringify({ id, value: celda.valor, marked: celda.marcado })], {
            type: 'application/json',
          })
        )
      );
    };

    window.addEventListener('pagehide', alSalir);
    return () => window.removeEventListener('pagehide', alSalir);
  }, []);

  // 4. Cargar lo guardado en el servidor: todos ven lo mismo al recargar
  useEffect(() => {
    let cancelado = false;

    fetch(`${API_URL}/api/cells`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelado) return;
        const loaded = {};
        data.cells.forEach((cell) => {
          loaded[cell.id] = { valor: cell.value ?? '', marcado: Boolean(cell.marked) };
        });
        setCells(loaded);
        setEstado('guardado');
      })
      .catch((err) => {
        if (cancelado) return;
        console.error('Error al cargar celdas:', err);
        setEstado('error');
      });

    return () => {
      cancelado = true;
    };
  }, []);

  // Pulsacion mantenida: marca la celda (pintada de amarillo) para poder deshacerla
  const pararTemporizador = () => {
    if (temporizador.current) {
      clearTimeout(temporizador.current);
      temporizador.current = null;
    }
  };

  useEffect(() => pararTemporizador, []);

  const mantenerPulsado = (id) => {
    pararTemporizador();
    if (leer(id).marcado) return;
    temporizador.current = setTimeout(() => {
      temporizador.current = null;
      guardar(id, { marcado: true }, true);
      if (navigator.vibrate) navigator.vibrate(20);
    }, 400);
  };

  const borrarCelda = (id) => {
    pararTemporizador();
    guardar(id, { valor: '', marcado: false }, true);
  };

  const sumaPersona = (persona, semana, i) =>
    semana.reduce(
      (acc, d) => (d.delMes ? acc + aNumero(leer(`${clave}-${persona}-${d.dia}-${i + 1}`).valor) : acc),
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
      <div className={`estado ${estado}`}>
        {estado === 'guardando' && 'Guardando cambios...'}
        {estado === 'guardado' && 'Todos los cambios estan guardados en el servidor'}
        {estado === 'error' && (
          <>
            No se pudo guardar en el servidor.{' '}
            <button type="button" onClick={reintentar}>
              Reintentar
            </button>
          </>
        )}
      </div>

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
                    const celda = leer(id);
                    const marcado = celda.marcado;
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
                          value={celda.valor}
                          onChange={(e) => handleChange(id, soloNumeros(e.target.value))}
                          onBlur={() => guardarYa(id)}
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
