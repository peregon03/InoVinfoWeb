const router  = require('express').Router();
const multer  = require('multer');
const pool    = require('../config/db');
const { verificarToken, coordinadoraOPermiso } = require('../middleware/auth');
const { subirFotoDrive } = require('../config/google');

// Multer: almacenamiento en memoria (buffer directo → Drive, sin disco)
const upload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (['image/jpeg', 'image/png'].includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten imágenes JPEG o PNG'));
        }
    },
});

router.use(verificarToken);

// GET /api/visitas
router.get('/', async (req, res) => {
    try {
        const unidadId = req.query.unidad_id ? parseInt(req.query.unidad_id, 10) : null;

        const condiciones = [];
        const params      = [];
        let paramIndex    = 1;

        if (unidadId) {
            condiciones.push(`v.unidad_id = $${paramIndex++}`);
            params.push(unidadId);
        }

        const whereClause = condiciones.length > 0
            ? 'WHERE ' + condiciones.join(' AND ')
            : '';

        // MODIFIED: added new columns, COALESCE for sede, LEFT JOINs for bases and sedes
        const query = `
            SELECT v.id, v.created_at, v.requiere_seguimiento,
                   v.fecha_seguimiento, v.nota_seguimiento,
                   v.novedad_texto, v.observacion_estructurada,
                   v.sede_id, v.base_id, v.atraso_hora_min, v.dias_grabacion,
                   v.h264_plus, v.checklist, v.es_extraordinaria, v.es_otra_sede,
                   u2.nombre  AS tecnico_nombre,
                   un.id      AS unidad_id,
                   un.numero  AS unidad_numero,
                   COALESCE(sv.nombre, su.nombre) AS sede_nombre,
                   b.nombre   AS base_nombre,
                   ev.nombre  AS estado,
                   ev.color_hex,
                   COALESCE(
                       json_agg(
                           json_build_object('nombre', sm.nombre, 'cantidad', vs.cantidad)
                       ) FILTER (WHERE sm.id IS NOT NULL), '[]'
                   ) AS suministros,
                   COALESCE(
                       json_agg(DISTINCT vf.url) FILTER (WHERE vf.id IS NOT NULL), '[]'
                   ) AS fotos
            FROM visitas v
            JOIN usuarios u2       ON v.tecnico_id   = u2.id
            JOIN unidades un       ON v.unidad_id    = un.id
            LEFT JOIN sedes sv     ON v.sede_id      = sv.id
            LEFT JOIN sedes su     ON un.sede_id     = su.id
            LEFT JOIN bases b      ON v.base_id      = b.id
            JOIN estados_visita ev ON v.estado_id    = ev.id
            LEFT JOIN visita_suministros vs ON v.id  = vs.visita_id
            LEFT JOIN suministros sm        ON vs.suministro_id = sm.id
            LEFT JOIN visita_fotos vf       ON v.id  = vf.visita_id
            ${whereClause}
            GROUP BY v.id, u2.nombre, un.id, un.numero, sv.nombre, su.nombre,
                     b.nombre, ev.nombre, ev.color_hex
            ORDER BY v.created_at DESC
        `;

        const result = await pool.query(query, params);

        // NEW: add fotos_detalle for each visit (for the web app)
        for (const row of result.rows) {
            const fotosRes = await pool.query(
                'SELECT id, url, COALESCE(tipo, \'despues\') as tipo, drive_file_id FROM visita_fotos WHERE visita_id = $1 ORDER BY orden, id',
                [row.id]
            );
            row.fotos_detalle = fotosRes.rows;
            row.fotos_count = fotosRes.rows.length;

            // v2: seguimiento info per visit
            const segCreado = await pool.query(
                'SELECT id, nota FROM seguimientos WHERE visita_origen_id = $1',
                [row.id]
            );
            row.seguimiento_creado = segCreado.rows.length > 0 ? segCreado.rows[0] : null;

            const segResuelto = await pool.query(
                'SELECT id, nota, comentario_resolucion FROM seguimientos WHERE visita_resolucion_id = $1',
                [row.id]
            );
            row.seguimiento_resuelto = segResuelto.rows.length > 0 ? segResuelto.rows[0] : null;
        }

        res.json(result.rows);

    } catch (err) {
        console.error('Error en GET /api/visitas:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/visitas/hoy
router.get('/hoy', async (req, res) => {
    try {
        // MODIFIED: COALESCE for sede, LEFT JOINs
        const query = `
            SELECT v.id, un.id AS unidad_id, un.numero AS unidad_numero,
                   COALESCE(sv.nombre, su.nombre) AS sede_nombre,
                   COALESCE(v.sede_id, su.id) AS sede_id,
                   ev.nombre AS estado, ev.color_hex, u2.nombre AS tecnico_nombre,
                   v.observacion_estructurada,
                   (SELECT COUNT(*) FROM visita_fotos vf WHERE vf.visita_id = v.id) AS fotos_count
            FROM visitas v
            JOIN unidades un       ON v.unidad_id  = un.id
            LEFT JOIN sedes sv     ON v.sede_id    = sv.id
            LEFT JOIN sedes su     ON un.sede_id   = su.id
            JOIN estados_visita ev ON v.estado_id  = ev.id
            JOIN usuarios u2       ON v.tecnico_id = u2.id
            WHERE DATE(v.created_at AT TIME ZONE 'America/Bogota') = (NOW() AT TIME ZONE 'America/Bogota')::date
            ORDER BY v.created_at DESC
        `;

        const result = await pool.query(query, []);
        res.json(result.rows);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/visitas/pendientes
// v2: reads from seguimientos table but keeps the same response shape for Android compatibility
router.get('/pendientes', async (req, res) => {
    try {
        const query = `
            SELECT s.id, s.unidad_id, un.numero AS unidad_numero,
                   COALESCE(su.nombre) AS sede_nombre,
                   COALESCE(s.fecha_recordatorio, s.created_at::date) AS fecha_seguimiento,
                   s.nota AS nota_seguimiento,
                   u2.nombre AS tecnico_nombre,
                   CASE
                       WHEN s.fecha_recordatorio IS NULL THEN 'futuro'
                       WHEN s.fecha_recordatorio < (NOW() AT TIME ZONE 'America/Bogota')::date THEN 'vencido'
                       WHEN s.fecha_recordatorio = (NOW() AT TIME ZONE 'America/Bogota')::date THEN 'hoy'
                       ELSE 'futuro'
                   END AS urgencia
            FROM seguimientos s
            JOIN unidades un   ON s.unidad_id = un.id
            LEFT JOIN sedes su ON un.sede_id  = su.id
            LEFT JOIN usuarios u2 ON s.creado_por = u2.id
            WHERE s.estado = 'abierto'
            ORDER BY COALESCE(s.fecha_recordatorio, '9999-12-31'::date) ASC, s.created_at ASC
        `;

        const result = await pool.query(query, []);
        res.json(result.rows);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/visitas/progreso
router.get('/progreso', async (req, res) => {
    try {
        const dias = parseInt(req.query.dias, 10) || 15;

        const visitadasRes = await pool.query(`
            SELECT COUNT(DISTINCT unidad_id) AS visitadas
            FROM visitas
            WHERE created_at >= NOW() - ($1 || ' days')::interval
        `, [dias]);

        const totalRes = await pool.query('SELECT COUNT(*) AS total FROM unidades WHERE activa = true');

        res.json({
            visitadas: parseInt(visitadasRes.rows[0].visitadas, 10),
            total:     parseInt(totalRes.rows[0].total, 10),
            dias,
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/visitas
router.post('/', async (req, res) => {
    const {
        unidad_id, estado_id, novedad_texto, observacion_estructurada,
        requiere_seguimiento, fecha_seguimiento, nota_seguimiento,
        suministros,
        // NEW optional fields
        sede_id, base_id, atraso_hora_min, dias_grabacion,
        h264_plus, checklist, es_extraordinaria, es_otra_sede,
        // v2: seguimientos
        seguimiento, seguimientos_revisados
    } = req.body;

    if (!unidad_id || !estado_id) {
        return res.status(400).json({ error: 'Unidad y estado son requeridos' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // MODIFIED: expanded INSERT with new columns
        const visitaResult = await client.query(`
            INSERT INTO visitas
                (unidad_id, tecnico_id, estado_id, novedad_texto,
                 observacion_estructurada, requiere_seguimiento,
                 fecha_seguimiento, nota_seguimiento,
                 sede_id, base_id, atraso_hora_min, dias_grabacion,
                 h264_plus, checklist, es_extraordinaria, es_otra_sede)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
            RETURNING *
        `, [
            unidad_id, req.usuario.id, estado_id, novedad_texto || null,
            observacion_estructurada || null, requiere_seguimiento || false,
            fecha_seguimiento || null, nota_seguimiento || null,
            sede_id || null, base_id || null,
            atraso_hora_min != null ? Number(atraso_hora_min) : null,
            dias_grabacion != null ? Number(dias_grabacion) : null,
            h264_plus != null ? h264_plus : null,
            checklist ? JSON.stringify(checklist) : null,
            es_extraordinaria || false, es_otra_sede || false
        ]);

        const visita = visitaResult.rows[0];

        if (suministros && suministros.length > 0) {
            for (const s of suministros) {
                await client.query(
                    'INSERT INTO visita_suministros (visita_id, suministro_id, cantidad) VALUES ($1,$2,$3)',
                    [visita.id, s.suministro_id, s.cantidad || 1]
                );
            }
        }

        // v2: Create seguimiento if provided (web path)
        if (seguimiento && seguimiento.nota) {
            await client.query(`
                INSERT INTO seguimientos (unidad_id, visita_origen_id, nota, fecha_recordatorio, creado_por, created_at)
                VALUES ($1, $2, $3, $4, $5, NOW())
            `, [unidad_id, visita.id, seguimiento.nota, seguimiento.fecha_recordatorio || null, req.usuario.id]);
        }
        // v2: Android legacy path — if requiere_seguimiento came from Android, also create a seguimiento row
        else if (requiere_seguimiento && nota_seguimiento && !seguimiento) {
            await client.query(`
                INSERT INTO seguimientos (unidad_id, visita_origen_id, nota, fecha_recordatorio, creado_por, created_at)
                VALUES ($1, $2, $3, $4, $5, NOW())
                ON CONFLICT DO NOTHING
            `, [unidad_id, visita.id, nota_seguimiento, fecha_seguimiento || null, req.usuario.id]);
        }

        // v2: Process reviewed seguimientos
        if (seguimientos_revisados && seguimientos_revisados.length > 0) {
            for (const sr of seguimientos_revisados) {
                // Validate: seguimiento must belong to this unit and be open
                const check = await client.query(
                    'SELECT id FROM seguimientos WHERE id = $1 AND unidad_id = $2 AND estado = $3',
                    [sr.id, unidad_id, 'abierto']
                );
                if (check.rows.length === 0) continue;

                if (sr.solucionado) {
                    // Close the seguimiento
                    await client.query(`
                        UPDATE seguimientos
                        SET estado = 'resuelto', resuelto_por = $1, resuelto_at = NOW(),
                            visita_resolucion_id = $2, comentario_resolucion = $3
                        WHERE id = $4
                    `, [req.usuario.id, visita.id, sr.comentario || null, sr.id]);
                } else {
                    // "Sigue pendiente" — log a revision
                    await client.query(`
                        INSERT INTO seguimiento_revisiones (seguimiento_id, visita_id, comentario, created_at)
                        VALUES ($1, $2, $3, NOW())
                    `, [sr.id, visita.id, sr.comentario || null]);
                }
            }
        }

        await client.query('COMMIT');
        res.status(201).json(visita);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error en POST /api/visitas:', err.message);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// POST /api/visitas/:id/fotos
router.post('/:id/fotos', upload.single('foto'), async (req, res) => {
    const visitaId = parseInt(req.params.id, 10);
    // NEW: accept 'tipo' field
    const tipo = req.body.tipo || 'despues';

    if (!req.file) {
        return res.status(400).json({ error: 'Se requiere el campo "foto"' });
    }

    try {
        const visitaCheck = await pool.query(
            `SELECT v.id, v.tecnico_id,
                    COALESCE(sv.nombre, su.nombre) AS sede_nombre
             FROM visitas v
             JOIN unidades u   ON v.unidad_id = u.id
             LEFT JOIN sedes sv ON v.sede_id  = sv.id
             LEFT JOIN sedes su ON u.sede_id  = su.id
             WHERE v.id = $1`,
            [visitaId]
        );
        if (visitaCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Visita no encontrada' });
        }
        const visita         = visitaCheck.rows[0];
        const esCoordinadora = req.usuario.rol === 'coordinadora';
        const esDueno        = visita.tecnico_id === req.usuario.id;
        if (!esCoordinadora && !esDueno) {
            return res.status(403).json({ error: 'Sin permiso para esta visita' });
        }

        const ordenRes = await pool.query(
            'SELECT COALESCE(MAX(orden), 0) + 1 AS siguiente FROM visita_fotos WHERE visita_id = $1',
            [visitaId]
        );
        const orden = ordenRes.rows[0].siguiente;

        const fileName = `visita_${visitaId}_${tipo}_${orden}_${Date.now()}.jpg`;
        const url      = await subirFotoDrive(req.file.buffer, fileName, req.file.mimetype, visita.sede_nombre);

        // NEW: extract drive_file_id from URL and save tipo
        let driveFileId = null;
        const match = url.match(/[?&]id=([^&]+)/);
        if (match) driveFileId = match[1];

        const insertRes = await pool.query(
            'INSERT INTO visita_fotos (visita_id, url, orden, tipo, drive_file_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, url',
            [visitaId, url, orden, tipo, driveFileId]
        );

        res.status(201).json(insertRes.rows[0]);

    } catch (err) {
        console.error('Error subiendo foto:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/visitas/:id/fotos/:fotoId
router.delete('/:id/fotos/:fotoId', async (req, res) => {
    const visitaId = parseInt(req.params.id,     10);
    const fotoId   = parseInt(req.params.fotoId, 10);

    try {
        const visitaCheck = await pool.query(
            'SELECT id, tecnico_id FROM visitas WHERE id = $1',
            [visitaId]
        );
        if (visitaCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Visita no encontrada' });
        }
        const esCoordinadora = req.usuario.rol === 'coordinadora';
        const esDueno        = visitaCheck.rows[0].tecnico_id === req.usuario.id;
        if (!esCoordinadora && !esDueno) {
            return res.status(403).json({ error: 'Sin permiso para esta visita' });
        }

        const deleteRes = await pool.query(
            'DELETE FROM visita_fotos WHERE id = $1 AND visita_id = $2 RETURNING id',
            [fotoId, visitaId]
        );
        if (deleteRes.rows.length === 0) {
            return res.status(404).json({ error: 'Foto no encontrada' });
        }

        res.json({ mensaje: 'Foto eliminada' });

    } catch (err) {
        console.error('Error eliminando foto:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/visitas/:id
router.delete('/:id', async (req, res) => {
    if (req.usuario.rol !== 'coordinadora') {
        return res.status(403).json({ error: 'Solo la coordinadora puede eliminar visitas' });
    }

    const visitaId = parseInt(req.params.id, 10);
    const client   = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query('DELETE FROM visita_fotos       WHERE visita_id = $1', [visitaId]);
        await client.query('DELETE FROM visita_suministros WHERE visita_id = $1', [visitaId]);

        const deleteRes = await client.query(
            'DELETE FROM visitas WHERE id = $1 RETURNING id',
            [visitaId]
        );

        if (deleteRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Visita no encontrada' });
        }

        await client.query('COMMIT');
        res.json({ mensaje: 'Visita eliminada' });

    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

module.exports = router;
