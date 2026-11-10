const router = require('express').Router();
const pool   = require('../config/db');
const { verificarToken, soloCoordinadora } = require('../middleware/auth');

router.use(verificarToken);

// GET /api/catalogos/bases
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, nombre, activa, created_at FROM bases ORDER BY nombre'
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error al listar bases:', err.message);
        res.status(500).json({ error: 'Error al obtener bases' });
    }
});

// POST /api/catalogos/bases
router.post('/', soloCoordinadora, async (req, res) => {
    try {
        const { nombre } = req.body;
        if (!nombre || !nombre.trim()) {
            return res.status(400).json({ error: 'El nombre es requerido' });
        }
        const result = await pool.query(
            'INSERT INTO bases (nombre) VALUES ($1) RETURNING id, nombre, activa, created_at',
            [nombre.trim()]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Ya existe una base con ese nombre' });
        }
        console.error('Error al crear base:', err.message);
        res.status(500).json({ error: 'Error al crear base' });
    }
});

// PUT /api/catalogos/bases/:id
router.put('/:id', soloCoordinadora, async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, activa } = req.body;
        const result = await pool.query(
            'UPDATE bases SET nombre = COALESCE($1, nombre), activa = COALESCE($2, activa) WHERE id = $3 RETURNING id, nombre, activa, created_at',
            [nombre?.trim() || null, activa, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Base no encontrada' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Ya existe una base con ese nombre' });
        }
        console.error('Error al actualizar base:', err.message);
        res.status(500).json({ error: 'Error al actualizar base' });
    }
});

module.exports = router;
