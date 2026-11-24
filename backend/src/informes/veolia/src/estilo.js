'use strict';
// Medidas y colores medidos en la hoja de referencia "Cali 4Octu2026" (exportada de Google Sheets).
// Anchos: Google Sheets exporta ancho_xlsx = px/8 + 0.125  →  px = (ancho_xlsx - 0.125) * 8.
// Altos:  px = puntos * 4/3.

const COLOR = {
  verde: '#356854',          // fondo del título y de la fila de encabezados
  bordeEncabezado: '#284E3F',// borde exterior fino de la fila de encabezados
  bordeDatos: '#4A86E8',     // borde MEDIO (grueso) de todas las celdas de datos
  blanco: '#FFFFFF',
  negro: '#000000',
  link: '#1155CC',           // links (email y carpeta de fotos): azul + subrayado
};

const FUENTE = 'Arial';

// Columnas A..E en píxeles (total 1080 px).
const ANCHOS_PX = [159, 114, 121, 284, 402];

const ALTO_PX = {
  banner: 102,       // fila 1
  titulo: 24,        // fila 2
  separador: 11,     // fila vacía angosta antes de las notas
  notas: [47, 70],   // las 2 filas de la celda combinada Nota 1 + Nota 2
  nota3: 27,
};

// Estructura del pie, en filas, contada desde la primera fila después de los datos.
const PIE = {
  filasFirma: 6,     // imagen de la firma, combinada A:C
  filasLogo: 4,      // logo Electroinova, combinado en la columna E
};

const FILA_TITULO = 2;
const FILA_ENCABEZADOS = 3;
const PRIMERA_FILA_DATOS = 4;
const FILAS_CONGELADAS = 3;

module.exports = {
  COLOR, FUENTE, ANCHOS_PX, ALTO_PX, PIE, FILA_TITULO, FILA_ENCABEZADOS, PRIMERA_FILA_DATOS, FILAS_CONGELADAS,
};
