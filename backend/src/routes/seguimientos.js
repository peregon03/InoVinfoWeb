const router = require('express').Router();
const pool   = require('../config/db');
const { verificarToken } = require('../middleware/auth');

router.use(verificarToken);

// GET /api/seguimientos?unidad_id=X&estado=abierto
router.get('/', async (req, res) => {
    try {
        const { unidad_id, estado } = req.query;
        const condiciones = [];
        const params = [];
        let idx = 1;

        if (unidad_id) {
            condiciones.push(`s.unidad_id = $${idx++}`);
            params.push(parseInt(unidad_id, 10));
        }
        if (estado) {
            condiciones.push(`s.estado = $${idx++}`);
            params.push(estado);
        }

        const where = condiciones.length > 0 ? 'WHERE ' + condiciones.join(' AND ') : '';

        const query = `
            SELECT s.id, s.unidad_id, s.nota, s.fecha_recordatorio,
                   u.nombre AS creado_por_nombre,
                   s.created_at, s.estado,
                   (SELECT json_build_object('comentario', sr.comentario, 'created_at', sr.created_at)
                    FROM seguimiento_revisiones sr
                    WHERE sr.seguimiento_id = s.id
                    ORDER BY sr.created_at DESC LIMIT 1
                   ) AS ultima_revision
            FROM seguimientos s
            LEFT JOIN usuarios u ON s.creado_por = u.id
            ${where}
            ORDER BY s.created_at DESC
        `;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error en GET /api/seguimientos:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
