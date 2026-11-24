'use strict';
// Pegamento con la API de Google Sheets. Lo único que necesita: un cliente `sheets` de googleapis
// ya autenticado (el mismo que usa hoy el backend) y las visitas leídas de PostgreSQL.

const { construirInforme, tituloUnico } = require('./construirInforme');
const { construirRequests } = require('./sheetsRequests');
const { verificarInformeEnSheets } = require('./verificarInforme');

function idDeHojaLibre(usados) {
  const ocupados = new Set(usados);
  let id;
  do { id = 1 + Math.floor(Math.random() * 2000000000); } while (ocupados.has(id));
  return id;
}

/**
 * Crea UNA pestaña nueva con el informe en formato Veolia, en una sola llamada batchUpdate.
 * @param {object} p
 * @param {import('googleapis').sheets_v4.Sheets} p.sheets  cliente autenticado
 * @param {string} p.spreadsheetId  process.env.GOOGLE_SHEET_ID
 * @param {object[]} p.visitas      filas de sql/consulta-visitas-informe.sql
 * @param {string[]} p.sedes        nombres de las sedes elegidas (para el nombre de la pestaña)
 * @param {string} p.fechaHasta     'YYYY-MM-DD'
 * @param {string} p.linkFotos      link de la carpeta de Drive con las fotos
 * @param {string} p.urlImagenes    ej. 'https://inovinfo.electroinova.com/informe-assets'
 * @param {boolean} [p.verificar=true] relee la pestaña creada y devuelve las diferencias en `verificacion`
 */
async function generarInformeVeolia({
  sheets, spreadsheetId, visitas, sedes, fechaHasta, linkFotos, urlImagenes, verificar = true,
}) {
  const modelo = construirInforme(visitas, { sedes, fechaHasta, linkFotos, urlImagenes });
  if (modelo.totalUnidades === 0) {
    const error = new Error('No hay visitas para esas sedes y fechas. No se creó ninguna pestaña.');
    error.status = 400;
    throw error;
  }

  const { data } = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties(sheetId,title)' });
  const propiedades = (data.sheets || []).map((s) => s.properties);
  const titulo = tituloUnico(modelo.nombrePestana, propiedades.map((p) => p.title));
  const sheetId = idDeHojaLibre(propiedades.map((p) => p.sheetId));

  const requests = construirRequests(modelo, { sheetId, titulo });
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });

  // Prueba de que la pestaña quedó igual al modelo ([] = perfecta). Si no está vacía, hay que registrarla en el log.
  const verificacion = verificar ? await verificarInformeEnSheets({ sheets, spreadsheetId, titulo, modelo }) : null;

  return {
    sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`,
    pestana: titulo,
    totalVisitas: modelo.totalVisitas,
    totalUnidades: modelo.totalUnidades,
    advertencias: modelo.advertencias,
    verificacion,
  };
}

module.exports = { generarInformeVeolia };
