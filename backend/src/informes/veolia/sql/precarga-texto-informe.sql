-- Precarga de texto_informe para suministros existentes (tabla 3.6 del spec).
-- Ejecutar DESPUÉS de la migración. Usa ILIKE para tolerancia a mayúsculas.
-- Solo actualiza si texto_informe está vacío (no sobreescribe si ya se llenó manualmente).

UPDATE suministros SET texto_informe = 'Sum - Cambio Accesorios General'
WHERE nombre ILIKE '%accesorios general%' AND texto_informe IS NULL;

UPDATE suministros SET texto_informe = 'Sum - Cambio Unidad M.2-500MB/S-SSD240GB Especial Sistema Grabación Móvil'
WHERE nombre ILIKE '%M.2%SSD%' AND texto_informe IS NULL;

UPDATE suministros SET texto_informe = 'Sum - Cambio Batería Respaldo Interno Especial Sistema Grabación Móvil'
WHERE nombre ILIKE '%batería respaldo%' AND texto_informe IS NULL;

UPDATE suministros SET texto_informe = 'Sum - Cambio Tarjeta Conexión Inalámbrica Wifi Especial Sistema Móvil'
WHERE nombre ILIKE '%tarjeta%wifi%' AND texto_informe IS NULL;

UPDATE suministros SET texto_informe = 'Sum Tarjeta Video Especial V/CA 1080 Sistema Dvr Móvil'
WHERE nombre ILIKE '%tarjeta video%1080%' AND texto_informe IS NULL;

UPDATE suministros SET texto_informe = 'Sum - Cambio Cable Encauchetado Especial Con Protección Fase De Video X15 Mts'
WHERE nombre ILIKE '%cable encauchetado%15%' AND texto_informe IS NULL;

UPDATE suministros SET texto_informe = 'Sum - Cambio Cable Encauchetado Especial Con Protección Fase De Video X2 Mts'
WHERE nombre ILIKE '%cable encauchetado%X2%' AND texto_informe IS NULL;

UPDATE suministros SET texto_informe = 'Sum - Cambio Cable Encauchetado Especial Con Protección Fase De Video X1.5 Mts'
WHERE nombre ILIKE '%cable encauchetado%1.5%' AND texto_informe IS NULL;

UPDATE suministros SET texto_informe = 'Suministro e Instalación Visor/Monitor 7'''
WHERE nombre ILIKE '%visor%monitor%7%' AND texto_informe IS NULL;

UPDATE suministros SET texto_informe = 'Suministro Base Ecualizable Especial Pantalla-Visor 7"'
WHERE nombre ILIKE '%base ecualizable%7%' AND texto_informe IS NULL;

UPDATE suministros SET texto_informe = 'Cables De Conexión DC/RCA Especial Monitor 7"'
WHERE nombre ILIKE '%cable%DC/RCA%monitor%7%' AND texto_informe IS NULL;

UPDATE suministros SET texto_informe = 'Reparación Main Board Dvr Móvil'
WHERE nombre ILIKE '%main board%' AND texto_informe IS NULL;
