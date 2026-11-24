'use strict';
// Ejecutar con:  node --test test/
// La prueba "dorada" reconstruye la hoja de referencia "Cali 4Octu2026" celda por celda.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const {
  construirInforme, construirRequests, nombrePestana, tituloUnico, textoObservacion, textoSuministro, textoDeCelda,
} = require('../src');

const leer = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8'));
const VISITAS = leer('visitas-ejemplo-cali-4oct.json');
const ESPERADO = leer('esperado-cali-4oct.json');
const LINK_FOTOS = 'https://drive.google.com/drive/folders/1Qtkup4qmnHzKUth7JaiB7FWNd5wx09QV?usp=drive_link';
const OPCIONES = { sedes: ['Cali'], fechaHasta: '2026-10-04', linkFotos: LINK_FOTOS, urlImagenes: 'https://inovinfo.electroinova.com/informe-assets' };

test('dorada: cada celda de texto es idéntica a la hoja de referencia', () => {
  const m = construirInforme(VISITAS, OPCIONES);
  for (const [ref, esperado] of Object.entries(ESPERADO.celdas)) {
    assert.equal(textoDeCelda(m.celdas[ref]), esperado, `celda ${ref}`);
  }
  const conTexto = Object.keys(m.celdas).filter((ref) => textoDeCelda(m.celdas[ref]) != null);
  const sobrantes = conTexto.filter((ref) => !(ref in ESPERADO.celdas));
  assert.deepEqual(sobrantes, [], 'el informe no debe tener celdas con texto que la referencia no tiene');
});

test('dorada: las celdas combinadas son exactamente las de la referencia (+ A1:E1 del banner)', () => {
  const m = construirInforme(VISITAS, OPCIONES);
  const esperadas = new Set([...ESPERADO.merges, 'A1:E1']);
  assert.deepEqual(new Set(m.merges), esperadas);
  assert.equal(m.merges.length, esperadas.size, 'no debe haber combinaciones repetidas');
});

test('dorada: estructura, anchos, altos fijos e imágenes', () => {
  const m = construirInforme(VISITAS, OPCIONES);
  assert.equal(m.ultimaFilaDatos, 68);
  assert.equal(m.filaPie, 69);
  assert.equal(m.ultimaFila, 86);
  assert.equal(m.totalUnidades, 38);
  assert.equal(m.totalVisitas, 39);
  assert.deepEqual(m.anchosPx, ESPERADO.anchosPx);
  const filasFijas = [1, 2, 79, 80, 81, 82];
  assert.deepEqual(Object.keys(m.altosFijos).map(Number).sort((a, b) => a - b), filasFijas);
  for (const f of filasFijas) assert.equal(m.altosFijos[f], ESPERADO.altosPx[f], `alto fila ${f}`);
  assert.deepEqual(m.autoajustarFilas, { desde: 3, hasta: 68 });
  assert.match(m.celdas.A1.imagen, /\/banner\.png$/);
  assert.match(m.celdas.A69.imagen, /\/firma\.png$/);
  assert.match(m.celdas.E83.imagen, /\/logo\.jpg$/);
  assert.equal(m.nombrePestana, 'Cali 4Oct2026');
});

test('una unidad = un bloque: dobles envíos se colapsan a la última visita y "Pendiente" no entra', () => {
  const v = (id, hora, extra = {}) => ({
    id, unidad_id: 70, unidad_numero: '7070', sede_nombre: 'Buga', estado: 'Inoperativa',
    created_at: `2026-11-14T${hora}:00.000Z`, observacion_estructurada: null, suministros: [], ...extra,
  });
  const visitas = [
    v(1, '21:50'), v(2, '21:50'), v(3, '21:51'),
    v(4, '21:53', { estado: 'OK' }),
    { id: 5, unidad_id: 80, unidad_numero: '8000', sede_nombre: 'Tuluá', estado: 'Pendiente', created_at: '2026-11-14T22:00:00.000Z' },
  ];
  const m = construirInforme(visitas, { sedes: ['Buga', 'Tuluá'], fechaHasta: '2026-11-21', urlImagenes: 'https://x' });
  assert.equal(m.totalUnidades, 1);
  assert.equal(m.ultimaFilaDatos, 4);
  assert.equal(textoDeCelda(m.celdas.C4), '7070');
  assert.equal(textoDeCelda(m.celdas.E4), 'Se ejecutó el servicio de revisión, diagnóstico técnico, ajuste, reparación, mantenimiento general y limpieza del sistema de cámaras');
  assert.equal(m.advertencias.length, 1);
  assert.match(m.advertencias[0], /7070: 4 visitas/);
  assert.equal(m.nombrePestana, 'Buga + Tuluá 21Nov2026');
});

