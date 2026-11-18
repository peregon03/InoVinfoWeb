const router = require('express').Router();
const pool   = require('../config/db');
const { verificarToken, coordinadoraOPermiso } = require('../middleware/auth');
const { getSheetsClient } = require('../config/google');

router.use(verificarToken);
router.use(coordinadoraOPermiso('EXPORTAR_SHEETS'));

// GET /api/informes/sedes — lista sedes activas para el selector
router.get('/sedes', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, nombre FROM sedes WHERE activa = true ORDER BY nombre'
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error al listar sedes para informes:', err.message);
        res.status(500).json({ error: 'Error al obtener sedes' });
    }
});

// POST /api/informes/generar
// Body: { fechaDesde, fechaHasta, sedeIds: number[], linkFotos? }
router.post('/generar', async (req, res) => {
    try {
        const { fechaDesde, fechaHasta, sedeIds, linkFotos } = req.body;

        // Validaciones básicas
        if (!fechaDesde || !fechaHasta) {
            return res.status(400).json({ error: 'Las fechas son requeridas' });
        }
        if (!Array.isArray(sedeIds) || sedeIds.length === 0) {
            return res.status(400).json({ error: 'Debe seleccionar al menos una sede' });
        }

        const idsValidos = sedeIds.map((id) => parseInt(id, 10)).filter((id) => !isNaN(id));
        if (idsValidos.length === 0) {
            return res.status(400).json({ error: 'IDs de sedes inválidos' });
        }

        // Consultar nombres de sedes seleccionadas
        const sedesResult = await pool.query(
            'SELECT id, nombre FROM sedes WHERE id = ANY($1::int[]) ORDER BY nombre',
            [idsValidos]
        );
        const sedesSeleccionadas = sedesResult.rows;
        if (sedesSeleccionadas.length === 0) {
            return res.status(404).json({ error: 'No se encontraron las sedes indicadas' });
        }

        // Nombre de la pestaña: sedes separadas por " + " (truncado a 90 chars para Sheets)
        const nombresSedes = sedesSeleccionadas.map((s) => s.nombre).join(' + ');
        const pestana = `${nombresSedes} ${fechaDesde} a ${fechaHasta}`.slice(0, 90);

        // Consulta de visitas filtrando por múltiples sedes y rango de fechas (zona Bogotá)
        const visitasResult = await pool.query(`
            SELECT
                v.id,
                (v.created_at AT TIME ZONE 'America/Bogota')::date        AS fecha,
                (v.created_at AT TIME ZONE 'America/Bogota')::time(0)     AS hora,
                un.numero                                                   AS unidad,
                un.placa,
                sv.nombre                                                   AS sede,
                u2.nombre                                                   AS tecnico,
                ev.nombre                                                   AS estado,
                v.atraso_hora_min,
                v.dias_grabacion,
                v.h264_plus,
                v.novedad_texto,
                v.observacion_estructurada,
                v.es_extraordinaria,
                COALESCE(
                    string_agg(sm.nombre || ' x' || vs.cantidad, ', ' ORDER BY sm.nombre),
                    ''
                ) AS suministros_usados
            FROM visitas v
            JOIN unidades un       ON v.unidad_id  = un.id
            LEFT JOIN sedes sv     ON v.sede_id    = sv.id
            JOIN usuarios u2       ON v.tecnico_id = u2.id
            JOIN estados_visita ev ON v.estado_id  = ev.id
            LEFT JOIN visita_suministros vs ON v.id = vs.visita_id
            LEFT JOIN suministros sm        ON vs.suministro_id = sm.id
            WHERE v.sede_id = ANY($1::int[])
              AND (v.created_at AT TIME ZONE 'America/Bogota')::date BETWEEN $2::date AND $3::date
            GROUP BY v.id, un.numero, un.placa, sv.nombre, u2.nombre, ev.nombre,
                     v.atraso_hora_min, v.dias_grabacion, v.h264_plus,
                     v.novedad_texto, v.observacion_estructurada, v.es_extraordinaria,
                     v.created_at
            ORDER BY v.created_at ASC
        `, [idsValidos, fechaDesde, fechaHasta]);

        const visitas = visitasResult.rows;

        // ── Google Sheets ────────────────────────────────────────────────
        let sheetUrl = null;

        try {
            const sheets = await getSheetsClient();

            // Buscar spreadsheet guardado en app_config
            let ssId = null;
            try {
                const cfgResult = await pool.query(
                    "SELECT valor FROM app_config WHERE clave = 'informes_spreadsheet_id'"
                );
                if (cfgResult.rows.length > 0) ssId = cfgResult.rows[0].valor;
            } catch (_) { /* tabla app_config puede no existir aún */ }

            if (!ssId) {
                // Crear nuevo spreadsheet con la primera pestaña
                const created = await sheets.spreadsheets.create({
                    requestBody: {
                        properties: { title: 'Informes InovInfo' },
                        sheets: [{ properties: { title: pestana } }],
                    },
                });
                ssId = created.data.spreadsheetId;
                // Persistir para próximas veces
                pool.query(
                    `INSERT INTO app_config (clave, valor, updated_at)
                     VALUES ('informes_spreadsheet_id', $1, NOW())
                     ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = NOW()`,
                    [ssId]
                ).catch(() => {});
            } else {
                // Agregar pestaña nueva
                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId: ssId,
                    requestBody: {
                        requests: [{ addSheet: { properties: { title: pestana } } }],
                    },
                });
            }

            // Cabeceras
            const cabeceras = [
                'Fecha', 'Hora', 'Unidad', 'Placa', 'Sede', 'Técnico',
                'Estado', 'Atraso (min)', 'Días grabación', 'H264+',
                'Extraordinaria', 'Novedad', 'Observación', 'Suministros',
            ];
            if (linkFotos) cabeceras.push('Link fotos');

            // Filas de datos
            const filas = visitas.map((v) => {
                const fila = [
                    v.fecha ? new Date(v.fecha).toLocaleDateString('es-CO') : '',
                    v.hora  || '',
                    v.unidad || '',
                    v.placa  || '',
                    v.sede   || '',
                    v.tecnico || '',
                    v.estado  || '',
                    v.atraso_hora_min  ?? '',
                    v.dias_grabacion   ?? '',
                    v.h264_plus        ? 'Sí' : 'No',
                    v.es_extraordinaria ? 'Sí' : 'No',
                    v.novedad_texto          || '',
                    v.observacion_estructurada || '',
                    v.suministros_usados     || '',
                ];
                if (linkFotos) fila.push(linkFotos);
                return fila;
            });

            await sheets.spreadsheets.values.update({
                spreadsheetId: ssId,
                range: `'${pestana}'!A1`,
                valueInputOption: 'RAW',
                requestBody: { values: [cabeceras, ...filas] },
            });

            // Dar formato a la cabecera (negrita + fondo azul oscuro)
            const ssInfo = await sheets.spreadsheets.get({
                spreadsheetId: ssId,
                fields: 'sheets.properties',
            });
            const sheetObj = ssInfo.data.sheets.find((s) => s.properties.title === pestana);
            const sheetTabId = sheetObj?.properties?.sheetId;

            if (sheetTabId !== undefined) {
                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId: ssId,
                    requestBody: {
                        requests: [
                            {
                                repeatCell: {
                                    range: { sheetId: sheetTabId, startRowIndex: 0, endRowIndex: 1 },
                                    cell: {
                                        userEnteredFormat: {
                                            textFormat: { bold: true },
                                            backgroundColor: { red: 0.1, green: 0.23, blue: 0.36 },
                                        },
                                    },
                                    fields: 'userEnteredFormat(textFormat,backgroundColor)',
                                },
                            },
                            {
                                autoResizeDimensions: {
                                    dimensions: {
                                        sheetId: sheetTabId,
                                        dimension: 'COLUMNS',
                                        startIndex: 0,
                                        endIndex: cabeceras.length,
                                    },
                                },
                            },
                        ],
                    },
                });
            }

            sheetUrl = `https://docs.google.com/spreadsheets/d/${ssId}`;
        } catch (sheetsErr) {
            // Drive puede no estar conectado — no es error fatal
            console.error('Error Google Sheets (no fatal):', sheetsErr.message);
        }

        res.json({
            totalVisitas: visitas.length,
            pestana,
            sedesNombres: nombresSedes,
            sheetUrl,
        });
    } catch (err) {
        console.error('Error al generar informe:', err.message);
        res.status(500).json({ error: 'Error al generar el informe' });
    }
});

module.exports = router;
