const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool   = require('../config/db');
const { verificarToken, soloCoordinadora } = require('../middleware/auth');

// Todas las rutas requieren token + coordinadora
router.use(verificarToken, soloCoordinadora);

// GET /api/usuarios
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT u.id, u.nombre, u.email, u.rol, u.activo,
                   COALESCE(json_agg(pu.permiso) FILTER (WHERE pu.permiso IS NOT NULL), '[]'::json) AS permisos
            FROM usuarios u
            LEFT JOIN permisos_usuario pu ON u.id = pu.usuario_id
            GROUP BY u.id
            ORDER BY u.rol, u.nombre
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('[USUARIOS ERROR]', err.message, err.stack);
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/usuarios/:id/permisos
router.put('/:id/permisos', async (req, res) => {
    const { permisos } = req.body; // array de strings
    const { id } = req.params;

    const PERMISOS_VALIDOS = ['EDITAR_CATALOGOS', 'VER_TODAS_VISITAS', 'EXPORTAR_SHEETS'];

    if (!Array.isArray(permisos) || permisos.some(p => !PERMISOS_VALIDOS.includes(p))) {
        return res.status(400).json({ error: 'Permisos inválidos' });
    }

    try {
        await pool.query('DELETE FROM permisos_usuario WHERE usuario_id = $1', [id]);

        for (const permiso of permisos) {
            await pool.query(
                'INSERT INTO permisos_usuario (usuario_id, permiso) VALUES ($1, $2)',
                [id, permiso]
            );
        }
        res.json({ mensaje: 'Permisos actualizados' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/usuarios/:id/estado  (activar/desactivar)
router.put('/:id/estado', async (req, res) => {
    const { activo } = req.body;
    try {
        await pool.query('UPDATE usuarios SET activo = $1 WHERE id = $2', [activo, req.params.id]);
        res.json({ mensaje: 'Estado actualizado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/usuarios/:id/password
router.put('/:id/password', async (req, res) => {
    const { password } = req.body;
    if (!password || password.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }
    try {
        const hash = await bcrypt.hash(password, 12);
        await pool.query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [hash, req.params.id]);
        res.json({ mensaje: 'Contraseña actualizada' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
