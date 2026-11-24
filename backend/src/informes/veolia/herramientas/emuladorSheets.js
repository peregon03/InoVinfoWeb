'use strict';
// Emulador mínimo (solo para pruebas): aplica los requests que usa el módulo y devuelve la hoja
// con la misma forma que responde spreadsheets.get({ includeGridData: true }).

function emularSheets(requests) {
  const hoja = { properties: {}, merges: [], data: [{ columnMetadata: [], rowMetadata: [], rowData: [] }] };
  const d = hoja.data[0];
  const celda = (r, c) => {
    if (!d.rowData[r]) d.rowData[r] = { values: [] };
    if (!d.rowData[r].values[c]) d.rowData[r].values[c] = {};
    return d.rowData[r].values[c];
  };
  const recorrer = (g, fn) => {
    for (let r = g.startRowIndex; r < g.endRowIndex; r += 1) {
      for (let c = g.startColumnIndex; c < g.endColumnIndex; c += 1) fn(celda(r, c), r, c);
    }
  };
  for (const q of requests) {
    const [tipo, v] = Object.entries(q)[0];
    if (tipo === 'addSheet') {
      hoja.properties = { title: v.properties.title, gridProperties: { ...v.properties.gridProperties } };
    } else if (tipo === 'updateDimensionProperties') {
      const destino = v.range.dimension === 'COLUMNS' ? d.columnMetadata : d.rowMetadata;
      for (let i = v.range.startIndex; i < v.range.endIndex; i += 1) destino[i] = { pixelSize: v.properties.pixelSize };
    } else if (tipo === 'repeatCell') {
      recorrer(v.range, (c) => {
        const bordes = c.userEnteredFormat && c.userEnteredFormat.borders;
        c.userEnteredFormat = { ...v.cell.userEnteredFormat, ...(bordes ? { borders: bordes } : {}) };
      });
    } else if (tipo === 'updateCells') {
      v.rows.forEach((fila, i) => fila.values.forEach((valor, j) => {
        const c = celda(v.range.startRowIndex + i, v.range.startColumnIndex + j);
        if (valor.userEnteredValue) c.userEnteredValue = valor.userEnteredValue;
      }));
    } else if (tipo === 'mergeCells') {
      hoja.merges.push(v.range);
    } else if (tipo === 'updateBorders') {
      const g = v.range;
      recorrer(g, (c, r, col) => {
        const f = c.userEnteredFormat || (c.userEnteredFormat = {});
        f.borders = {
          top: r === g.startRowIndex ? v.top : v.innerHorizontal,
          bottom: r === g.endRowIndex - 1 ? v.bottom : v.innerHorizontal,
          left: col === g.startColumnIndex ? v.left : v.innerVertical,
          right: col === g.endColumnIndex - 1 ? v.right : v.innerVertical,
        };
      });
    }
  }
  return hoja;
}

module.exports = { emularSheets };