test('sin visitas no hay filas de datos (el generador no debe crear la pestaña)', () => {
  const m = construirInforme([], { sedes: ['Cali'], fechaHasta: '2026-11-21', urlImagenes: 'https://x' });
  assert.equal(m.totalUnidades, 0);
  assert.equal(m.autoajustarFilas, null);
});

test('textos de observación y suministros', () => {
  const base = { created_at: '2026-10-08T14:00:00.000Z', suministros: [] };
  assert.equal(
    textoObservacion({ ...base, estado: 'Con novedad', novedad_texto: 'Se encuentra la cámara lateral sucia.' }),
    'Se ejecutó el servicio de revisión, diagnóstico técnico, ajuste, reparación, mantenimiento general y limpieza del sistema de cámaras, durante la inspección se encuentra la cámara lateral sucia');
  assert.equal(
    textoObservacion({ ...base, estado: 'Sin llaves', es_otra_sede: true, base_nombre: 'Palmira' }),
    'Al momento de la inspección no se encontraron llaves (Unidad revisada en base operativa Palmira)');
  assert.equal(
    textoObservacion({ ...base, estado: 'Con novedad', es_extraordinaria: true, novedad_texto: 'Encontrándose la cámara de reversa sin funcionar',
      observacion_estructurada: 'Se ejecutó ... Visita extraordinaria a solicitud del área de mantenimiento' }),
    'A solicitud del area de mantenimiento se realiza visita el 8 de Octubre encontrándose la cámara de reversa sin funcionar');
  assert.equal(textoSuministro({ nombre: 'Cámara Reversa', cantidad: 1 }), 'Sum Cámara Reversa');
  assert.equal(textoSuministro({ nombre: 'x', texto_informe: 'Sum - Cambio Accesorios General', cantidad: 2 }), 'Sum - Cambio Accesorios General (2)');
  assert.equal(textoSuministro({ nombre: 'Sum. Accesorios general', cantidad: 1 }), 'Sum. Accesorios general');
  assert.equal(textoSuministro({ nombre: 'Reparación Main Board DVR Movil', cantidad: 1 }), 'Reparación Main Board DVR Movil');
});

test('nombre de pestaña y nombres repetidos', () => {
  assert.equal(nombrePestana(['Buga'], '2026-11-10'), 'Buga 10Nov2026');
  assert.equal(tituloUnico('Buga 10Nov2026', ['Buga 10Nov2026', 'Buga 10Nov2026 (2)']), 'Buga 10Nov2026 (3)');
});

