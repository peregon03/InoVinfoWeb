-- InovInfo Web Migration - Aditiva e idempotente
-- Ejecutar en la base inovinfodb

-- 1. Bases operativas (lugar físico donde se revisa la unidad)
CREATE TABLE IF NOT EXISTS bases (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    activa BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);
INSERT INTO bases (nombre) VALUES ('Palmira') ON CONFLICT DO NOTHING;

-- 2. Estados nuevos de visita
INSERT INTO estados_visita (nombre, color_hex) VALUES
  ('No está en la base', '#5C6BC0'),
  ('Pendiente',          '#EF6C00')
ON CONFLICT (nombre) DO NOTHING;

-- 3. Campos nuevos en visitas
ALTER TABLE visitas
  ADD COLUMN IF NOT EXISTS sede_id           INTEGER REFERENCES sedes(id),
  ADD COLUMN IF NOT EXISTS base_id           INTEGER REFERENCES bases(id),
  ADD COLUMN IF NOT EXISTS atraso_hora_min   INTEGER,
  ADD COLUMN IF NOT EXISTS dias_grabacion    INTEGER,
  ADD COLUMN IF NOT EXISTS h264_plus         BOOLEAN,
  ADD COLUMN IF NOT EXISTS checklist         JSONB,
  ADD COLUMN IF NOT EXISTS es_extraordinaria BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS es_otra_sede      BOOLEAN DEFAULT FALSE;

-- 4. Campos nuevos en visita_fotos
ALTER TABLE visita_fotos
  ADD COLUMN IF NOT EXISTS tipo VARCHAR(10) DEFAULT 'despues',
  ADD COLUMN IF NOT EXISTS drive_file_id TEXT;

-- 5. Tabla de configuración de la app
CREATE TABLE IF NOT EXISTS app_config (
    clave VARCHAR(100) PRIMARY KEY,
    valor TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);
