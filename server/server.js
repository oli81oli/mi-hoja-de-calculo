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
  value TEXT
)`);

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

// 2. Ruta para guardar o actualizar una celda
app.post('/api/cells', (req, res) => {
  const { id, value } = req.body;
  
  const query = `INSERT INTO cells (id, value) VALUES (?, ?) 
                 ON CONFLICT(id) DO UPDATE SET value = ?`;
  
  db.run(query, [id, value, value], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: 'Celda actualizada con éxito', id, value });
  });
});

// Arrancar el servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});