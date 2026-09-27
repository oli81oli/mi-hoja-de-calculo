// Script de limpieza: borra las celdas del formato antiguo (id sin prefijo de mes)
// Uso: node purge.js
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) {
    console.error('Error al conectar con SQLite', err.message);
    process.exit(1);
  }
});

// Los ids que usa la app tienen el formato AAAA-MES-Persona-Dia-Semana
const FORMATO_ACTUAL = /^\d{4}-\d{1,2}-(Daniel|Oliver|Carlos)-\d{1,2}-\d{1,2}$/;

db.all('SELECT id, value FROM cells', [], (err, filas) => {
  if (err) {
    console.error('Error al leer las celdas', err.message);
    db.close();
    process.exit(1);
  }

  const antiguas = filas.filter((fila) => !FORMATO_ACTUAL.test(fila.id));

  if (antiguas.length === 0) {
    console.log('No hay celdas antiguas que borrar.');
    db.close();
    return;
  }

  let borradas = 0;
  antiguas.forEach((fila) => {
    db.run('DELETE FROM cells WHERE id = ?', [fila.id], (errDel) => {
      if (errDel) {
        console.error(`  No se pudo borrar ${fila.id}:`, errDel.message);
      } else {
        borradas += 1;
        console.log(`  Borrada ${fila.id} (valor: ${JSON.stringify(fila.value)})`);
      }

      if (borradas === antiguas.length) {
        db.all('SELECT id FROM cells', [], (errFin, restantes) => {
          console.log(`\n${borradas} celdas borradas. Quedan ${restantes.length}:`);
          restantes.forEach((f) => console.log(`  ${f.id}`));
          db.close();
        });
      }
    });
  });
});
