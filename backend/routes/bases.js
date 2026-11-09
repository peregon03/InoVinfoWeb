const express = require('express');
const router = express.Router();
const pool = require('../db');
const { verificarToken, verificarRol } = require('../middleware/auth');

// GET /api/catalogos/bases - Listar bases (autenticado)
router.get('/', verificarToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nombre, activa, created_at FROM bases ORDER BY nombre'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error al listar bases:', error);
    res.status(500).json({ error: 'Error al obtener bases' });
  }
});

// POST /api/catalogos/bases - Crear base (coordinadora)
router.post('/', verificarToken, verificarRol('coordinadora'), async (req, res) => {
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
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una base con ese nombre' });
    }
    console.error('Error al crear base:', error);
    res.status(500).json({ error: 'Error al crear base' });
  }
});

// PUT /api/catalogos/bases/:id - Actualizar base (coordinadora)
router.put('/:id', verificarToken, verificarRol('coordinadora'), async (req, res) => {
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
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una base con ese nombre' });
    }
    console.error('Error al actualizar base:', error);
    res.status(500).json({ error: 'Error al actualizar base' });
  }
});

module.exports = router;
