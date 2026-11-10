const express  = require('express');
const cors     = require('cors');
const path     = require('path');
require('dotenv').config();

const app = express();

// ── Middleware global ─────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Rutas API ─────────────────────────────────────────────────────────────────
app.use('/api/auth',            require('./routes/auth'));
app.use('/api/usuarios',        require('./routes/usuarios'));
app.use('/api/visitas',         require('./routes/visitas'));
app.use('/api/catalogos',       require('./routes/catalogos'));
app.use('/api/catalogos/bases', require('./routes/bases'));
app.use('/api/informes',        require('./routes/informes'));
app.use('/api/importar',        require('./routes/importar'));
app.use('/api/google',          require('./routes/google-drive'));
app.use('/api/seguimientos',    require('./routes/seguimientos'));
app.use('/api/unidades',        require('./routes/unidades'));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({ status: 'ok', app: 'InovInfo API', version: '1.1.0' });
});

// ── App web estática (SPA) ────────────────────────────────────────────────────
const webDistPath = path.join(__dirname, '..', '..', '..', 'InovInfoWeb', 'web', 'dist');
app.use(express.static(webDistPath));

// Fallback SPA: toda ruta que no sea /api ni /health devuelve index.html
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health') {
        return next();
    }
    res.sendFile(path.join(webDistPath, 'index.html'), (err) => {
        if (err) next(); // Si no existe el dist, cae al 404
    });
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = app;
