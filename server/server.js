require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { createClient } = require('@libsql/client');

const app = express();
const PORT = process.env.PORT || 3001;

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error('Faltan TURSO_DATABASE_URL y/o TURSO_AUTH_TOKEN en el archivo .env');
  process.exit(1);
}

const db = createClient({ url, authToken });

// Middlewares
app.use(cors());
app.use(express.json());

// Crear la tabla inicial para las celdas de la hoja si no existe
async function initDb() {
  await db.execute(`CREATE TABLE IF NOT EXISTS cells (
    id TEXT PRIMARY KEY,
    value TEXT,
    marked INTEGER NOT NULL DEFAULT 0
  )`);

  // Migracion: anadir la columna marked a bases de datos ya existentes
  const info = await db.execute('PRAGMA table_info(cells)');
  const tieneMarked = info.rows.some((columna) => columna.name === 'marked');

  if (!tieneMarked) {
    await db.execute('ALTER TABLE cells ADD COLUMN marked INTEGER NOT NULL DEFAULT 0');
    console.log('Migracion aplicada: columna marked anadida.');
  }

  console.log('Conectado a la base de datos Turso/libSQL.');
}

// 1. Ruta para obtener todas las celdas guardadas
app.get('/api/cells', async (req, res) => {
  try {
    const result = await db.execute('SELECT id, value, marked FROM cells');
    res.json({
      cells: result.rows.map((fila) => ({
        id: fila.id,
        value: fila.value,
        marked: Boolean(fila.marked),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Ruta para guardar o actualizar una celda (valor + estado de formato)
app.post('/api/cells', async (req, res) => {
  const { id, value, marked } = req.body;

  if (typeof id !== 'string' || id.length === 0) {
    res.status(400).json({ error: 'El id de la celda es obligatorio' });
    return;
  }

  const valor = typeof value === 'string' ? value : '';
  const marcado = marked ? 1 : 0;

  try {
    await db.execute({
      sql: `INSERT INTO cells (id, value, marked) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET value = excluded.value, marked = excluded.marked`,
      args: [id, valor, marcado],
    });
    res.json({ message: 'Celda actualizada con éxito', id, value: valor, marked: Boolean(marcado) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Ruta para borrar una celda
app.delete('/api/cells/:id', async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'DELETE FROM cells WHERE id = ?',
      args: [req.params.id],
    });

    if (result.rowsAffected === 0) {
      res.status(404).json({ error: 'La celda no existe', id: req.params.id });
      return;
    }

    res.json({ message: 'Celda eliminada con éxito', id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Arrancar el servidor
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor corriendo en el puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Error al inicializar la base de datos:', err.message);
    process.exit(1);
  });
