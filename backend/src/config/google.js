/**
 * config/google.js
 * Cliente de Google Sheets, Drive y la función subirFotoDrive.
 * Este archivo reemplaza la versión del servidor que usaba toISOString()
 * (siempre UTC). Ahora usa toLocaleDateString con America/Bogota.
 */

const { google }   = require('googleapis');
const { Readable } = require('stream');
const pool         = require('./db');

const {
    GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET,
    GOOGLE_OAUTH_REDIRECT_URI,
    GOOGLE_OAUTH_REFRESH_TOKEN,
    GOOGLE_DRIVE_FOLDER_ID,
    GOOGLE_SHEETS_SPREADSHEET_ID,
} = process.env;

// Cache de IDs de carpetas para no repetir búsquedas en Drive
const folderCache = new Map();

// ── Helpers de app_config ──────────────────────────────────────────────────

async function getConfig(clave) {
    const r = await pool.query('SELECT valor FROM app_config WHERE clave = $1', [clave]);
    return r.rows.length > 0 ? r.rows[0].valor : null;
}

async function setConfig(clave, valor) {
    await pool.query(
        `INSERT INTO app_config (clave, valor, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (clave) DO UPDATE SET valor = $2, updated_at = NOW()`,
        [clave, valor]
    );
}

// ── Autenticación OAuth2 ───────────────────────────────────────────────────

async function getAuth() {
    const refreshToken = await getConfig('google_refresh_token') || GOOGLE_OAUTH_REFRESH_TOKEN;

    if (!refreshToken) {
        throw Object.assign(
            new Error('Google Drive no está conectado. Pida a la coordinadora conectarlo en Admin.'),
            { status: 503 }
        );
    }

    const oauth2Client = new google.auth.OAuth2(
        GOOGLE_OAUTH_CLIENT_ID,
        GOOGLE_OAUTH_CLIENT_SECRET,
        GOOGLE_OAUTH_REDIRECT_URI
    );
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    return oauth2Client;
}

async function getSheetsClient() {
    // Si existe una clave de service account válida, intentarla primero.
    // Válida = comienza con "-----BEGIN" (evita claves corruptas/truncadas).
    const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY;
    const tenemosClave  = privateKeyRaw && privateKeyRaw.trim().startsWith('-----BEGIN');

    if (tenemosClave && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
        try {
            const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
            const jwtAuth = new google.auth.JWT(
                process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                null,
                privateKey,
                ['https://www.googleapis.com/auth/spreadsheets']
            );
            await jwtAuth.authorize();
            return google.sheets({ version: 'v4', auth: jwtAuth });
        } catch (jwtErr) {
            console.warn('JWT service account falló para Sheets, usando OAuth2:', jwtErr.message);
        }
    }

    // Fallback OAuth2: usa el mismo refresh token de Drive.
    // Requiere que el token tenga scope spreadsheets (ver POST /api/google/oauth/iniciar).
    const auth = await getAuth();
    return google.sheets({ version: 'v4', auth });
}

async function getDriveClient() {
    const auth = await getAuth();

    // Limpiar token inválido ante invalid_grant
    auth.on('tokens', () => {});

    const drive = google.drive({ version: 'v3', auth });

    // Envolver para capturar invalid_grant en la primera llamada real
    return new Proxy(drive, {
        get(target, prop) {
            return target[prop];
        },
    });
}

// ── Helpers de carpetas en Drive ───────────────────────────────────────────

async function getOrCreateFolder(drive, name, parentId) {
    const cacheKey = `${parentId}/${name}`;
    if (folderCache.has(cacheKey)) return folderCache.get(cacheKey);

    // Escapar comillas simples en el nombre para la query de Drive API
    const nameSafe = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const q = `name='${nameSafe}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const list = await drive.files.list({ q, fields: 'files(id)', spaces: 'drive' });

    let folderId;
    if (list.data.files.length > 0) {
        folderId = list.data.files[0].id;
    } else {
        const folder = await drive.files.create({
            requestBody: {
                name,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentId],
            },
            fields: 'id',
        });
        folderId = folder.data.id;
    }

    folderCache.set(cacheKey, folderId);
    return folderId;
}

// ── subirFotoDrive ─────────────────────────────────────────────────────────
// Firma: subirFotoDrive(buffer, fileName, mimeType, sedeNombre)
// Estructura de carpetas: raíz / año / sede / YYYY-MM-DD / archivo
// Retorna la URL pública de Drive (formato uc?id=...).

async function subirFotoDrive(buffer, fileName, mimeType, sedeNombre) {
    let drive;
    try {
        drive = await getDriveClient();
    } catch (err) {
        if (err.status === 503) throw err;
        if (err.message?.includes('invalid_grant')) {
            await setConfig('google_drive_error', 'Token revocado. Reconecte Google Drive.');
            await pool.query("DELETE FROM app_config WHERE clave = 'google_refresh_token'");
            throw Object.assign(
                new Error('Google Drive no está conectado. Pida a la coordinadora conectarlo en Admin.'),
                { status: 503 }
            );
        }
        throw err;
    }

    const rootId = await getConfig('google_drive_root_id') || GOOGLE_DRIVE_FOLDER_ID;
    if (!rootId) {
        throw Object.assign(new Error('Carpeta raíz de Drive no configurada'), { status: 503 });
    }

    // FIX: usar toLocaleDateString con America/Bogota para evitar desfase UTC
    const ahora = new Date();
    const anio  = ahora.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric' });
    // sv-SE produce YYYY-MM-DD directamente
    const fecha = ahora.toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' });

    const sede = (sedeNombre || 'Sin_sede').replace(/[/\\:*?"<>|]/g, '_');

    const anioFolder = await getOrCreateFolder(drive, anio,  rootId);
    const sedeFolder = await getOrCreateFolder(drive, sede,  anioFolder);
    const diaFolder  = await getOrCreateFolder(drive, fecha, sedeFolder);

    // Subir archivo
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    let file;
    try {
        file = await drive.files.create({
            requestBody: { name: fileName, parents: [diaFolder] },
            media:       { mimeType: mimeType || 'image/jpeg', body: stream },
            fields:      'id, webViewLink',
        });
    } catch (err) {
        if (err.message?.includes('invalid_grant')) {
            await setConfig('google_drive_error', 'Token revocado. Reconecte Google Drive.');
            await pool.query("DELETE FROM app_config WHERE clave = 'google_refresh_token'");
            throw Object.assign(
                new Error('Google Drive no está conectado. Pida a la coordinadora conectarlo en Admin.'),
                { status: 503 }
            );
        }
        throw err;
    }

    // Hacer pública la foto (error no-fatal)
    try {
        await drive.permissions.create({
            fileId:      file.data.id,
            requestBody: { role: 'reader', type: 'anyone' },
        });
    } catch (permErr) {
        console.error('Error al asignar permiso (no fatal):', permErr.message);
    }

    return `https://drive.google.com/uc?id=${file.data.id}`;
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    getSheetsClient,
    getDriveClient,
    getAuth,
    subirFotoDrive,
};