test('requests de Google Sheets: una pestaña completa en un solo batchUpdate', () => {
  const m = construirInforme(VISITAS, OPCIONES);
  const req = construirRequests(m, { sheetId: 123456, titulo: m.nombrePestana });
  const de = (tipo) => req.filter((x) => x[tipo]).map((x) => x[tipo]);

  const [add] = de('addSheet');
  assert.ok(req[0].addSheet, 'addSheet debe ir primero');
  assert.deepEqual(add.properties.gridProperties, { rowCount: 1000, columnCount: 26, frozenRowCount: 3, hideGridlines: true });
  assert.deepEqual(de('mergeCells').length, m.merges.length);
  assert.ok(de('mergeCells').every((x) => x.mergeType === 'MERGE_ALL'));
  const anchos = de('updateDimensionProperties').filter((x) => x.range.dimension === 'COLUMNS').map((x) => x.properties.pixelSize);
  assert.deepEqual(anchos, [159, 114, 121, 284, 402]);

  const [valores] = de('updateCells');
  assert.equal(valores.rows.length, 86);
  assert.equal(valores.fields, 'userEnteredValue,textFormatRuns');
  const formulas = valores.rows.flatMap((f) => f.values).map((c) => c.userEnteredValue && c.userEnteredValue.formulaValue).filter(Boolean);
  assert.equal(formulas.length, 3);
  for (const f of formulas) assert.match(f, /^=IMAGE\("https:\/\/[^",;]+"\)$/, 'IMAGE con un solo argumento');
  // A4 es texto, no fecha ni número
  assert.deepEqual(valores.rows[3].values[0].userEnteredValue, { stringValue: '26/09/2026' });

  // nota con link: el tramo azul debe ser exactamente el link de fotos
  const nota = valores.rows[79].values[0];
  const texto = nota.userEnteredValue.stringValue;
  const runLink = nota.textFormatRuns.findIndex((r) => r.format.link);
  const desde = nota.textFormatRuns[runLink].startIndex;
  const hasta = nota.textFormatRuns[runLink + 1].startIndex;
  assert.equal(texto.slice(desde, hasta), LINK_FOTOS);
  assert.equal(nota.textFormatRuns[runLink].format.link.uri, LINK_FOTOS);

  const bordes = de('updateBorders');
  assert.equal(bordes.length, 2);
  assert.equal(bordes[1].innerHorizontal.style, 'SOLID_MEDIUM');
  assert.deepEqual(de('autoResizeDimensions')[0].dimensions, { sheetId: 123456, dimension: 'ROWS', startIndex: 2, endIndex: 68 });
});

test('verificador: la pestaña generada por el módulo pasa; la tabla plana vieja no', () => {
  const { compararConModelo } = require('../src');
  const { emularSheets } = require('../herramientas/emuladorSheets');
  const m = construirInforme(VISITAS, OPCIONES);
  const req = construirRequests(m, { sheetId: 7, titulo: m.nombrePestana });
  assert.deepEqual(compararConModelo(emularSheets(req), m), []);

  const sinUnaCombinacion = req.filter((x) => !(x.mergeCells && x.mergeCells.range.startRowIndex === 15));
  assert.ok(compararConModelo(emularSheets(sinUnaCombinacion), m).some((p) => p.startsWith('Falta combinar')));

  // Lo que genera hoy la app: encabezado plano de 14 columnas, sin título, sin combinaciones
  const plana = { properties: { gridProperties: {} }, merges: [], data: [{ rowData: [{ values:
    ['Fecha', 'Hora', 'Unidad', 'Placa', 'Sede'].map((t) => ({ userEnteredValue: { stringValue: t } })) }] }] };
  const problemas = compararConModelo(plana, m);
  assert.ok(problemas.length > 50, `la tabla plana debe fallar (falló ${problemas.length} veces)`);
});

test('generarInformeVeolia: crea la pestaña en un solo batchUpdate, nombre único y se autoverifica', async () => {
  const { generarInformeVeolia } = require('../src');
  const { emularSheets } = require('../herramientas/emuladorSheets');
  let creada = null;
  const llamadas = [];
  const sheets = { spreadsheets: {
    get: async (args) => {
      llamadas.push(args.includeGridData ? 'leer-pestaña' : 'listar-pestañas');
      if (args.includeGridData) return { data: { sheets: [creada] } };
      return { data: { sheets: [{ properties: { sheetId: 0, title: 'Cali 4Oct2026' } }] } };
    },
    batchUpdate: async ({ requestBody }) => { llamadas.push('batchUpdate'); creada = emularSheets(requestBody.requests); return { data: {} }; },
  } };
  const r = await generarInformeVeolia({ sheets, spreadsheetId: 'ID', visitas: VISITAS, ...OPCIONES });
  assert.deepEqual(llamadas, ['listar-pestañas', 'batchUpdate', 'leer-pestaña']);
  assert.equal(r.pestana, 'Cali 4Oct2026 (2)');
  assert.match(r.sheetUrl, /^https:\/\/docs\.google\.com\/spreadsheets\/d\/ID\/edit#gid=\d+$/);
  assert.deepEqual(r.verificacion, []);
  await assert.rejects(generarInformeVeolia({ sheets, spreadsheetId: 'ID', visitas: [], ...OPCIONES }), { status: 400 });
});
