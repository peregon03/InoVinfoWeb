const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const pool    = require('../config/db');
const { generarCodigo, enviarCodigoVerificacion } = require('../config/email');
const { verificarToken, soloCoordinadora } = require('../middleware/auth');

// ── GET /api/auth/check-primer-usuario ───────────────────────────────────────
// La app llama esto al abrir para saber si mostrar Registro o Login
router.get('/check-primer-usuario', async (req, res) => {
    try {
        const result = await pool.query('SELECT COUNT(*) FROM usuarios');
        res.json({ primerUsuario: parseInt(result.rows[0].count) === 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/auth/solicitar-registro ────────────────────────────────────────
// Primer usuario: envía código de verificación al email
router.post('/solicitar-registro', async (req, res) => {
    const { nombre, email, password } = req.body;

    if (!nombre || !email || !password) {
        return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    try {
        // Verificar si el email ya existe
        const existe = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email.toLowerCase()]);
        if (existe.rows.length > 0) {
            return res.status(409).json({ error: 'El email ya está registrado' });
        }

        // Eliminar códigos anteriores para este email
        await pool.query(
            "DELETE FROM codigos_verificacion WHERE email = $1 AND tipo = 'registro'",
            [email.toLowerCase()]
        );

        // Guardar datos temporalmente en el código
        const codigo    = generarCodigo();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos
        const passHash  = await bcrypt.hash(password, 12);

        await pool.query(
            `INSERT INTO codigos_verificacion (email, codigo, tipo, expires_at, datos_temp)
             VALUES ($1, $2, 'registro', $3, $4)`,
            [email.toLowerCase(), codigo, expiresAt, JSON.stringify({ nombre, passHash })]
        );

        await enviarCodigoVerificacion(email, codigo, 'registro');

        res.json({ mensaje: `Código enviado a ${email}` });

    } catch (err) {
        console.error('Error en solicitar-registro:', err.message);
        res.status(500).json({ error: 'Error al enviar el código. Verifica el email.' });
    }
});

// ── POST /api/auth/verificar-registro ────────────────────────────────────────
router.post('/verificar-registro', async (req, res) => {
    const { email, codigo } = req.body;

    if (!email || !codigo) {
        return res.status(400).json({ error: 'Email y código son requeridos' });
    }

    try {
        const result = await pool.query(
            `SELECT * FROM codigos_verificacion
             WHERE email = $1 AND codigo = $2 AND tipo = 'registro'
               AND usado = FALSE AND expires_at > NOW()`,
            [email.toLowerCase(), codigo]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Código inválido o expirado' });
        }

        const { nombre, passHash } = JSON.parse(result.rows[0].datos_temp);

        // Crear usuario coordinadora
        const usuarioResult = await pool.query(
            `INSERT INTO usuarios (nombre, email, password_hash, rol)
             VALUES ($1, $2, $3, 'coordinadora') RETURNING id, nombre, email, rol`,
            [nombre, email.toLowerCase(), passHash]
        );

        // Marcar código como usado
        await pool.query(
            'UPDATE codigos_verificacion SET usado = TRUE WHERE id = $1',
            [result.rows[0].id]
        );

        const usuario = usuarioResult.rows[0];
        const token   = jwt.sign(
            { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, permisos: [] },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
        );

        res.status(201).json({ token, usuario: { ...usuario, permisos: [] } });

    } catch (err) {
        console.error('Error en verificar-registro:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }

    try {
        const result = await pool.query(
            'SELECT * FROM usuarios WHERE email = $1 AND activo = TRUE',
            [email.toLowerCase().trim()]
        );

        const usuario = result.rows[0];
        if (!usuario) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const passwordValido = await bcrypt.compare(password, usuario.password_hash);
        if (!passwordValido) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const permisosResult = await pool.query(
            'SELECT permiso FROM permisos_usuario WHERE usuario_id = $1',
            [usuario.id]
        );
        const permisos = permisosResult.rows.map(r => r.permiso);

        const token = jwt.sign(
            { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, permisos },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
        );

        res.json({
            token,
            usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, permisos }
        });

    } catch (err) {
        console.error('[LOGIN ERROR]', err.message, err.code);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ── POST /api/auth/solicitar-recuperacion ────────────────────────────────────
router.post('/solicitar-recuperacion', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requerido' });

    try {
        const result = await pool.query(
            'SELECT id FROM usuarios WHERE email = $1 AND activo = TRUE',
            [email.toLowerCase()]
        );

        // Siempre responder igual para no revelar si el email existe
        if (result.rows.length === 0) {
            return res.json({ mensaje: `Si el email existe, recibirás un código` });
        }

        await pool.query(
            "DELETE FROM codigos_verificacion WHERE email = $1 AND tipo = 'recuperacion'",
            [email.toLowerCase()]
        );

        const codigo    = generarCodigo();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await pool.query(
            `INSERT INTO codigos_verificacion (email, codigo, tipo, expires_at)
             VALUES ($1, $2, 'recuperacion', $3)`,
            [email.toLowerCase(), codigo, expiresAt]
        );

        await enviarCodigoVerificacion(email, codigo, 'recuperacion');
        res.json({ mensaje: `Si el email existe, recibirás un código` });

    } catch (err) {
        res.status(500).json({ error: 'Error al procesar la solicitud' });
    }
});

// ── POST /api/auth/verificar-recuperacion ────────────────────────────────────
router.post('/verificar-recuperacion', async (req, res) => {
    const { email, codigo, nuevaPassword } = req.body;

    if (!email || !codigo || !nuevaPassword) {
        return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }
    if (nuevaPassword.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    try {
        const result = await pool.query(
            `SELECT * FROM codigos_verificacion
             WHERE email = $1 AND codigo = $2 AND tipo = 'recuperacion'
               AND usado = FALSE AND expires_at > NOW()`,
            [email.toLowerCase(), codigo]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Código inválido o expirado' });
        }

        const hash = await bcrypt.hash(nuevaPassword, 12);
        await pool.query(
            'UPDATE usuarios SET password_hash = $1 WHERE email = $2',
            [hash, email.toLowerCase()]
        );
        await pool.query(
            'UPDATE codigos_verificacion SET usado = TRUE WHERE id = $1',
            [result.rows[0].id]
        );

        res.json({ mensaje: 'Contraseña actualizada correctamente' });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', verificarToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, nombre, email, rol FROM usuarios WHERE id = $1',
            [req.usuario.id]
        );
        const permisosResult = await pool.query(
            'SELECT permiso FROM permisos_usuario WHERE usuario_id = $1',
            [req.usuario.id]
        );
        res.json({ ...result.rows[0], permisos: permisosResult.rows.map(r => r.permiso) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/auth/crear-tecnico (solo coordinadora) ─────────────────────────
router.post('/crear-tecnico', verificarToken, soloCoordinadora, async (req, res) => {
    const { nombre, email, password } = req.body;
    if (!nombre || !email || !password) {
        return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }
    try {
        const existe = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email.toLowerCase()]);
        if (existe.rows.length > 0) {
            return res.status(409).json({ error: 'El email ya está registrado' });
        }
        const hash   = await bcrypt.hash(password, 12);
        const result = await pool.query(
            `INSERT INTO usuarios (nombre, email, password_hash, rol)
             VALUES ($1, $2, $3, 'tecnico') RETURNING id, nombre, email, rol`,
            [nombre.trim(), email.toLowerCase(), hash]
        );
        res.status(201).json({ usuario: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
