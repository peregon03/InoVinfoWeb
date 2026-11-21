const router = require('express').Router();
const pool   = require('../config/db');
const { verificarToken, coordinadoraOPermiso } = require('../middleware/auth');
const { generarInforme } = require('../services/informeService');

router.use(verificarToken);
router.use(coordinadoraOPermiso('EXPORTAR_SHEETS'));

// GET /api/informes/sedes — lista sedes activas para el selector
router.get('/sedes', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, nombre FROM sedes WHERE activa = true ORDER BY nombre'
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error al listar sedes para informes:', err.message);
        res.status(500).json({ error: 'Error al obtener sedes' });
    }
});

// POST /api/informes/generar
// Body: { fechaDesde, fechaHasta, sedeIds: number[], linkFotos? }
router.post('/generar', async (req, res) => {
    try {
        const { fechaDesde, fechaHasta, sedeIds, linkFotos } = req.body;

        // Validaciones básicas
        if (!fechaDesde || !fechaHasta) {
            return res.status(400).json({ error: 'Las fechas son requeridas' });
        }
        if (!Array.isArray(sedeIds) || sedeIds.length === 0) {
            return res.status(400).json({ error: 'Debe seleccionar al menos una sede' });
        }

        const idsValidos = sedeIds.map((id) => parseInt(id, 10)).filter((id) => !isNaN(id));
        if (idsValidos.length === 0) {
            return res.status(400).json({ error: 'IDs de sedes inválidos' });
        }

        // Consultar nombres de sedes seleccionadas
        const sedesResult = await pool.query(
            'SELECT id, nombre FROM sedes WHERE id = ANY($1::int[]) ORDER BY nombre',
            [idsValidos]
        );
        const sedesSeleccionadas = sedesResult.rows;
        if (sedesSeleccionadas.length === 0) {
            return res.status(404).json({ error: 'No se encontraron las sedes indicadas' });
        }

        // Generar una pestaña por sede (formato Veolia original)
        let totalVisitas = 0;
        const pestanas = [];
        let sheetUrl = null;

        for (const sede of sedesSeleccionadas) {
            try {
                const result = await generarInforme({
                    fechaDesde,
                    fechaHasta,
                    sedeId: sede.id,
                    sedeNombre: sede.nombre,
                    linkFotos: linkFotos?.trim() || null,
                });
                totalVisitas += result.totalVisitas;
                pestanas.push(result.pestana);
                sheetUrl = result.sheetUrl;
            } catch (err) {
                // Saltar sedes sin visitas, lanzar otros errores
                if (err.message && err.message.includes('No hay visitas')) continue;
                throw err;
            }
        }

        if (totalVisitas === 0) {
            return res.status(404).json({ error: 'No hay visitas en el rango de fechas seleccionado' });
        }

        const nombresSedes = sedesSeleccionadas.map((s) => s.nombre).join(' + ');

        res.json({
            totalVisitas,
            pestana: pestanas.join(', '),
            sedesNombres: nombresSedes,
            sheetUrl: sheetUrl ? sheetUrl.split('#')[0] : null,
        });
    } catch (err) {
        console.error('Error al generar informe:', err.message);
        res.status(500).json({ error: err.message || 'Error al generar el informe' });
    }
});

module.exports = router;
