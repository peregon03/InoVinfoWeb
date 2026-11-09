/**
 * PARCHE PARA routes/visitas.js
 *
 * Este archivo contiene las versiones MODIFICADAS de los handlers de visitas.
 * No es un archivo ejecutable — es una referencia para aplicar los cambios
 * al archivo existente ~/InovInfo/backend/routes/visitas.js
 *
 * CAMBIOS:
 * 1. POST /api/visitas — acepta campos nuevos (sede_id, base_id, etc.)
 * 2. GET /api/visitas — devuelve campos nuevos + fotos_detalle
 * 3. POST /api/visitas/:id/fotos — acepta tipo + sube a Drive
 */

// ============================================================
// 1. CREAR VISITA — POST /api/visitas
// Reemplazar el handler actual con esta versión ampliada
// ============================================================
async function crearVisita(req, res) {
  const pool = req.app.locals.pool || require('../db');
  const client = await pool.connect();

  try {
    const {
      unidad_id, estado_id, novedad_texto, observacion_estructurada,
      requiere_seguimiento, fecha_seguimiento, nota_seguimiento,
      suministros = [],
      // Campos nuevos (todos opcionales)
      sede_id, base_id, atraso_hora_min, dias_grabacion,
      h264_plus, checklist, es_extraordinaria, es_otra_sede
    } = req.body;

    if (!unidad_id || !estado_id) {
      return res.status(400).json({ error: 'unidad_id y estado_id son requeridos' });
    }

    await client.query('BEGIN');

    const visitaResult = await client.query(
      `INSERT INTO visitas (
        unidad_id, tecnico_id, estado_id, novedad_texto, observacion_estructurada,
        requiere_seguimiento, fecha_seguimiento, nota_seguimiento,
        sede_id, base_id, atraso_hora_min, dias_grabacion, h264_plus,
        checklist, es_extraordinaria, es_otra_sede
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING id`,
      [
        unidad_id, req.usuario.id, estado_id,
        novedad_texto || null, observacion_estructurada || null,
        requiere_seguimiento || false, fecha_seguimiento || null, nota_seguimiento || null,
        sede_id || null, base_id || null,
        atraso_hora_min != null ? Number(atraso_hora_min) : null,
        dias_grabacion != null ? Number(dias_grabacion) : null,
        h264_plus != null ? h264_plus : null,
        checklist ? JSON.stringify(checklist) : null,
        es_extraordinaria || false, es_otra_sede || false
      ]
    );

    const visitaId = visitaResult.rows[0].id;

    // Insertar suministros
    for (const s of suministros) {
      if (s.suministro_id && s.cantidad) {
        await client.query(
          'INSERT INTO visita_suministros (visita_id, suministro_id, cantidad) VALUES ($1, $2, $3)',
          [visitaId, s.suministro_id, s.cantidad]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ id: visitaId });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al crear visita:', error);
    res.status(500).json({ error: 'Error al crear la visita' });
  } finally {
    client.release();
  }
}

// ============================================================
// 2. LISTAR VISITAS — GET /api/visitas
// Reemplazar la consulta principal
// ============================================================
async function listarVisitas(req, res) {
  const pool = req.app.locals.pool || require('../db');

  try {
    const { unidad_id } = req.query;
    let query = `
      SELECT
        v.id, v.unidad_id, v.tecnico_id, v.estado_id,
        v.novedad_texto, v.observacion_estructurada,
        v.requiere_seguimiento, v.fecha_seguimiento, v.nota_seguimiento,
        v.sincronizado, v.created_at,
        v.sede_id, v.base_id, v.atraso_hora_min, v.dias_grabacion,
        v.h264_plus, v.checklist, v.es_extraordinaria, v.es_otra_sede,
        ev.nombre as estado, ev.color_hex,
        u.numero as unidad_numero,
        COALESCE(sv.nombre, su.nombre) as sede_nombre,
        b.nombre as base_nombre,
        t.nombre as tecnico_nombre
      FROM visitas v
      JOIN estados_visita ev ON v.estado_id = ev.id
      JOIN unidades u ON v.unidad_id = u.id
      LEFT JOIN sedes sv ON v.sede_id = sv.id
      LEFT JOIN sedes su ON u.sede_id = su.id
      LEFT JOIN bases b ON v.base_id = b.id
      JOIN usuarios t ON v.tecnico_id = t.id
    `;
    const params = [];

    if (unidad_id) {
      query += ' WHERE v.unidad_id = $1';
      params.push(unidad_id);
    }

    query += ' ORDER BY v.created_at DESC';

    const visitasResult = await pool.query(query, params);
    const visitas = visitasResult.rows;

    // Cargar suministros y fotos para cada visita
    for (const v of visitas) {
      const sumResult = await pool.query(
        `SELECT s.nombre, vs.cantidad
         FROM visita_suministros vs
         JOIN suministros s ON vs.suministro_id = s.id
         WHERE vs.visita_id = $1`,
        [v.id]
      );
      v.suministros = sumResult.rows;

      const fotosResult = await pool.query(
        'SELECT id, url, tipo, drive_file_id FROM visita_fotos WHERE visita_id = $1 ORDER BY orden, id',
        [v.id]
      );
      // Mantener array de URLs para Android
      v.fotos = fotosResult.rows.map(f => f.url);
      // Detalle para la web
      v.fotos_detalle = fotosResult.rows;
      v.fotos_count = fotosResult.rows.length;
    }

    res.json(visitas);
  } catch (error) {
    console.error('Error al listar visitas:', error);
    res.status(500).json({ error: 'Error al obtener visitas' });
  }
}

// ============================================================
// 3. SUBIR FOTO — POST /api/visitas/:id/fotos
// Reemplazar para aceptar tipo y subir a Drive con el helper
// ============================================================
async function subirFoto(req, res) {
  const pool = req.app.locals.pool || require('../db');
  const { uploadPhoto } = require('../lib/drive-upload');

  try {
    const visitaId = req.params.id;
    const tipo = req.body.tipo || 'despues'; // 'antes' | 'despues'

    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió archivo' });
    }

    // Obtener datos de la visita para la ruta en Drive
    const visitaInfo = await pool.query(
      `SELECT v.id, u.numero as unidad_numero,
        COALESCE(sv.nombre, su.nombre) as sede_nombre
       FROM visitas v
       JOIN unidades u ON v.unidad_id = u.id
       LEFT JOIN sedes sv ON v.sede_id = sv.id
       LEFT JOIN sedes su ON u.sede_id = su.id
       WHERE v.id = $1`,
      [visitaId]
    );

    if (visitaInfo.rows.length === 0) {
      return res.status(404).json({ error: 'Visita no encontrada' });
    }

    const info = visitaInfo.rows[0];
    let fotoUrl = '';
    let driveFileId = null;

    try {
      const driveResult = await uploadPhoto(req.file.buffer, {
        visitaId,
        tipo,
        index: Date.now(),
        sedeNombre: info.sede_nombre || 'Sin_sede',
        unidadNumero: info.unidad_numero,
      });
      fotoUrl = driveResult.url;
      driveFileId = driveResult.fileId;
    } catch (driveErr) {
      if (driveErr.status === 503) {
        return res.status(503).json({ error: driveErr.message });
      }
      console.error('Error subiendo a Drive:', driveErr);
      return res.status(500).json({ error: 'Error al subir foto a Google Drive' });
    }

    // Obtener el siguiente orden
    const ordenResult = await pool.query(
      'SELECT COALESCE(MAX(orden), -1) + 1 as next_orden FROM visita_fotos WHERE visita_id = $1',
      [visitaId]
    );
    const orden = ordenResult.rows[0].next_orden;

    const insertResult = await pool.query(
      'INSERT INTO visita_fotos (visita_id, url, tipo, drive_file_id, orden) VALUES ($1, $2, $3, $4, $5) RETURNING id, url',
      [visitaId, fotoUrl, tipo, driveFileId, orden]
    );

    res.status(201).json(insertResult.rows[0]);
  } catch (error) {
    console.error('Error al subir foto:', error);
    res.status(500).json({ error: 'Error al guardar la foto' });
  }
}

module.exports = { crearVisita, listarVisitas, subirFoto };
