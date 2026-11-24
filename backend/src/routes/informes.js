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
        const { fechaDesde, fechaHasta, linkFotos } = req.body;
        // Acepta sedeIds (array) o sedeId (número) por compatibilidad
        let sedeIds = req.body.sedeIds;
        if (!sedeIds && req.body.sedeId) sedeIds = [req.body.sedeId];

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

        const sedes = sedesSeleccionadas.map((s) => s.nombre);

        const result = await generarInforme({
            fechaDesde,
            fechaHasta,
            sedeIds: idsValidos,
            sedes,
            linkFotos: linkFotos?.trim() || null,
        });

        // Log de verificación si hay diferencias
        if (result.verificacion && result.verificacion.length > 0) {
            console.error('Verificación del informe encontró diferencias:', result.verificacion);
        }

        res.json({
            sheetUrl: result.sheetUrl || null,
            pestana: result.pestana,
            totalVisitas: result.totalVisitas,
            totalUnidades: result.totalUnidades,
            sedesNombres: sedes.join(' + '),
            advertencias: result.advertencias || [],
            verificacion: result.verificacion || [],
        });
    } catch (err) {
        console.error('Error al generar informe:', err.message);
        const status = err.status || 500;
        res.status(status).json({ error: err.message || 'Error al generar el informe' });
    }
});

module.exports = router;
