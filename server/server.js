const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// Conectar a SQLite (crea el archivo automáticamente si no existe)
const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) {
    console.error('Error al conectar con SQLite', err.message);
  } else {
    console.log('Conectado a la base de datos SQLite.');
  }
});

// Crear una tabla inicial para las celdas de la hoja si no existe
db.run(`CREATE TABLE IF NOT EXISTS cells (
  id TEXT PRIMARY KEY,
  value TEXT,
  marked INTEGER NOT NULL DEFAULT 0
)`);

// Migracion: anadir la columna marked a bases de datos ya existentes
db.all("PRAGMA table_info(cells)", [], (err, columnas) => {
  if (err || !columnas.some((c) => c.name === 'marked')) {
    db.run('ALTER TABLE cells ADD COLUMN marked INTEGER NOT NULL DEFAULT 0', (errAlt) => {
      if (errAlt) console.error('No se pudo añadir la columna marked', errAlt.message);
    });
  }
});

// 1. Ruta para obtener todas las celdas guardadas
app.get('/api/cells', (req, res) => {
  db.all("SELECT * FROM cells", [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ cells: rows });
  });
});

// 2. Ruta para guardar o actualizar una celda (valor + estado de formato)
app.post('/api/cells', (req, res) => {
  const { id, value, marked } = req.body;

  if (typeof id !== 'string' || id.length === 0) {
    res.status(400).json({ error: 'El id de la celda es obligatorio' });
    return;
  }

  const valor = typeof value === 'string' ? value : '';
  const marcado = marked ? 1 : 0;

  const query = `INSERT INTO cells (id, value, marked) VALUES (?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET value = excluded.value, marked = excluded.marked`;

  db.run(query, [id, valor, marcado], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: 'Celda actualizada con éxito', id, value: valor, marked: Boolean(marcado) });
  });
});

// 3. Ruta para borrar una celda
app.delete('/api/cells/:id', (req, res) => {
  db.run('DELETE FROM cells WHERE id = ?', [req.params.id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: 'La celda no existe', id: req.params.id });
      return;
    }
    res.json({ message: 'Celda eliminada con éxito', id: req.params.id });
  });
});

// Arrancar el servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});