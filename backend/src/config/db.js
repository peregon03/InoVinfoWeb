const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  // Zona horaria Colombia configurada a nivel de conexión PostgreSQL
  // (evita race condition del antiguo pool.on('connect') sin await)
  options:  '-c timezone=America/Bogota',
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL:', err.message);
});

module.exports = pool;
