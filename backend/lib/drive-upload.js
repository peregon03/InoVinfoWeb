const { google } = require('googleapis');
const { Readable } = require('stream');
const pool = require('../db');

const {
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  GOOGLE_OAUTH_REDIRECT_URI,
  GOOGLE_OAUTH_REFRESH_TOKEN,
  GOOGLE_DRIVE_FOLDER_ID,
} = process.env;

// Cache folder IDs to avoid repeated lookups
const folderCache = new Map();

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

/**
 * Get an authenticated Drive client.
 * Priority: app_config token > .env token. No service account fallback.
 */
async function getDriveClient() {
  const refreshToken = await getConfig('google_refresh_token') || GOOGLE_OAUTH_REFRESH_TOKEN;

  if (!refreshToken) {
    throw Object.assign(new Error('Google Drive no está conectado. Pida a la coordinadora conectarlo en Admin.'), { status: 503 });
  }

  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET,
    GOOGLE_OAUTH_REDIRECT_URI
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  // Handle token refresh errors
  oauth2Client.on('tokens', () => {});

  return google.drive({ version: 'v3', auth: oauth2Client });
}

/**
 * Get or create a folder by name inside a parent.
 */
async function getOrCreateFolder(drive, name, parentId) {
  const cacheKey = `${parentId}/${name}`;
  if (folderCache.has(cacheKey)) return folderCache.get(cacheKey);

  // Search for existing folder
  const query = `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const list = await drive.files.list({ q: query, fields: 'files(id)', spaces: 'drive' });

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

/**
 * Upload a photo to Google Drive.
 * Structure: root / year / sede / YYYY-MM-DD / filename
 * Returns { fileId, webViewLink }
 */
async function uploadPhoto(buffer, { visitaId, tipo, index, sedeNombre, unidadNumero }) {
  let drive;
  try {
    drive = await getDriveClient();
  } catch (err) {
    if (err.status === 503) throw err;
    // Check if invalid_grant
    if (err.message?.includes('invalid_grant')) {
      await setConfig('google_drive_error', 'Token revocado. Reconecte Google Drive.');
      await pool.query("DELETE FROM app_config WHERE clave = 'google_refresh_token'");
      throw Object.assign(new Error('Google Drive no está conectado. Pida a la coordinadora conectarlo en Admin.'), { status: 503 });
    }
    throw err;
  }

  // Get root folder
  const rootId = await getConfig('google_drive_root_id') || GOOGLE_DRIVE_FOLDER_ID;
  if (!rootId) {
    throw Object.assign(new Error('Carpeta raíz de Drive no configurada'), { status: 503 });
  }

  // Build folder path
  const now = new Date();
  const year = now.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric' });
  const dateStr = now.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' })
    .split('/').reverse().join('-'); // YYYY-MM-DD
  const sede = (sedeNombre || 'Sin_sede').replace(/[/\\:*?"<>|]/g, '_');

  const yearFolder = await getOrCreateFolder(drive, year, rootId);
  const sedeFolder = await getOrCreateFolder(drive, sede, yearFolder);
  const dateFolder = await getOrCreateFolder(drive, dateStr, sedeFolder);

  // Upload file
  const timestamp = Date.now();
  const fileName = `visita_${visitaId}_${tipo}_${index}_${timestamp}.jpg`;

  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);

  const file = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [dateFolder],
    },
    media: {
      mimeType: 'image/jpeg',
      body: stream,
    },
    fields: 'id, webViewLink',
  });

  // Make public
  try {
    await drive.permissions.create({
      fileId: file.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });
  } catch (permErr) {
    console.error('Error setting permission (non-fatal):', permErr.message);
  }

  return {
    fileId: file.data.id,
    url: `https://drive.google.com/uc?id=${file.data.id}`,
    webViewLink: file.data.webViewLink,
  };
}

module.exports = { uploadPhoto, getDriveClient };
