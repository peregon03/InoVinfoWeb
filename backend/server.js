const path = require('path');
// Cargar .env SIEMPRE desde el directorio de este archivo (no depende de cwd/pm2)
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app          = require('./src/app');
const pool         = require('./src/config/db');
const seedDefaults = require('./src/config/seed');

const PORT = process.env.PORT || 3000;

// Verificar conexión a BD, sembrar datos por defecto y arrancar
pool.query('SELECT NOW()', async (err) => {
    if (err) {
        console.error('❌ No se pudo conectar a PostgreSQL:', err.message);
        process.exit(1);
    }
    console.log('✅ PostgreSQL conectado');
    await seedDefaults();
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 InovInfo API corriendo en puerto ${PORT}`);
        console.log(`   Entorno: ${process.env.NODE_ENV}`);
    });
});
