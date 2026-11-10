-- 002_seguimientos.sql — Tablas de seguimientos + backfill desde visitas.requiere_seguimiento
-- Idempotente: se puede ejecutar varias veces sin error

CREATE TABLE IF NOT EXISTS seguimientos (
  id SERIAL PRIMARY KEY,
  unidad_id INTEGER NOT NULL REFERENCES unidades(id),
  visita_origen_id INTEGER REFERENCES visitas(id) ON DELETE SET NULL,
  nota TEXT NOT NULL,
  fecha_recordatorio DATE,
  creado_por INTEGER REFERENCES usuarios(id),
  created_at TIMESTAMP DEFAULT NOW(),
  estado VARCHAR(10) NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','resuelto')),
  resuelto_por INTEGER REFERENCES usuarios(id),
  resuelto_at TIMESTAMP,
  visita_resolucion_id INTEGER REFERENCES visitas(id) ON DELETE SET NULL,
  comentario_resolucion TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_seguimientos_origen ON seguimientos(visita_origen_id) WHERE visita_origen_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_seguimientos_unidad_estado ON seguimientos(unidad_id, estado);

CREATE TABLE IF NOT EXISTS seguimiento_revisiones (
  id SERIAL PRIMARY KEY,
  seguimiento_id INTEGER REFERENCES seguimientos(id) ON DELETE CASCADE,
  visita_id INTEGER REFERENCES visitas(id) ON DELETE CASCADE,
  comentario TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Backfill: los seguimientos viejos de visitas.requiere_seguimiento pasan a la tabla nueva como abiertos
INSERT INTO seguimientos (unidad_id, visita_origen_id, nota, fecha_recordatorio, creado_por, created_at)
SELECT unidad_id, id, COALESCE(NULLIF(nota_seguimiento,''), 'Seguimiento pendiente'), fecha_seguimiento, tecnico_id, created_at
FROM visitas WHERE requiere_seguimiento = TRUE
ON CONFLICT DO NOTHING;
