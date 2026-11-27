const router  = require('express').Router();
const multer  = require('multer');
const ExcelJS = require('exceljs');
const pool    = require('../config/db');
const { verificarToken, soloCoordinadora } = require('../middleware/auth');

// ── Multer en memoria (máx. 10 MB) ───────────────────────────────────────────
const upload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.originalname.toLowerCase().endsWith('.xlsx')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se aceptan archivos .xlsx'));
        }
    }
});

// Sedes conocidas para validación
const SEDES_CONOCIDAS = ['Cali', 'Palmira', 'Buga', 'Tuluá', 'Sur Occidente'];

// ── POST /api/importar/excel ──────────────────────────────────────────────────
router.post(
    '/excel',
    verificarToken,
    soloCoordinadora,
    upload.single('archivo'),
    async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: 'Archivo .xlsx requerido' });
        }

        try {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(req.file.buffer);

            // Buscar hoja "Unidades", si no existe usar la primera
            const hoja = workbook.getWorksheet('Unidades') ?? workbook.worksheets[0];
            if (!hoja) {
                return res.status(400).json({ error: 'El archivo no contiene hojas' });
            }

            // ── Leer encabezados y mapear columnas por nombre ─────────────────
            const headerRow = hoja.getRow(1);
            const colIndex  = {};

            headerRow.eachCell((cell, colNumber) => {
                const nombre = String(cell.value ?? '').trim().toLowerCase();
                colIndex[nombre] = colNumber;
            });

            const idxNoInterno = colIndex['no_interno'];
            const idxPlaca     = colIndex['placa'];
            const idxSede      = colIndex['sede'];

            if (!idxNoInterno || !idxSede) {
                return res.status(400).json({
                    error: `El archivo debe tener columnas 'no_interno' y 'sede'. Columnas encontradas: ${Object.keys(colIndex).join(', ')}`
                });
            }

            // ── Recorrer filas de datos ───────────────────────────────────────
            const filas      = [];
            const advertencias = [];
            const errores    = [];

            hoja.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return; // encabezado

                const noInterno = String(row.getCell(idxNoInterno).value ?? '').trim();
                const placa     = idxPlaca
                    ? String(row.getCell(idxPlaca).value ?? '').trim().toUpperCase() || null
                    : null;
                const sede      = String(row.getCell(idxSede).value ?? '').trim();

                // Saltar filas completamente vacías
                if (!noInterno && !placa && !sede) return;

                // no_interno es obligatorio
                if (!noInterno) {
                    errores.push(`Fila ${rowNumber}: no_interno vacío`);
                    return;
                }

                // Advertencia si la sede no es conocida (sin rechazar la fila)
                if (sede && !SEDES_CONOCIDAS.includes(sede)) {
                    advertencias.push(`Fila ${rowNumber}: sede '${sede}' no es una sede conocida`);
                }

                filas.push({ noInterno, placa, sede, rowNumber });
            });

            if (filas.length === 0 && errores.length === 0) {
                return res.status(400).json({ error: 'El archivo no tiene filas de datos' });
            }

            // ── Insertar sedes únicas (ignorando duplicados) ──────────────────
            const nombresSedesUnicos = [...new Set(filas.map(f => f.sede).filter(Boolean))];
            let sedesCreadas = 0;

            for (const nombreSede of nombresSedesUnicos) {
                const result = await pool.query(
                    `INSERT INTO sedes (nombre) VALUES ($1)
                     ON CONFLICT (nombre) DO NOTHING
                     RETURNING id`,
                    [nombreSede]
                );
                if (result.rows.length > 0) sedesCreadas++;
            }

            // ── UPSERT de unidades ────────────────────────────────────────────
            let unidadesCreadas     = 0;
            let unidadesActualizadas = 0;
            let sinPlaca            = 0;

            for (const fila of filas) {
                try {
                    // Obtener id de la sede
                    const sedeResult = await pool.query(
                        'SELECT id FROM sedes WHERE nombre = $1',
                        [fila.sede]
                    );

                    if (sedeResult.rows.length === 0) {
                        errores.push(`Fila ${fila.rowNumber}: sede '${fila.sede}' no encontrada para unidad '${fila.noInterno}'`);
                        continue;
                    }

                    const sedeId = sedeResult.rows[0].id;

                    // UPSERT: actualiza placa y sede si ya existe; preserva placa si la nueva es null
                    const upsertResult = await pool.query(
                        `INSERT INTO unidades (numero, placa, sede_id) VALUES ($1, $2, $3)
                         ON CONFLICT (numero) DO UPDATE
                             SET placa   = COALESCE(EXCLUDED.placa, unidades.placa),
                                 sede_id = EXCLUDED.sede_id
                         RETURNING id, (xmax = 0) AS inserted`,
                        [fila.noInterno, fila.placa, sedeId]
                    );

                    if (upsertResult.rows.length > 0) {
                        if (upsertResult.rows[0].inserted) {
                            unidadesCreadas++;
                        } else {
                            unidadesActualizadas++;
                        }
                    }

                    if (!fila.placa) sinPlaca++;

                } catch (err) {
                    errores.push(`Fila ${fila.rowNumber}: ${err.message}`);
                }
            }

            res.json({
                sedesCreadas,
                unidadesCreadas,
                unidadesActualizadas,
                sinPlaca,
                advertencias,
                errores
            });

        } catch (err) {
            console.error('[POST /importar/excel]', err.message);
            res.status(500).json({ error: `Error al procesar el archivo: ${err.message}` });
        }
    }
);

module.exports = router;
