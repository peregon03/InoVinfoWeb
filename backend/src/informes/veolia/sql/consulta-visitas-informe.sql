-- Visitas que alimentan el informe Veolia. Devuelve exactamente los campos que espera construirInforme().
-- $1 = fechaDesde 'YYYY-MM-DD'   $2 = fechaHasta 'YYYY-MM-DD'   $3 = ids de sedes (int[])
--
-- created_at es TIMESTAMP guardado en hora Colombia (la conexión usa America/Bogota), por eso
-- fecha_texto/hora_texto salen directo con to_char. Si en la BD real fuera TIMESTAMPTZ, usar
-- to_char(v.created_at AT TIME ZONE 'America/Bogota', ...).
-- Si el endpoint actual ya filtra por sede de otra forma que funciona, conserva ese filtro.

SELECT
  v.id,
  v.created_at,
  to_char(v.created_at, 'DD/MM/YYYY')                AS fecha_texto,
  to_char(v.created_at, 'HH24:MI')                   AS hora_texto,
  v.unidad_id,
  u.numero                                           AS unidad_numero,
  COALESCE(sv.nombre, su.nombre)                     AS sede_nombre,
  e.nombre                                           AS estado,
  v.novedad_texto,
  v.observacion_estructurada,
  COALESCE(v.es_extraordinaria, FALSE)               AS es_extraordinaria,
  COALESCE(v.es_otra_sede, FALSE)                    AS es_otra_sede,
  b.nombre                                           AS base_nombre,
  v.telo_accion,
  COALESCE(
    json_agg(json_build_object('nombre', s.nombre, 'texto_informe', s.texto_informe, 'cantidad', vs.cantidad)
             ORDER BY vs.id) FILTER (WHERE vs.id IS NOT NULL),
    '[]'::json)                                      AS suministros
FROM visitas v
JOIN unidades u           ON u.id = v.unidad_id
JOIN estados_visita e     ON e.id = v.estado_id
LEFT JOIN sedes sv        ON sv.id = v.sede_id
LEFT JOIN sedes su        ON su.id = u.sede_id
LEFT JOIN bases b         ON b.id = v.base_id
LEFT JOIN visita_suministros vs ON vs.visita_id = v.id
LEFT JOIN suministros s   ON s.id = vs.suministro_id
WHERE v.created_at >= $1::date
  AND v.created_at <  ($2::date + 1)
  AND COALESCE(v.sede_id, u.sede_id) = ANY($3::int[])
GROUP BY v.id, u.numero, sv.nombre, su.nombre, e.nombre, b.nombre
ORDER BY v.created_at;
