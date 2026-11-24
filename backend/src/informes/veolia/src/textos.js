'use strict';
// Textos fijos del informe Veolia, copiados LITERALMENTE de la hoja de referencia "Cali 4Octu2026".
// No los reescribas: si hay que cambiar una palabra, se cambia aquí y en ningún otro lugar.

const TITULO = 'VISITA TÉCNICA ELECTROINOVA A SEDE OPERATIVA';

const ENCABEZADOS = ['Fecha', 'Unidad de negocio', 'Ref. Vehículo', 'Actividad', 'Observación'];

// Ojo: empieza con punto medio "·" (U+00B7) seguido de un espacio.
const ACTIVIDAD_MTTO = '· Mtto preventivo y correctivo Dvr Movil';

const ACTIVIDAD_TELO = 'Revisión Telo';

const TEXTO_ESTANDAR =
  'Se ejecutó el servicio de revisión, diagnóstico técnico, ajuste, reparación, mantenimiento general y limpieza del sistema de cámaras';

// Texto de la observación cuando la visita NO trae observacion_estructurada.
const TEXTO_POR_ESTADO = {
  'Inoperativa': 'Al momento de la visita esta unidad se encuentra inoperativa',
  'Sin llaves': 'Al momento de la inspección no se encontraron llaves',
  'No está en la base': 'Al momento de la visita la unidad no se encontraba en la base',
  'Bat. desconectada': 'Al momento de la visita la batería de la unidad se encontraba desconectada',
};

// Fila adicional "Revisión Telo" (columna D) con su propia observación (columna E).
const TEXTO_TELO = {
  revisado: 'Se ejecutó el servicio de revisión, ajuste y reparación, verificando su correcto funcionamiento.',
  retirado: 'Se retira telo para revision y mantenimiento por que en el momento de la inspección no funcionaba',
};

// Inicio del texto de una visita extraordinaria. Ej: "... se realiza visita el 8 de Octubre encontrándose ..."
const prefijoExtraordinaria = (dia, mesLargo) =>
  `A solicitud del area de mantenimiento se realiza visita el ${dia} de ${mesLargo}`;

const SUFIJO_OTRA_SEDE = (base) => ` (Unidad revisada en base operativa ${base})`;

const FIRMA = {
  nombre: 'Jhon Fernando Agudelo A.',
  cargo: 'Ingeniero Electrónico Electroinova SAS',
  etiquetaEmail: 'E-mail: ',
  email: 'electroinova.soluciones@gmail.com',
};

// Nota 1 + Nota 2 van en UNA sola celda combinada; el link de fotos va en medio (azul, subrayado).
const NOTA_1_ANTES_DEL_LINK =
  '*Todas las reparaciones e instalaciones ejecutadas contaron con el acompañamiento y supervisión de personal designado por la entidad contratante, dejando constancia de las labores realizadas. Como soporte de lo anterior, se anexa el respectivo registro fotográfico en el siguiente enlace.  Link: ';
const NOTA_2_DESPUES_DEL_LINK =
  '\n\n*Es importante aclarar que Electroinova no será responsable por la no ejecución de intervenciones programadas en aquellas unidades que, al momento de la visita técnica, se encontraran inoperativas, fuera de servicio, ausentes o no disponibles para su atención, sin afectar el alcance pactado.';
const NOTA_3 =
  '* Concientizar al personal de la compañía de la importancia del buen uso, manejo y limpieza de los elementos y equipos del sistema de grabación móvil.';

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES_LARGOS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto',
  'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

module.exports = {
  TITULO, ENCABEZADOS, ACTIVIDAD_MTTO, ACTIVIDAD_TELO, TEXTO_ESTANDAR, TEXTO_POR_ESTADO, TEXTO_TELO,
  prefijoExtraordinaria, SUFIJO_OTRA_SEDE, FIRMA, NOTA_1_ANTES_DEL_LINK, NOTA_2_DESPUES_DEL_LINK, NOTA_3,
  MESES_CORTOS, MESES_LARGOS,
};
