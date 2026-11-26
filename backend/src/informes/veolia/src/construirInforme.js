'use strict';
// Construye el MODELO del informe Veolia (qué va en cada celda, qué se combina, qué alto tiene cada fila).
// Función pura: no habla con Google ni con la base de datos. Es lo que verifica la prueba dorada.

const T = require('./textos');
const E = require('./estilo');

const COLUMNAS = ['A', 'B', 'C', 'D', 'E'];
const ESTADOS_EXCLUIDOS = new Set(['Pendiente']); // los seguimientos pendientes no van al informe

// ---------- fechas (siempre hora Colombia) ----------

function partesFecha(v) {
  // Preferido: fecha_texto 'DD/MM/YYYY' calculada en SQL con to_char → no depende de zonas horarias.
  if (v.fecha_texto) {
    const [d, m, y] = String(v.fecha_texto).split('/').map(Number);
    return { d, m, y };
  }
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(v.created_at));
  const valor = (tipo) => Number(partes.find((p) => p.type === tipo).value);
  return { d: valor('day'), m: valor('month'), y: valor('year') };
}

const dos = (n) => String(n).padStart(2, '0');

function fechaCorta(v) {
  const { d, m, y } = partesFecha(v);
  return `${dos(d)}/${dos(m)}/${y}`;
}

function horaCorta(v) {
  if (v.hora_texto) return String(v.hora_texto);
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(v.created_at));
}

const instante = (v) => new Date(v.created_at).getTime();

// ---------- textos de cada fila ----------

function normalizarHallazgo(texto) {
  const t = String(texto || '').trim().replace(/\s+/g, ' ').replace(/[.\s]+$/, '');
  return t ? t.charAt(0).toLocaleLowerCase('es') + t.slice(1) : '';
}

function textoPorEstado(v) {
  if (v.estado === 'Con novedad') {
    const hallazgo = normalizarHallazgo(v.novedad_texto);
    return hallazgo ? `${T.TEXTO_ESTANDAR}, durante la inspección ${hallazgo}` : T.TEXTO_ESTANDAR;
  }
  return T.TEXTO_POR_ESTADO[v.estado] || T.TEXTO_ESTANDAR;
}

function textoExtraordinaria(v) {
  const { d, m } = partesFecha(v);
  const prefijo = T.prefijoExtraordinaria(d, T.MESES_LARGOS[m - 1]);
  const hallazgo = normalizarHallazgo(v.novedad_texto);
  if (hallazgo) return `${prefijo} ${hallazgo}`;
  return `${prefijo}, ${normalizarHallazgo(T.TEXTO_ESTANDAR)}`;
}

function textoObservacion(v) {
  let texto = String(v.observacion_estructurada || '').trim();
  // Visitas extraordinarias guardadas con el formato viejo (sufijo ". Visita extraordinaria…") se rehacen.
  if (v.es_extraordinaria && !/^A solicitud del [aá]rea de mantenimiento/i.test(texto)) {
    texto = textoExtraordinaria(v);
  }
  if (!texto) texto = textoPorEstado(v);
  if (v.es_otra_sede && v.base_nombre && !texto.includes('(Unidad revisada en base operativa')) {
    texto += T.SUFIJO_OTRA_SEDE(v.base_nombre);
  }
  return texto;
}

function textoSuministro(s) {
  const nombre = String(s.nombre || '').trim();
  // Sin texto_informe: "Sum {nombre}", salvo que el nombre ya empiece por Sum/Suministro/Reparación (evita "Sum Sum. …").
  const porDefecto = /^(sum\b|sum\.|suministro\b|reparaci[oó]n\b)/i.test(nombre) ? nombre : `Sum ${nombre}`;
  const base = String(s.texto_informe || '').trim() || porDefecto;
  const cantidad = Number(s.cantidad) || 1;
  return cantidad > 1 ? `${base} (${cantidad})` : base;
}

// ---------- agrupación: UN bloque por unidad ----------

