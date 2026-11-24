'use strict';
// Convierte el modelo de construirInforme() en la lista de requests de spreadsheets.batchUpdate.
// Todo va en UNA sola llamada batchUpdate (es atómica: o se crea la pestaña completa o no se crea nada).

const E = require('./estilo');

// ---------- utilidades ----------

function hexARgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
}
const color = (hex) => ({ rgbColor: hexARgb(hex) });

function indiceColumna(letras) {
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function rango(a1, sheetId) {
  const [ini, fin = ini] = a1.split(':');
  const parte = (ref) => {
    const m = /^([A-Z]+)(\d+)$/.exec(ref);
    if (!m) throw new Error(`Referencia A1 inválida: ${ref}`);
    return { col: indiceColumna(m[1]), fila: Number(m[2]) - 1 };
  };
  const a = parte(ini);
  const b = parte(fin);
  return {
    sheetId,
    startRowIndex: a.fila, endRowIndex: b.fila + 1,
    startColumnIndex: a.col, endColumnIndex: b.col + 1,
  };
}

const textoFormato = (tamano, negrita, hex) => ({
  fontFamily: E.FUENTE,
  fontSize: tamano,
  bold: negrita,
  italic: false,
  underline: false,
  strikethrough: false,
  foregroundColorStyle: color(hex),
});

// ---------- formatos de celda (medidos en la hoja de referencia) ----------

const FORMATOS = {
  imagen: { horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' },
  titulo: {
    backgroundColorStyle: color(E.COLOR.verde),
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP',
    textFormat: textoFormato(15, false, E.COLOR.blanco),
  },
  encabezado: {
    backgroundColorStyle: color(E.COLOR.verde),
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP',
    textFormat: textoFormato(11, true, E.COLOR.blanco),
  },
  datoCentroNegrita: {   // A Fecha, B Unidad de negocio, C Ref. Vehículo
    backgroundColorStyle: color(E.COLOR.blanco),
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP',
    textFormat: textoFormato(10, true, E.COLOR.negro),
  },
  datoCentro: {          // D Actividad
    backgroundColorStyle: color(E.COLOR.blanco),
    horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP',
    textFormat: textoFormato(10, false, E.COLOR.negro),
  },
  datoIzquierda: {       // E Observación y suministros
    backgroundColorStyle: color(E.COLOR.blanco),
    horizontalAlignment: 'LEFT', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP',
    textFormat: textoFormato(10, false, E.COLOR.negro),
  },
  firma: {
    horizontalAlignment: 'LEFT', verticalAlignment: 'MIDDLE', wrapStrategy: 'OVERFLOW_CELL',
    textFormat: textoFormato(11, true, E.COLOR.negro),
  },
  nota: {
    horizontalAlignment: 'LEFT', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP',
    textFormat: textoFormato(11, true, E.COLOR.negro),
  },
};

const CAMPOS_FORMATO =
  'userEnteredFormat(backgroundColorStyle,horizontalAlignment,verticalAlignment,wrapStrategy,textFormat)';

const linea = (estilo, hex) => ({ style: estilo, colorStyle: color(hex) });

const BORDES = {
  encabezado: {
    top: linea('SOLID', E.COLOR.bordeEncabezado),
    left: linea('SOLID', E.COLOR.bordeEncabezado),
    right: linea('SOLID', E.COLOR.bordeEncabezado),
    innerVertical: linea('SOLID', E.COLOR.verde),
  },
  datos: {
    top: linea('SOLID_MEDIUM', E.COLOR.bordeDatos),
    bottom: linea('SOLID_MEDIUM', E.COLOR.bordeDatos),
    left: linea('SOLID_MEDIUM', E.COLOR.bordeDatos),
    right: linea('SOLID_MEDIUM', E.COLOR.bordeDatos),
    innerHorizontal: linea('SOLID_MEDIUM', E.COLOR.bordeDatos),
    innerVertical: linea('SOLID_MEDIUM', E.COLOR.bordeDatos),
  },
};

// ---------- valores ----------

function datoDeCelda(celda) {
  if (!celda) return {};
  if (celda.imagen) {
    // UN solo argumento a propósito: así la fórmula no depende del separador (, o ;) del idioma de la hoja.
    return { userEnteredValue: { formulaValue: `=IMAGE("${celda.imagen}")` } };
  }
  if (celda.partes) {
    let indice = 0;
    const runs = [];
    for (const p of celda.partes) {
      runs.push({
        startIndex: indice,
        format: p.link
          ? { foregroundColorStyle: color(E.COLOR.link), underline: true, link: { uri: p.link } }
          : { foregroundColorStyle: color(E.COLOR.negro), underline: false },
      });
      indice += p.texto.length; // índices en unidades UTF-16 = .length de JavaScript
    }
    return { userEnteredValue: { stringValue: celda.partes.map((p) => p.texto).join('') }, textFormatRuns: runs };
  }
  // stringValue SIEMPRE (nunca USER_ENTERED): así "04/10/2026" no se vuelve fecha ni "16029" número.
  return { userEnteredValue: { stringValue: String(celda.texto) } };
}

// ---------- requests ----------

function construirRequests(modelo, { sheetId, titulo }) {
  if (!Number.isInteger(sheetId) || sheetId < 0) throw new Error('construirRequests: sheetId inválido');
  const r = [];

  r.push({
    addSheet: {
      properties: {
        sheetId,
        title: titulo || modelo.nombrePestana,
        gridProperties: {
          rowCount: Math.max(1000, modelo.ultimaFila + 20),
          columnCount: 26,
          frozenRowCount: modelo.filasCongeladas,
          hideGridlines: true,
        },
      },
    },
  });

  Object.entries(modelo.anchosPx).forEach(([letra, px]) => {
    const c = indiceColumna(letra);
    r.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: c, endIndex: c + 1 },
        properties: { pixelSize: px },
        fields: 'pixelSize',
      },
    });
  });

  for (const { rango: a1, estilo } of modelo.estilos) {
    const formato = FORMATOS[estilo];
    if (!formato) throw new Error(`Estilo desconocido: ${estilo}`);
    r.push({ repeatCell: { range: rango(a1, sheetId), cell: { userEnteredFormat: formato }, fields: CAMPOS_FORMATO } });
  }

  const filas = [];
  for (let f = 1; f <= modelo.ultimaFila; f += 1) {
    filas.push({ values: ['A', 'B', 'C', 'D', 'E'].map((c) => datoDeCelda(modelo.celdas[`${c}${f}`])) });
  }
  r.push({
    updateCells: {
      range: rango(`A1:E${modelo.ultimaFila}`, sheetId),
      rows: filas,
      fields: 'userEnteredValue,textFormatRuns',
    },
  });

  for (const a1 of modelo.merges) {
    r.push({ mergeCells: { range: rango(a1, sheetId), mergeType: 'MERGE_ALL' } });
  }

  for (const { rango: a1, tipo } of modelo.bordes) {
    r.push({ updateBorders: { range: rango(a1, sheetId), ...BORDES[tipo] } });
  }

  for (const [fila, px] of Object.entries(modelo.altosFijos)) {
    const i = Number(fila) - 1;
    r.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'ROWS', startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: px },
        fields: 'pixelSize',
      },
    });
  }

  if (modelo.autoajustarFilas) {
    const { desde, hasta } = modelo.autoajustarFilas;
    r.push({ autoResizeDimensions: { dimensions: { sheetId, dimension: 'ROWS', startIndex: desde - 1, endIndex: hasta } } });
  }

  return r;
}

module.exports = { construirRequests, FORMATOS, BORDES, rango, hexARgb };
