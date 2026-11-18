const router = require('express').Router();
const pool   = require('../config/db');
const { verificarToken } = require('../middleware/auth');

router.use(verificarToken);

// Middleware: solo coordinadora puede usar estas rutas de gestión
function soloCoordinadora(req, res, next) {
    if (req.usuario.rol !== 'coordinadora') {
        return res.status(403).json({ error: 'Solo la coordinadora puede realizar esta acción' });
    }
    next();
}

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
        res.status(500).json({ error: 'Error al obtener estado de unidades' });
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
        res.status(500).json({ error: 'Error al obtener suministros recientes' });
    }
});

// POST /api/unidades — Crear nueva unidad (solo coordinadora)
router.post('/', soloCoordinadora, async (req, res) => {
    try {
        const { numero, sede_id, activa = true } = req.body;

        if (!numero || !numero.trim()) {
            return res.status(400).json({ error: 'El número de unidad es obligatorio' });
        }

        // Verificar unicidad del número
        const existe = await pool.query('SELECT id FROM unidades WHERE numero = $1', [numero.trim()]);
        if (existe.rows.length > 0) {
            return res.status(409).json({ error: `Ya existe una unidad con el número "${numero.trim()}"` });
        }

        const result = await pool.query(
            `INSERT INTO unidades (numero, sede_id, activa)
             VALUES ($1, $2, $3)
             RETURNING id, numero, placa, sede_id, activa`,
            [numero.trim(), sede_id || null, activa]
        );

        const nueva = result.rows[0];

        // Incluir nombre de sede en la respuesta
        if (nueva.sede_id) {
            const sede = await pool.query('SELECT nombre FROM sedes WHERE id = $1', [nueva.sede_id]);
            nueva.sede_nombre = sede.rows[0]?.nombre || null;
        } else {
            nueva.sede_nombre = null;
        }

        res.status(201).json(nueva);
    } catch (err) {
        console.error('Error en POST /api/unidades:', err.message);
        res.status(500).json({ error: 'Error al crear la unidad' });
    }
});

// PUT /api/unidades/:id — Editar unidad (solo coordinadora)
router.put('/:id', soloCoordinadora, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { numero, sede_id, activa } = req.body;

        // Verificar que existe
        const existeUnidad = await pool.query('SELECT id FROM unidades WHERE id = $1', [id]);
        if (existeUnidad.rows.length === 0) {
            return res.status(404).json({ error: 'Unidad no encontrada' });
        }

        // Si cambia el número, verificar unicidad
        if (numero) {
            const duplicado = await pool.query(
                'SELECT id FROM unidades WHERE numero = $1 AND id != $2',
                [numero.trim(), id]
            );
            if (duplicado.rows.length > 0) {
                return res.status(409).json({ error: `Ya existe una unidad con el número "${numero.trim()}"` });
            }
        }

        // Construir SET dinámico solo con los campos enviados
        const campos = [];
        const params = [];
        let idx = 1;

        if (numero !== undefined) { campos.push(`numero = $${idx++}`); params.push(numero.trim()); }
        if (sede_id !== undefined) { campos.push(`sede_id = $${idx++}`); params.push(sede_id || null); }
        if (activa !== undefined)  { campos.push(`activa = $${idx++}`);  params.push(activa); }

        if (campos.length === 0) {
            return res.status(400).json({ error: 'No se enviaron campos para actualizar' });
        }

        params.push(id);
        const result = await pool.query(
            `UPDATE unidades SET ${campos.join(', ')} WHERE id = $${idx}
             RETURNING id, numero, placa, sede_id, activa`,
            params
        );

        const actualizada = result.rows[0];

        if (actualizada.sede_id) {
            const sede = await pool.query('SELECT nombre FROM sedes WHERE id = $1', [actualizada.sede_id]);
            actualizada.sede_nombre = sede.rows[0]?.nombre || null;
        } else {
            actualizada.sede_nombre = null;
        }

        res.json(actualizada);
    } catch (err) {
        console.error('Error en PUT /api/unidades/:id:', err.message);
        res.status(500).json({ error: 'Error al actualizar la unidad' });
    }
});

// DELETE /api/unidades/:id — Eliminar o desactivar unidad (solo coordinadora)
// Si tiene visitas asociadas, solo desactiva. Si no tiene, elimina.
router.delete('/:id', soloCoordinadora, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        const existeUnidad = await pool.query('SELECT id, numero FROM unidades WHERE id = $1', [id]);
        if (existeUnidad.rows.length === 0) {
            return res.status(404).json({ error: 'Unidad no encontrada' });
        }

        const { numero } = existeUnidad.rows[0];

        // Verificar si tiene visitas
        const visitas = await pool.query(
            'SELECT COUNT(*) AS cnt FROM visitas WHERE unidad_id = $1',
            [id]
        );
        const tieneVisitas = parseInt(visitas.rows[0].cnt, 10) > 0;

        if (tieneVisitas) {
            // Solo desactivar — no eliminar para preservar historial
            await pool.query('UPDATE unidades SET activa = false WHERE id = $1', [id]);
            return res.json({
                eliminada: false,
                desactivada: true,
                mensaje: `La unidad "${numero}" tiene visitas registradas y fue desactivada en lugar de eliminada.`,
            });
        }

        // Sin visitas: eliminar definitivamente
        await pool.query('DELETE FROM unidades WHERE id = $1', [id]);
        res.json({
            eliminada: true,
            desactivada: false,
            mensaje: `Unidad "${numero}" eliminada correctamente.`,
        });
    } catch (err) {
        console.error('Error en DELETE /api/unidades/:id:', err.message);
        res.status(500).json({ error: 'Error al eliminar la unidad' });
    }
});

module.exports = router;
