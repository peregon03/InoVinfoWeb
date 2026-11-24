'use strict';
// Verificación de la pestaña REAL ya creada en Google Sheets: la vuelve a leer por la API y la compara
// con el modelo. Devuelve la lista de diferencias ([] = idéntica). Úsala después de cada generación de prueba.

const E = require('./estilo');

const LETRAS = ['A', 'B', 'C', 'D', 'E'];
const letra = (i) => LETRAS[i] || String.fromCharCode(65 + i);
const a1DeRango = (g) => {
  const ini = `${letra(g.startColumnIndex)}${g.startRowIndex + 1}`;
  const fin = `${letra(g.endColumnIndex - 1)}${g.endRowIndex}`;
  return ini === fin ? ini : `${ini}:${fin}`;
};
const hex = (c = {}) => '#' + ['red', 'green', 'blue']
  .map((k) => Math.round((c[k] || 0) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const colorDe = (formato, campo) => {
  if (!formato) return null;
  const estilo = formato[`${campo}Style`];
  if (estilo && estilo.rgbColor) return hex(estilo.rgbColor);
  return formato[campo] ? hex(formato[campo]) : null;
};

function compararConModelo(hoja, modelo) {
  const p = [];
  const gp = (hoja.properties && hoja.properties.gridProperties) || {};
  if (gp.frozenRowCount !== modelo.filasCongeladas) p.push(`Filas congeladas: ${gp.frozenRowCount} (deben ser ${modelo.filasCongeladas})`);
  if (gp.hideGridlines !== true) p.push('Las líneas de cuadrícula deben estar ocultas');

  const datos = (hoja.data && hoja.data[0]) || {};
  const columnas = datos.columnMetadata || [];
  LETRAS.forEach((l, i) => {
    const px = columnas[i] && columnas[i].pixelSize;
    if (px !== modelo.anchosPx[l]) p.push(`Ancho columna ${l}: ${px}px (debe ser ${modelo.anchosPx[l]}px)`);
  });
  const filasMeta = datos.rowMetadata || [];
  for (const [fila, px] of Object.entries(modelo.altosFijos)) {
    const real = filasMeta[Number(fila) - 1] && filasMeta[Number(fila) - 1].pixelSize;
    if (real !== px) p.push(`Alto fila ${fila}: ${real}px (debe ser ${px}px)`);
  }

  const reales = new Set((hoja.merges || []).map(a1DeRango));
  const esperadas = new Set(modelo.merges);
  for (const m of esperadas) if (!reales.has(m)) p.push(`Falta combinar ${m}`);
  for (const m of reales) if (!esperadas.has(m)) p.push(`Sobra la combinación ${m}`);

  const filas = datos.rowData || [];
  const celda = (ref) => {
    const m = /^([A-E])(\d+)$/.exec(ref);
    const fila = filas[Number(m[2]) - 1];
    return (fila && fila.values && fila.values[LETRAS.indexOf(m[1])]) || {};
  };
  for (const [ref, c] of Object.entries(modelo.celdas)) {
    const v = celda(ref).userEnteredValue || {};
    if (c.imagen) {
      if (!String(v.formulaValue || '').startsWith('=IMAGE(')) p.push(`${ref} debe tener la imagen (=IMAGE(...))`);
      continue;
    }
    const esperado = c.partes ? c.partes.map((x) => x.texto).join('') : c.texto;
    if (v.stringValue !== esperado) p.push(`${ref}: "${String(v.stringValue).slice(0, 40)}" ≠ "${String(esperado).slice(0, 40)}"`);
  }

  const revisar = (ref, nombre, real, esperado) => {
    if (real !== esperado) p.push(`${ref} ${nombre}: ${real} (debe ser ${esperado})`);
  };
  const f = (ref) => celda(ref).userEnteredFormat || {};
  revisar('A2', 'fondo', colorDe(f('A2'), 'backgroundColor'), E.COLOR.verde);
  revisar('A2', 'tamaño de letra', (f('A2').textFormat || {}).fontSize, 15);
  revisar('A2', 'color de letra', colorDe(f('A2').textFormat, 'foregroundColor'), E.COLOR.blanco);
  revisar('A3', 'fondo', colorDe(f('A3'), 'backgroundColor'), E.COLOR.verde);
  revisar('A3', 'negrita', (f('A3').textFormat || {}).bold, true);
  revisar('A3', 'color de letra', colorDe(f('A3').textFormat, 'foregroundColor'), E.COLOR.blanco);
  if (modelo.totalUnidades > 0) {
    revisar('A4', 'fuente', (f('A4').textFormat || {}).fontFamily, 'Arial');
    revisar('A4', 'tamaño de letra', (f('A4').textFormat || {}).fontSize, 10);
    revisar('A4', 'negrita', (f('A4').textFormat || {}).bold, true);
    revisar('D4', 'alineación', f('D4').horizontalAlignment, 'CENTER');
    revisar('E4', 'alineación', f('E4').horizontalAlignment, 'LEFT');
    const borde = (f('E4').borders || {}).right || {};   // borde derecho: no lo comparte con otra celda formateada
    revisar('E4', 'borde derecho', borde.style, 'SOLID_MEDIUM');
    revisar('E4', 'color del borde', colorDe(borde, 'color'), E.COLOR.bordeDatos);
  }
  return p;
}

/** Lee la pestaña creada y la compara con el modelo. */
async function verificarInformeEnSheets({ sheets, spreadsheetId, titulo, modelo }) {
  const { data } = await sheets.spreadsheets.get({
    spreadsheetId,
    ranges: [`'${String(titulo).replace(/'/g, "''")}'!A1:E${modelo.ultimaFila}`],
    includeGridData: true,
    fields: 'sheets(properties(title,gridProperties),merges,data(columnMetadata(pixelSize),rowMetadata(pixelSize),'
      + 'rowData(values(userEnteredValue,userEnteredFormat(backgroundColor,backgroundColorStyle,textFormat,horizontalAlignment,borders)))))',
  });
  return compararConModelo(data.sheets[0], modelo);
}

module.exports = { compararConModelo, verificarInformeEnSheets };
