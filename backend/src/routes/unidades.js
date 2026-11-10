const router = require('express').Router();
const pool   = require('../config/db');
const { verificarToken } = require('../middleware/auth');

router.use(verificarToken);

// GET /api/unidades/estado?dias=15
// Returns each active unit with its last visit status within the window + open seguimientos count
router.get('/estado', async (req, res) => {
    try {
        const dias = parseInt(req.query.dias, 10) || 15;

        const query = `
            WITH ultima_visita AS (
                SELECT DISTINCT ON (v.unidad_id)
                    v.unidad_id,
                    v.id AS visita_id,
                    ev.nombre AS estado,
                    ev.color_hex,
                    v.created_at AS fecha,
                    v.base_id
                FROM visitas v
                JOIN estados_visita ev ON v.estado_id = ev.id
                WHERE v.created_at >= NOW() - ($1 || ' days')::interval
                ORDER BY v.unidad_id, v.created_at DESC
            ),
            seg_abiertos AS (
                SELECT unidad_id, COUNT(*) AS cnt
                FROM seguimientos
                WHERE estado = 'abierto'
                GROUP BY unidad_id
            )
            SELECT u.id AS unidad_id, u.numero, u.placa,
                   u.sede_id, s.nombre AS sede_nombre,
                   uv.estado AS ultimo_estado,
                   uv.color_hex,
                   uv.fecha AS ultima_fecha,
                   uv.visita_id AS ultima_visita_id,
                   uv.base_id AS ultima_base_id,
                   b.nombre AS ultima_base_nombre,
                   COALESCE(sa.cnt, 0)::int AS seguimientos_abiertos
            FROM unidades u
            LEFT JOIN sedes s ON u.sede_id = s.id
            LEFT JOIN ultima_visita uv ON u.id = uv.unidad_id
            LEFT JOIN bases b ON uv.base_id = b.id
            LEFT JOIN seg_abiertos sa ON u.id = sa.unidad_id
            WHERE u.activa = true
            ORDER BY u.numero
        `;

        const result = await pool.query(query, [dias]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error en GET /api/unidades/estado:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/unidades/:id/suministros-recientes?meses=6
// Returns the most recent use of each supply on this unit within the window
router.get('/:id/suministros-recientes', async (req, res) => {
    try {
        const unidadId = parseInt(req.params.id, 10);
        const meses = parseInt(req.query.meses, 10) || 6;

        const query = `
            SELECT DISTINCT ON (vs.suministro_id)
                vs.suministro_id,
                sm.nombre,
                vs.cantidad,
                v.created_at AS fecha,
                v.id AS visita_id,
                u.nombre AS tecnico_nombre
            FROM visita_suministros vs
            JOIN visitas v ON vs.visita_id = v.id
            JOIN suministros sm ON vs.suministro_id = sm.id
            JOIN usuarios u ON v.tecnico_id = u.id
            WHERE v.unidad_id = $1
              AND v.created_at >= NOW() - ($2 || ' months')::interval
            ORDER BY vs.suministro_id, v.created_at DESC
        `;

        const result = await pool.query(query, [unidadId, meses]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error en GET /api/unidades/:id/suministros-recientes:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
