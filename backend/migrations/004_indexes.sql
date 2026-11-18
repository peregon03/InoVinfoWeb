-- 004_indexes.sql — Índices de rendimiento para consultas frecuentes
-- Idempotente: IF NOT EXISTS en todos los índices

-- visitas: filtrado por fecha (GET /api/visitas, /hoy, /progreso, /unidades/estado)
CREATE INDEX IF NOT EXISTS ix_visitas_created_at    ON visitas(created_at DESC);

-- visitas: filtrado por unidad (GET /api/visitas?unidad_id, /suministros-recientes)
CREATE INDEX IF NOT EXISTS ix_visitas_unidad_id     ON visitas(unidad_id);

-- visitas: filtrado por sede (GET /api/informes/generar WHERE sede_id = ANY(...))
CREATE INDEX IF NOT EXISTS ix_visitas_sede_id       ON visitas(sede_id);

-- visitas: filtrado por técnico (futuro, ya que tecnico_id es FK sin índice automático en PG)
CREATE INDEX IF NOT EXISTS ix_visitas_tecnico_id    ON visitas(tecnico_id);

-- visita_fotos: lookup por visita (carga de fotos en GET /api/visitas)
CREATE INDEX IF NOT EXISTS ix_visita_fotos_visita   ON visita_fotos(visita_id);

-- visita_suministros: lookup por visita (carga de suministros en GET /api/visitas)
CREATE INDEX IF NOT EXISTS ix_visita_sums_visita    ON visita_suministros(visita_id);

-- seguimientos: búsqueda de seguimientos abiertos por unidad (/api/seguimientos, /api/visitas/pendientes)
-- Ya existe ix_seguimientos_unidad_estado en 002_seguimientos.sql, pero falta el índice de estado solo
CREATE INDEX IF NOT EXISTS ix_seguimientos_estado   ON seguimientos(estado) WHERE estado = 'abierto';

-- seguimiento_revisiones: lookup por seguimiento_id
CREATE INDEX IF NOT EXISTS ix_seg_revisiones_seg    ON seguimiento_revisiones(seguimiento_id);
