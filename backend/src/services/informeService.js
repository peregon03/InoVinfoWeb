const pool = require('../config/db');
const { getSheetsClient } = require('../config/google');

// ── Texto estándar de Veolia ───────────────────────────────────────────────
const STD = 'Se ejecutó el servicio de revisión, diagnóstico técnico, ajuste, reparación, mantenimiento general y limpieza del sistema de cámaras';

// ── Colores (RGB 0-1 para la API de Sheets) ────────────────────────────────
const VERDE_ENCABEZADO = { red: 0.718, green: 0.843, blue: 0.788 }; // #B7D7C9
const BLANCO           = { red: 1,     green: 1,     blue: 1     };
const NARANJA_CLARO    = { red: 1,     green: 0.929, blue: 0.804 }; // resalte sede diferente

// ── Meses en español ────────────────────────────────────────────────────────
const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

/**
 * Formatea una fecha Date a dd/MM/yyyy
 */
function formatFecha(date) {
    // Convertir a hora Colombia (UTC-5)
    const d = new Date(date);
    const col = new Date(d.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    const dd = String(col.getDate()).padStart(2, '0');
    const mm = String(col.getMonth() + 1).padStart(2, '0');
    const yyyy = col.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

/**
 * Nombre de la pestaña: "{Sede} {d}{Mmm}{yyyy}"
 * Ej: "Buga 18Oct2026"
 */
function nombrePestana(sedeNombre, fecha) {
    const d = new Date(fecha);
    const dia = d.getDate();
    const mes = MESES_CORTO[d.getMonth()];
    const anio = d.getFullYear();
    return `${sedeNombre} ${dia}${mes}${anio}`;
}

/**
 * Construye el texto de observación según el estado de la visita.
 * Si hay observacion_estructurada, se usa para CUALQUIER estado.
 */
function textoObservacion(estado, novedadTexto, observacionEstructurada) {
    // Si hay observación estructurada, usarla directamente para cualquier estado
    if (observacionEstructurada && observacionEstructurada.trim()) {
        return observacionEstructurada.trim();
    }

    const estadoLower = (estado || '').toLowerCase();

    if (estadoLower === 'ok') {
        return STD;
    }
    if (estadoLower === 'con novedad') {
        // Fallback: construir desde novedad_texto
        if (novedadTexto && novedadTexto.trim()) {
            let novedad = novedadTexto.trim();
            // Primera letra en minúscula, sin punto final
            novedad = novedad.charAt(0).toLowerCase() + novedad.slice(1);
            novedad = novedad.replace(/\.+$/, '');
            return `${STD}, durante la inspección ${novedad}`;
        }
        return STD;
    }
    if (estadoLower === 'inoperativa') {
        return 'Al momento de la visita esta unidad se encuentra inoperativa';
    }
    if (estadoLower === 'sin llaves') {
        return 'Al momento de la inspección no se encontraron llaves';
    }
    if (estadoLower.includes('bat') && estadoLower.includes('desconectada')) {
        return 'Al momento de la visita la batería de la unidad se encontraba desconectada';
    }
    if (estadoLower === 'no está en la base') {
        return 'Al momento de la visita la unidad no se encontraba en la base';
    }

    // Cualquier otro estado
    return STD;
}

/**
 * Consulta las visitas de un rango de fechas y (opcionalmente) una sede.
 * Retorna los datos listos para generar el informe.
 */
async function consultarVisitas(fechaDesde, fechaHasta, sedeId) {
    const params = [fechaDesde, fechaHasta];
    let filtroSede = '';
    if (sedeId) {
        filtroSede = 'AND COALESCE(v.sede_id, un.sede_id) = $3';
        params.push(sedeId);
    }

    const query = `
        SELECT v.id, v.created_at, v.novedad_texto, v.observacion_estructurada,
               v.es_otra_sede,
               un.numero  AS unidad_numero,
               s.nombre   AS sede_nombre,
               s.id       AS sede_id,
               ev.nombre  AS estado,
               u2.nombre  AS tecnico_nombre,
               COALESCE(
                   json_agg(
                       json_build_object('nombre', sm.nombre, 'cantidad', vs.cantidad)
                   ) FILTER (WHERE sm.id IS NOT NULL), '[]'
               ) AS suministros
        FROM visitas v
        JOIN unidades un        ON v.unidad_id  = un.id
        JOIN sedes s            ON COALESCE(v.sede_id, un.sede_id) = s.id
        JOIN estados_visita ev  ON v.estado_id  = ev.id
        JOIN usuarios u2        ON v.tecnico_id = u2.id
        LEFT JOIN visita_suministros vs ON v.id = vs.visita_id
        LEFT JOIN suministros sm        ON vs.suministro_id = sm.id
        WHERE DATE(v.created_at AT TIME ZONE 'America/Bogota') >= $1
          AND DATE(v.created_at AT TIME ZONE 'America/Bogota') <= $2
          AND ev.nombre != 'Pendiente'
          ${filtroSede}
        GROUP BY v.id, un.numero, s.nombre, s.id, ev.nombre, u2.nombre, v.es_otra_sede
        ORDER BY s.nombre, un.numero, v.created_at
    `;

    const result = await pool.query(query, params);
    return result.rows;
}

/**
 * Construye las filas del informe en el formato Veolia.
 * Retorna un array de arrays (cada sub-array es una fila de 5 columnas).
 * También retorna metadata para saber dónde hacer merges y aplicar estilos.
 */
function construirFilas(visitas, sedeJornada) {
    const filas = [];
    const bloques = []; // { startRow, endRow, esOtraSede }

    for (const visita of visitas) {
        const fecha = formatFecha(visita.created_at);
        const sede  = visita.sede_nombre;
        const num   = visita.unidad_numero;
        const actividad = '· Mtto preventivo y correctivo Dvr Movil';

        // Texto principal de observación
        const obsTexto = textoObservacion(
            visita.estado,
            visita.novedad_texto,
            visita.observacion_estructurada
        );

        // Suministros (parsear si viene como string)
        let suministros = visita.suministros;
        if (typeof suministros === 'string') {
            suministros = JSON.parse(suministros);
        }
        // Filtrar suministros válidos
        suministros = suministros.filter(s => s && s.nombre);

        const startRow = filas.length;

        // Fila principal
        filas.push([fecha, sede, num, actividad, obsTexto]);

        // Filas de suministros (formato: "Sum Nombre del suministro")
        for (const s of suministros) {
            const cantidad = (s.cantidad && s.cantidad > 1) ? ` x${s.cantidad}` : '';
            filas.push(['', '', '', '', `Sum ${s.nombre}${cantidad}`]);
        }

        const endRow = filas.length - 1;
        const esOtraSede = (sedeJornada && sede !== sedeJornada) || visita.es_otra_sede;

        bloques.push({ startRow, endRow, esOtraSede });
    }

    return { filas, bloques };
}

/**
 * Construye las filas del pie de página (firma + disclaimers).
 */
function construirPie(linkFotos) {
    return [
        ['', '', '', '', ''],
        ['', '', '', '', ''],
        ['', '', '', '', ''],
        ['', '', '', '', ''],
        ['', '', '', '', ''],
        // Firma
        ['Jhon Fernando Agudelo A.', '', '', '', ''],
        ['Ingeniero Electrónico', '', '', '', ''],
        ['Electroinova SAS', '', '', '', ''],
        ['electroinova.soluciones@gmail.com', '', '', '', ''],
        ['', '', '', '', ''],
        // Nota 1
        [`*Todas las reparaciones e instalaciones ejecutadas contaron con el acompañamiento y supervisión de personal designado por la entidad contratante, dejando constancia de las labores realizadas. Como soporte de lo anterior, se anexa el respectivo registro fotográfico en el siguiente enlace. Link: ${linkFotos || '(pendiente)'}`, '', '', '', ''],
        ['', '', '', '', ''],
        // Nota 2
        ['*Es importante aclarar que Electroinova no será responsable por la no ejecución de intervenciones programadas en aquellas unidades que, al momento de la visita técnica, se encontraran inoperativas, fuera de servicio, ausentes o no disponibles para su atención, sin afectar el alcance pactado.', '', '', '', ''],
        ['', '', '', '', ''],
        // Nota 3
        ['* Concientizar al personal de la compañía de la importancia del buen uso, manejo y limpieza de los elementos y equipos del sistema de grabacion Movil', '', '', '', ''],
    ];
}

/**
 * Obtiene el ID del spreadsheet de informes.
 */
async function getSpreadsheetId() {
    // 1. Variable de entorno
    if (process.env.GOOGLE_SHEET_ID) {
        return process.env.GOOGLE_SHEET_ID;
    }
    // 2. app_config
    try {
        const r = await pool.query("SELECT valor FROM app_config WHERE clave = 'informes_spreadsheet_id'");
        if (r.rows.length > 0 && r.rows[0].valor) return r.rows[0].valor;
    } catch (_) { /* tabla puede no existir */ }

    throw new Error('GOOGLE_SHEET_ID no está configurado. Configure la variable de entorno o informes_spreadsheet_id en app_config.');
}

/**
 * Genera el informe completo en una nueva pestaña de Google Sheets.
 *
 * @param {string} fechaDesde  — 'YYYY-MM-DD'
 * @param {string} fechaHasta  — 'YYYY-MM-DD'
 * @param {number|null} sedeId — filtrar por sede (null = todas)
 * @param {string|null} sedeNombre — nombre de la sede para la pestaña
 * @param {string|null} linkFotos  — link a carpeta de Drive con fotos
 * @returns {{ sheetUrl, pestana, totalVisitas }}
 */
async function generarInforme({ fechaDesde, fechaHasta, sedeId, sedeNombre, linkFotos }) {
    const spreadsheetId = await getSpreadsheetId();
    const sheets = await getSheetsClient();

    // 1. Consultar visitas
    const visitas = await consultarVisitas(fechaDesde, fechaHasta, sedeId);
    if (visitas.length === 0) {
        throw new Error('No hay visitas en el rango de fechas seleccionado');
    }

    // Determinar sede para la pestaña
    const sedeParaPestana = sedeNombre || visitas[0].sede_nombre || 'Informe';
    const pestana = nombrePestana(sedeParaPestana, fechaDesde);

    // 2. Construir datos del informe
    const { filas, bloques } = construirFilas(visitas, sedeNombre);
    const pie = construirPie(linkFotos);

    // 3. Crear la pestaña nueva
    let sheetId;
    try {
        const addSheetRes = await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
                requests: [{
                    addSheet: {
                        properties: {
                            title: pestana,
                            gridProperties: { rowCount: filas.length + pie.length + 10, columnCount: 5 }
                        }
                    }
                }]
            }
        });
        sheetId = addSheetRes.data.replies[0].addSheet.properties.sheetId;
    } catch (err) {
        // Si la pestaña ya existe, buscarla
        if (err.message && err.message.includes('already exists')) {
            const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
            const existing = meta.data.sheets.find(s => s.properties.title === pestana);
            if (existing) {
                sheetId = existing.properties.sheetId;
                // Limpiar contenido existente
                await sheets.spreadsheets.values.clear({
                    spreadsheetId,
                    range: `'${pestana}'!A:E`
                });
            } else {
                throw err;
            }
        } else {
            throw err;
        }
    }

    // 4. Escribir datos
    // Fila 1 vacía, Fila 2 título, Fila 3 encabezados, Fila 4+ datos
    const titulo = ['VISITA TÉCNICA ELECTROINOVA A SEDE OPERATIVA', '', '', '', ''];
    const encabezados = ['Fecha', 'Unidad de negocio', 'Ref. Vehículo', 'Actividad', 'Observación'];

    const todasLasFilas = [
        ['', '', '', '', ''],  // fila 1 vacía
        titulo,                // fila 2
        encabezados,           // fila 3
        ...filas,              // fila 4+
        ...pie                 // pie de página
    ];

    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${pestana}'!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: todasLasFilas }
    });

    // 5. Aplicar formato
    const formatRequests = [];

    // Ocultar líneas de cuadrícula
    formatRequests.push({
        updateSheetProperties: {
            properties: { sheetId, gridProperties: { hideGridlines: true } },
            fields: 'gridProperties.hideGridlines'
        }
    });

    // Anchos de columna: A=100, B=120, C=100, D=240, E=420
    const anchos = [100, 120, 100, 240, 420];
    anchos.forEach((px, i) => {
        formatRequests.push({
            updateDimensionProperties: {
                range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
                properties: { pixelSize: px },
                fields: 'pixelSize'
            }
        });
    });

    // Fila 2: título combinado A2:E2, Arial 14, centrado, fondo verde
    formatRequests.push({
        mergeCells: {
            range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 5 },
            mergeType: 'MERGE_ALL'
        }
    });
    formatRequests.push({
        repeatCell: {
            range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 5 },
            cell: {
                userEnteredFormat: {
                    backgroundColor: VERDE_ENCABEZADO,
                    horizontalAlignment: 'CENTER',
                    verticalAlignment: 'MIDDLE',
                    textFormat: { fontFamily: 'Arial', fontSize: 14, bold: false }
                }
            },
            fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,textFormat)'
        }
    });

    // Fila 3: encabezados, Arial 10 negrita, centrado, fondo verde, bordes
    formatRequests.push({
        repeatCell: {
            range: { sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 5 },
            cell: {
                userEnteredFormat: {
                    backgroundColor: VERDE_ENCABEZADO,
                    horizontalAlignment: 'CENTER',
                    verticalAlignment: 'MIDDLE',
                    textFormat: { fontFamily: 'Arial', fontSize: 10, bold: true },
                    borders: borderAll()
                }
            },
            fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,textFormat,borders)'
        }
    });

    // Fuente Arial para todo el contenido (filas 4+)
    const dataStartRow = 3; // índice 0-based de la fila 4
    const dataEndRow = dataStartRow + filas.length;

    formatRequests.push({
        repeatCell: {
            range: { sheetId, startRowIndex: dataStartRow, endRowIndex: dataEndRow, startColumnIndex: 0, endColumnIndex: 5 },
            cell: {
                userEnteredFormat: {
                    textFormat: { fontFamily: 'Arial', fontSize: 10 },
                    verticalAlignment: 'MIDDLE',
                    wrapStrategy: 'WRAP',
                    borders: borderAll()
                }
            },
            fields: 'userEnteredFormat(textFormat,verticalAlignment,wrapStrategy,borders)'
        }
    });

    // Merge y formato por bloque de unidad
    for (const bloque of bloques) {
        const rowStart = dataStartRow + bloque.startRow;
        const rowEnd   = dataStartRow + bloque.endRow + 1;
        const numFilas = rowEnd - rowStart;

        // Merge columnas A-D si el bloque tiene más de una fila
        if (numFilas > 1) {
            for (let col = 0; col < 4; col++) {
                formatRequests.push({
                    mergeCells: {
                        range: { sheetId, startRowIndex: rowStart, endRowIndex: rowEnd, startColumnIndex: col, endColumnIndex: col + 1 },
                        mergeType: 'MERGE_ALL'
                    }
                });
            }
        }

        // Negrita en columnas A-C (fecha, sede, unidad)
        formatRequests.push({
            repeatCell: {
                range: { sheetId, startRowIndex: rowStart, endRowIndex: rowStart + 1, startColumnIndex: 0, endColumnIndex: 3 },
                cell: {
                    userEnteredFormat: {
                        textFormat: { fontFamily: 'Arial', fontSize: 10, bold: true }
                    }
                },
                fields: 'userEnteredFormat.textFormat'
            }
        });

        // Resalte naranja si es de otra sede
        if (bloque.esOtraSede) {
            formatRequests.push({
                repeatCell: {
                    range: { sheetId, startRowIndex: rowStart, endRowIndex: rowEnd, startColumnIndex: 0, endColumnIndex: 5 },
                    cell: {
                        userEnteredFormat: { backgroundColor: NARANJA_CLARO }
                    },
                    fields: 'userEnteredFormat.backgroundColor'
                }
            });
        }
    }

    // Pie de página: firma en negrita (filas después de los datos)
    const pieStartRow = dataEndRow + 5; // 5 filas vacías
    // Firma (3 líneas en negrita)
    formatRequests.push({
        repeatCell: {
            range: { sheetId, startRowIndex: pieStartRow, endRowIndex: pieStartRow + 3, startColumnIndex: 0, endColumnIndex: 1 },
            cell: {
                userEnteredFormat: {
                    textFormat: { fontFamily: 'Arial', fontSize: 10, bold: true }
                }
            },
            fields: 'userEnteredFormat.textFormat'
        }
    });

    // Email en azul subrayado
    formatRequests.push({
        repeatCell: {
            range: { sheetId, startRowIndex: pieStartRow + 3, endRowIndex: pieStartRow + 4, startColumnIndex: 0, endColumnIndex: 1 },
            cell: {
                userEnteredFormat: {
                    textFormat: {
                        fontFamily: 'Arial', fontSize: 10,
                        foregroundColor: { red: 0.067, green: 0.333, blue: 0.8 },
                        underline: true
                    }
                }
            },
            fields: 'userEnteredFormat.textFormat'
        }
    });

    // Notas: merge A:E, negrita, subrayado las dos primeras
    const notaRows = [pieStartRow + 5, pieStartRow + 7, pieStartRow + 9];
    for (let i = 0; i < notaRows.length; i++) {
        const row = notaRows[i];
        formatRequests.push({
            mergeCells: {
                range: { sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: 0, endColumnIndex: 5 },
                mergeType: 'MERGE_ALL'
            }
        });
        formatRequests.push({
            repeatCell: {
                range: { sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: 0, endColumnIndex: 5 },
                cell: {
                    userEnteredFormat: {
                        textFormat: {
                            fontFamily: 'Arial', fontSize: 10,
                            bold: true,
                            underline: i < 2  // subrayado solo las dos primeras notas
                        },
                        wrapStrategy: 'WRAP'
                    }
                },
                fields: 'userEnteredFormat(textFormat,wrapStrategy)'
            }
        });
    }

    // Ejecutar todas las solicitudes de formato
    if (formatRequests.length > 0) {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: { requests: formatRequests }
        });
    }

    // 6. URL del informe
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`;

    return {
        sheetUrl,
        pestana,
        totalVisitas: visitas.length
    };
}

// ── Helper: bordes finos en las 4 direcciones ──────────────────────────────
function borderAll() {
    const style = { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } };
    return { top: style, bottom: style, left: style, right: style };
}

module.exports = { generarInforme, consultarVisitas, construirFilas, textoObservacion };
