// Servicio de informe Veolia — delega al módulo informe-veolia.
// Este archivo reemplaza el generador viejo de tabla plana.

const fs   = require('fs');
const path = require('path');
const pool = require('../config/db');
const { getSheetsClient } = require('../config/google');
const { generarInformeVeolia } = require('../informes/veolia/src');

// Consulta SQL leída del archivo (igual que en el módulo)
const CONSULTA_SQL = fs.readFileSync(
    path.join(__dirname, '..', 'informes', 'veolia', 'sql', 'consulta-visitas-informe.sql'), 'utf8'
);

/**
 * Obtiene el ID del spreadsheet de informes.
 */
async function getSpreadsheetId() {
    if (process.env.GOOGLE_SHEET_ID) return process.env.GOOGLE_SHEET_ID;
    try {
        const r = await pool.query("SELECT valor FROM app_config WHERE clave = 'informes_spreadsheet_id'");
        if (r.rows.length > 0 && r.rows[0].valor) return r.rows[0].valor;
    } catch (_) { /* tabla puede no existir */ }
    throw new Error('GOOGLE_SHEET_ID no está configurado. Configure la variable de entorno o informes_spreadsheet_id en app_config.');
}

/**
 * Genera el informe Veolia completo.
 * @param {object} opts
 * @param {string} opts.fechaDesde  'YYYY-MM-DD'
 * @param {string} opts.fechaHasta  'YYYY-MM-DD'
 * @param {number[]} opts.sedeIds   IDs de sedes
 * @param {string[]} opts.sedes     Nombres de las sedes
 * @param {string|null} opts.linkFotos
 * @returns {{ sheetUrl, pestana, totalVisitas, totalUnidades, advertencias, verificacion }}
 */
async function generarInforme({ fechaDesde, fechaHasta, sedeIds, sedes, linkFotos }) {
    const spreadsheetId = await getSpreadsheetId();
    const sheets = await getSheetsClient();

    // Consultar visitas con la query del módulo
    const result = await pool.query(CONSULTA_SQL, [fechaDesde, fechaHasta, sedeIds]);
    const visitas = result.rows.map((r) => ({
        ...r,
        suministros: typeof r.suministros === 'string' ? JSON.parse(r.suministros) : r.suministros,
    }));

    return generarInformeVeolia({
        sheets,
        spreadsheetId,
        visitas,
        sedes,
        fechaHasta,
        linkFotos: linkFotos || '',
        urlImagenes: process.env.INFORME_ASSETS_URL || '',
    });
}

module.exports = { generarInforme };
