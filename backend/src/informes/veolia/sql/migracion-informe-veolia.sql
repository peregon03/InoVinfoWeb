-- InovInfo · Informe Veolia · migración ADITIVA e idempotente.
-- Antes de correrla: pg_dump inovinfodb > backup_$(date +%F_%H%M).sql
-- La app Android no usa estas columnas; no le afecta.

-- Texto exacto con que el suministro aparece en el informe (ej. "Sum - Cambio Accesorios General").
-- Si queda NULL, el informe usa "Sum {nombre}".
ALTER TABLE suministros ADD COLUMN IF NOT EXISTS texto_informe VARCHAR(255);

-- Trabajo sobre el Telo en la visita: 'revisado' | 'retirado' | NULL (sin trabajo de Telo).
-- Genera la fila "Revisión Telo" del informe.
ALTER TABLE visitas ADD COLUMN IF NOT EXISTS telo_accion VARCHAR(20);
