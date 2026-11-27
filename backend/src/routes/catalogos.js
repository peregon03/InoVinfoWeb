const router = require('express').Router();
const pool   = require('../config/db');
const { verificarToken, coordinadoraOPermiso } = require('../middleware/auth');

router.use(verificarToken);

// ── Sedes ────────────────────────────────────────────────────────────────────

router.get('/sedes', async (req, res) => {
    try {
        const r = await pool.query('SELECT id, nombre, activa, created_at FROM sedes ORDER BY nombre');
        res.json(r.rows);
    } catch (err) {
        console.error('Error GET /catalogos/sedes:', err.message);
        res.status(500).json({ error: 'Error al obtener sedes' });
    }
});

router.post('/sedes', coordinadoraOPermiso('EDITAR_CATALOGOS'), async (req, res) => {
    const { nombre } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'Nombre requerido' });
    try {
        const r = await pool.query('INSERT INTO sedes (nombre) VALUES ($1) RETURNING *', [nombre.trim()]);
        res.status(201).json(r.rows[0]);
    } catch (err) {
        console.error('Error POST /catalogos/sedes:', err.message);
        res.status(500).json({ error: 'Error al crear sede' });
    }
});

router.put('/sedes/:id', coordinadoraOPermiso('EDITAR_CATALOGOS'), async (req, res) => {
    const { nombre, activa } = req.body;
    try {
        await pool.query('UPDATE sedes SET nombre = COALESCE($1, nombre), activa = COALESCE($2, activa) WHERE id = $3',
            [nombre || null, activa != null ? activa : null, req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        console.error('Error PUT /catalogos/sedes:', err.message);
        res.status(500).json({ error: 'Error al actualizar sede' });
    }
});

// ── Unidades ─────────────────────────────────────────────────────────────────

router.get('/unidades', async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT u.id, u.numero, u.placa, u.sede_id, s.nombre AS sede_nombre, u.activa
            FROM unidades u LEFT JOIN sedes s ON u.sede_id = s.id ORDER BY u.numero
        `);
        res.json(r.rows);
    } catch (err) {
        console.error('Error GET /catalogos/unidades:', err.message);
        res.status(500).json({ error: 'Error al obtener unidades' });
    }
});

router.post('/unidades', coordinadoraOPermiso('EDITAR_CATALOGOS'), async (req, res) => {
    const { numero, sede_id } = req.body;
    if (!numero || !numero.trim()) return res.status(400).json({ error: 'Número requerido' });
    try {
        const r = await pool.query('INSERT INTO unidades (numero, sede_id) VALUES ($1, $2) RETURNING *',
            [numero.trim(), sede_id || null]);
        res.status(201).json(r.rows[0]);
    } catch (err) {
        console.error('Error POST /catalogos/unidades:', err.message);
        res.status(500).json({ error: 'Error al crear unidad' });
    }
});

router.put('/unidades/:id', coordinadoraOPermiso('EDITAR_CATALOGOS'), async (req, res) => {
    const { numero, sede_id, activa } = req.body;
    try {
        await pool.query('UPDATE unidades SET numero = COALESCE($1, numero), sede_id = COALESCE($2, sede_id), activa = COALESCE($3, activa) WHERE id = $4',
            [numero || null, sede_id || null, activa != null ? activa : null, req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        console.error('Error PUT /catalogos/unidades:', err.message);
        res.status(500).json({ error: 'Error al actualizar unidad' });
    }
});

// ── Suministros ──────────────────────────────────────────────────────────────

router.get('/suministros', async (req, res) => {
    try {
        const r = await pool.query('SELECT id, nombre, categoria, precio_ref, texto_informe, activo FROM suministros ORDER BY nombre');
        res.json(r.rows);
    } catch (err) {
        console.error('Error GET /catalogos/suministros:', err.message);
        res.status(500).json({ error: 'Error al obtener suministros' });
    }
});

router.post('/suministros', coordinadoraOPermiso('EDITAR_CATALOGOS'), async (req, res) => {
    const { nombre } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'Nombre requerido' });
    try {
        const r = await pool.query('INSERT INTO suministros (nombre) VALUES ($1) RETURNING *', [nombre.trim()]);
        res.status(201).json(r.rows[0]);
    } catch (err) {
        console.error('Error POST /catalogos/suministros:', err.message);
        res.status(500).json({ error: 'Error al crear suministro' });
    }
});

router.put('/suministros/:id', coordinadoraOPermiso('EDITAR_CATALOGOS'), async (req, res) => {
    const { nombre, activo } = req.body;
    try {
        // Solo actualizar texto_informe si viene explícitamente en el body
        if ('texto_informe' in req.body) {
            const ti = req.body.texto_informe ? req.body.texto_informe.trim() || null : null;
            await pool.query(
                'UPDATE suministros SET nombre = COALESCE($1, nombre), activo = COALESCE($2, activo), texto_informe = $3 WHERE id = $4',
                [nombre || null, activo != null ? activo : null, ti, req.params.id]
            );
        } else {
            await pool.query(
                'UPDATE suministros SET nombre = COALESCE($1, nombre), activo = COALESCE($2, activo) WHERE id = $3',
                [nombre || null, activo != null ? activo : null, req.params.id]
            );
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('Error PUT /catalogos/suministros:', err.message);
        res.status(500).json({ error: 'Error al actualizar suministro' });
    }
});

router.delete('/suministros/:id', coordinadoraOPermiso('EDITAR_CATALOGOS'), async (req, res) => {
    try {
        const usado = await pool.query(
            'SELECT 1 FROM visita_suministros WHERE suministro_id = $1 LIMIT 1',
            [req.params.id]
        );
        if (usado.rows.length > 0) {
            return res.status(409).json({ error: 'No se puede eliminar: este suministro ya fue usado en visitas. Desactívelo en su lugar.' });
        }
        const r = await pool.query('DELETE FROM suministros WHERE id = $1 RETURNING id', [req.params.id]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Suministro no encontrado' });
        res.json({ ok: true });
    } catch (err) {
        console.error('Error DELETE /catalogos/suministros:', err.message);
        res.status(500).json({ error: 'Error al eliminar suministro' });
    }
});

// ── Estados de visita ────────────────────────────────────────────────────────

router.get('/estados', async (req, res) => {
    try {
        const r = await pool.query('SELECT id, nombre, color_hex, activo FROM estados_visita ORDER BY id');
        res.json(r.rows);
    } catch (err) {
        console.error('Error GET /catalogos/estados:', err.message);
        res.status(500).json({ error: 'Error al obtener estados' });
    }
});

// ── Tipos de novedad ─────────────────────────────────────────────────────────

router.get('/tipos-novedad', async (req, res) => {
    try {
        const r = await pool.query('SELECT id, nombre, requiere_descripcion, activo FROM tipos_novedad ORDER BY nombre');
        res.json(r.rows);
    } catch (err) {
        console.error('Error GET /catalogos/tipos-novedad:', err.message);
        res.status(500).json({ error: 'Error al obtener tipos de novedad' });
    }
});

router.post('/tipos-novedad', coordinadoraOPermiso('EDITAR_CATALOGOS'), async (req, res) => {
    const { nombre } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'Nombre requerido' });
    try {
        const r = await pool.query('INSERT INTO tipos_novedad (nombre) VALUES ($1) RETURNING *', [nombre.trim()]);
        res.status(201).json(r.rows[0]);
    } catch (err) {
        console.error('Error POST /catalogos/tipos-novedad:', err.message);
        res.status(500).json({ error: 'Error al crear tipo de novedad' });
    }
});

module.exports = router;
