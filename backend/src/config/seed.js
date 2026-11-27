const pool = require('./db');

// Inserta los valores mínimos necesarios para que la app funcione
// Se ejecuta al arrancar el servidor — es idempotente (no duplica si ya existen)
async function seedDefaults() {
    try {
        // ── Estados de visita ──────────────────────────────────────────────────
        // Son valores fijos de negocio; la app no puede funcionar sin ellos
        const { rows: [{ count: ec }] } = await pool.query('SELECT COUNT(*) FROM estados_visita');
        if (parseInt(ec) === 0) {
            await pool.query(`
                INSERT INTO estados_visita (nombre, color_hex) VALUES
                ('OK',          '#4CAF50'),
                ('Novedad',     '#FF9800'),
                ('Inoperativa', '#F44336')
            `);
            console.log('✓ Estados de visita creados por defecto');
        }

        // ── Sede por defecto ───────────────────────────────────────────────────
        // Sin al menos una sede no se pueden crear unidades
        const { rows: [{ count: sc }] } = await pool.query('SELECT COUNT(*) FROM sedes');
        if (parseInt(sc) === 0) {
            await pool.query(`INSERT INTO sedes (nombre) VALUES ('Sede Principal')`);
            console.log('✓ Sede principal creada por defecto');
        }
    } catch (err) {
        console.error('⚠ Error en seedDefaults:', err.message);
    }
}

module.exports = seedDefaults;
