const jwt = require('jsonwebtoken');

// Verifica que el token JWT sea válido
const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

    if (!token) {
        return res.status(401).json({ error: 'Token requerido' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.usuario = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
};

// Solo coordinadora puede acceder
const soloCoordinadora = (req, res, next) => {
    if (req.usuario.rol !== 'coordinadora') {
        return res.status(403).json({ error: 'Acceso restringido a coordinadora' });
    }
    next();
};

// Coordinadora O técnico con permiso específico
const coordinadoraOPermiso = (permiso) => (req, res, next) => {
    if (req.usuario.rol === 'coordinadora') return next();
    if (req.usuario.permisos && req.usuario.permisos.includes(permiso)) return next();
    return res.status(403).json({ error: `Se requiere permiso: ${permiso}` });
};

module.exports = { verificarToken, soloCoordinadora, coordinadoraOPermiso };