function armarBloques(visitas) {
  const advertencias = [];
  const grupos = new Map();
  for (const v of visitas || []) {
    if (ESTADOS_EXCLUIDOS.has(v.estado)) continue;
    const clave = v.unidad_id != null ? `id:${v.unidad_id}` : `num:${v.unidad_numero}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(v);
  }

  const bloques = [];
  let totalVisitas = 0;
  for (const lista of grupos.values()) {
    lista.sort((a, b) => instante(a) - instante(b) || (a.id || 0) - (b.id || 0));
    const extraordinarias = lista.filter((v) => v.es_extraordinaria);
    const regulares = lista.filter((v) => !v.es_extraordinaria);
    // Todas las visitas de la unidad van al informe (extraordinarias primero, luego regulares en orden cronológico).
    const delBloque = [...extraordinarias, ...regulares];
    totalVisitas += delBloque.length;
    const referencia = regulares.length ? regulares[regulares.length - 1] : extraordinarias[extraordinarias.length - 1];

    const filasMtto = [];
    for (const v of delBloque) {
      filasMtto.push(textoObservacion(v));
      for (const s of v.suministros || []) filasMtto.push(textoSuministro(s));
    }

    const actividades = [];
    const telo = [...regulares.slice().reverse(), ...extraordinarias.slice().reverse()]
      .map((v) => v && v.telo_accion)
      .find((accion) => accion && T.TEXTO_TELO[accion]);
    if (telo) actividades.push({ actividad: T.ACTIVIDAD_TELO, observacion: T.TEXTO_TELO[telo] });

    bloques.push({
      fecha: fechaCorta(referencia),
      sede: String(referencia.sede_nombre || ''),
      ref: String(referencia.unidad_numero == null ? '' : referencia.unidad_numero),
      orden: instante(referencia),
      filasMtto,
      actividades,
    });
  }
  bloques.sort((a, b) => a.orden - b.orden || a.ref.localeCompare(b.ref, 'es', { numeric: true }));
  return { bloques, advertencias, totalVisitas };
}

// ---------- nombre de la pestaña ----------

function nombrePestana(sedes, fechaHasta) {
  const [y, m, d] = String(fechaHasta).slice(0, 10).split('-').map(Number);
  const fecha = `${d}${T.MESES_CORTOS[m - 1]}${y}`;                 // ej: 21Nov2026
  const lugar = (sedes || []).filter(Boolean).join(' + ') || 'Informe';
  return `${lugar.slice(0, 99 - fecha.length)} ${fecha}`;
}

function tituloUnico(nombre, existentes) {
  const usados = new Set(existentes || []);
  if (!usados.has(nombre)) return nombre;
  for (let i = 2; ; i += 1) {
    const candidato = `${nombre} (${i})`;
    if (!usados.has(candidato)) return candidato;
  }
}

// ---------- modelo de la hoja ----------

function construirInforme(visitas, opciones = {}) {
  const { sedes = [], fechaHasta, linkFotos = '', urlImagenes = '' } = opciones;
  if (!fechaHasta) throw new Error('construirInforme: falta opciones.fechaHasta (YYYY-MM-DD)');
  const base = String(urlImagenes).replace(/\/+$/, '');

  const { bloques, advertencias, totalVisitas } = armarBloques(visitas);

  const celdas = {};            // 'E4' -> { texto } | { partes: [{texto, link?}] } | { imagen: url }
  const merges = [];            // ['A2:E2', ...]
  const estilos = [];           // [{ rango: 'A3:E3', estilo: 'encabezado' }]
  const bordes = [];            // [{ rango: 'A4:E68', tipo: 'datos' }]
  const altosFijos = {};        // { 1: 102, ... }  (las filas de datos NO llevan alto fijo: se autoajustan)

  // Fila 1: banner (imagen de ancho completo A:E)
  celdas.A1 = { imagen: `${base}/banner.png` };
  merges.push('A1:E1');
  estilos.push({ rango: 'A1:E1', estilo: 'imagen' });
  altosFijos[1] = E.ALTO_PX.banner;

  // Fila 2: título
  celdas.A2 = { texto: T.TITULO };
  merges.push('A2:E2');
  estilos.push({ rango: 'A2:E2', estilo: 'titulo' });
  altosFijos[2] = E.ALTO_PX.titulo;

  // Fila 3: encabezados
  T.ENCABEZADOS.forEach((texto, i) => { celdas[`${COLUMNAS[i]}3`] = { texto }; });
  estilos.push({ rango: 'A3:E3', estilo: 'encabezado' });
  bordes.push({ rango: 'A3:E3', tipo: 'encabezado' });

  // Filas de datos: un bloque por unidad
  let fila = E.PRIMERA_FILA_DATOS;
  for (const b of bloques) {
    const inicio = fila;
    const nMtto = b.filasMtto.length;
    const total = nMtto + b.actividades.length;
    celdas[`A${inicio}`] = { texto: b.fecha };
    celdas[`B${inicio}`] = { texto: b.sede };
    celdas[`C${inicio}`] = { texto: b.ref };
    celdas[`D${inicio}`] = { texto: T.ACTIVIDAD_MTTO };
    b.filasMtto.forEach((texto, i) => { celdas[`E${inicio + i}`] = { texto }; });
    b.actividades.forEach((a, i) => {
      celdas[`D${inicio + nMtto + i}`] = { texto: a.actividad };
      celdas[`E${inicio + nMtto + i}`] = { texto: a.observacion };
    });
    const fin = inicio + total - 1;
    if (total > 1) ['A', 'B', 'C'].forEach((c) => merges.push(`${c}${inicio}:${c}${fin}`));
    if (nMtto > 1) merges.push(`D${inicio}:D${inicio + nMtto - 1}`);
    fila += total;
  }
  const ultimaFilaDatos = fila - 1;
  if (bloques.length) {
    const desde = E.PRIMERA_FILA_DATOS;
    estilos.push({ rango: `A${desde}:C${ultimaFilaDatos}`, estilo: 'datoCentroNegrita' });
    estilos.push({ rango: `D${desde}:D${ultimaFilaDatos}`, estilo: 'datoCentro' });
    estilos.push({ rango: `E${desde}:E${ultimaFilaDatos}`, estilo: 'datoIzquierda' });
    bordes.push({ rango: `A${desde}:E${ultimaFilaDatos}`, tipo: 'datos' });
  }

  // Pie: empieza en la fila siguiente al último dato, SIN filas vacías en medio.
  const f = ultimaFilaDatos + 1;
  const finFirma = f + E.PIE.filasFirma - 1;                 // f..f+5
  celdas[`A${f}`] = { imagen: `${base}/firma.png` };
  merges.push(`A${f}:C${finFirma}`);
  estilos.push({ rango: `A${f}:C${finFirma}`, estilo: 'imagen' });

  const fNombre = finFirma + 1;                              // f+6
  celdas[`A${fNombre}`] = { texto: T.FIRMA.nombre };
  celdas[`A${fNombre + 1}`] = { texto: T.FIRMA.cargo };
  celdas[`A${fNombre + 2}`] = {
    partes: [
      { texto: T.FIRMA.etiquetaEmail },
      { texto: T.FIRMA.email, link: `mailto:${T.FIRMA.email}` },
    ],
  };
  for (let r = fNombre; r <= fNombre + 2; r += 1) merges.push(`A${r}:C${r}`);
  estilos.push({ rango: `A${fNombre}:C${fNombre + 2}`, estilo: 'firma' });

  const fSeparador = fNombre + 4;                            // f+10 (f+9 queda vacía con alto normal)
  altosFijos[fSeparador] = E.ALTO_PX.separador;

  const fNotas = fSeparador + 1;                             // f+11 y f+12, combinadas A:E
  celdas[`A${fNotas}`] = {
    partes: [
      { texto: T.NOTA_1_ANTES_DEL_LINK },
      { texto: linkFotos, link: linkFotos },
      { texto: T.NOTA_2_DESPUES_DEL_LINK },
    ].filter((p) => p.texto),
  };
  merges.push(`A${fNotas}:E${fNotas + 1}`);
  altosFijos[fNotas] = E.ALTO_PX.notas[0];
  altosFijos[fNotas + 1] = E.ALTO_PX.notas[1];

  const fNota3 = fNotas + 2;                                 // f+13
  celdas[`A${fNota3}`] = { texto: T.NOTA_3 };
  merges.push(`A${fNota3}:E${fNota3}`);
  altosFijos[fNota3] = E.ALTO_PX.nota3;
  estilos.push({ rango: `A${fNotas}:E${fNota3}`, estilo: 'nota' });

  const fLogo = fNota3 + 1;                                  // f+14 .. f+17
  const finLogo = fLogo + E.PIE.filasLogo - 1;
  merges.push(`A${fLogo}:D${fLogo}`);
  celdas[`E${fLogo}`] = { imagen: `${base}/logo.jpg` };
  merges.push(`E${fLogo}:E${finLogo}`);
  estilos.push({ rango: `E${fLogo}:E${finLogo}`, estilo: 'imagen' });

  return {
    nombrePestana: nombrePestana(sedes, fechaHasta),
    anchosPx: Object.fromEntries(COLUMNAS.map((c, i) => [c, E.ANCHOS_PX[i]])),
    celdas,
    merges,
    estilos,
    bordes,
    altosFijos,
    autoajustarFilas: bloques.length ? { desde: E.FILA_ENCABEZADOS, hasta: ultimaFilaDatos } : null,
    filasCongeladas: E.FILAS_CONGELADAS,
    ultimaFilaDatos,
    filaPie: f,
    ultimaFila: finLogo,
    totalUnidades: bloques.length,
    totalVisitas,
    advertencias,
  };
}

// Texto plano de una celda del modelo (sirve para pruebas y vistas previas).
function textoDeCelda(celda) {
  if (!celda) return null;
  if (celda.partes) return celda.partes.map((p) => p.texto).join('');
  return celda.texto == null ? null : celda.texto;
}

module.exports = {
  construirInforme, armarBloques, nombrePestana, tituloUnico, textoObservacion, textoSuministro, textoDeCelda,
};
