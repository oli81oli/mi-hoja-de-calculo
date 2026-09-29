// Script de limpieza: borra las celdas del formato antiguo (id sin prefijo de mes)
// Uso: node purge.js            -> borra
//      node purge.js --dry-run  -> solo muestra lo que se borraria
require('dotenv').config();

const { createClient } = require('@libsql/client');

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error('Faltan TURSO_DATABASE_URL y/o TURSO_AUTH_TOKEN en el archivo .env');
  process.exit(1);
}

const db = createClient({ url, authToken });

// Los ids que usa la app tienen el formato AAAA-MES-Persona-Dia-Semana
const FORMATO_ACTUAL = /^\d{4}-\d{1,2}-(Daniel|Oliver|Carlos)-\d{1,2}-\d{1,2}$/;

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const { rows } = await db.execute('SELECT id, value FROM cells');
  const antiguas = rows.filter((fila) => !FORMATO_ACTUAL.test(fila.id));

  if (antiguas.length === 0) {
    console.log('No hay celdas antiguas que borrar.');
    return;
  }

  console.log(`${antiguas.length} celda(s) antigua(s) encontrada(s):`);
  antiguas.forEach((fila) => {
    console.log(`  ${fila.id} (valor: ${JSON.stringify(fila.value)})`);
  });

  if (dryRun) {
    console.log('\nSimulacion: no se ha borrado nada (usa --dry-run=false o quita la flag).');
    return;
  }

  await db.batch(
    antiguas.map((fila) => ({
      sql: 'DELETE FROM cells WHERE id = ?',
      args: [fila.id],
    })),
    'write'
  );

  console.log(`\n${antiguas.length} celdas borradas.`);

  const restantes = await db.execute('SELECT id FROM cells');
  console.log(`Quedan ${restantes.rows.length}:`);
  restantes.rows.forEach((fila) => console.log(`  ${fila.id}`));
}

main()
  .catch((err) => {
    console.error('Error en purge.js:', err.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
