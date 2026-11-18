-- 003_suministros_unique.sql — Constraint única en visita_suministros para prevenir duplicados
-- Idempotente: se puede ejecutar varias veces sin error
--
-- Esta constraint es necesaria para que el ON CONFLICT (visita_id, suministro_id)
-- en el INSERT de suministros funcione correctamente.

-- Eliminar duplicados existentes antes de crear la constraint (conserva el de mayor cantidad)
DELETE FROM visita_suministros a
USING visita_suministros b
WHERE a.id > b.id
  AND a.visita_id = b.visita_id
  AND a.suministro_id = b.suministro_id;

-- Agregar constraint única si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ux_visita_suministros_visita_suministro'
    ) THEN
        ALTER TABLE visita_suministros
            ADD CONSTRAINT ux_visita_suministros_visita_suministro
            UNIQUE (visita_id, suministro_id);
    END IF;
END
$$;
