const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { verificarToken, verificarRol } = require('../middleware/auth');

const {
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  GOOGLE_OAUTH_REDIRECT_URI,
  GOOGLE_DRIVE_ACCOUNT_EMAIL,
  WEB_APP_URL,
  JWT_SECRET,
} = process.env;

function getOAuth2Client() {
  return new google.auth.OAuth2(
    GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET,
    GOOGLE_OAUTH_REDIRECT_URI
  );
}

// Helper: get config value from app_config
async function getConfig(clave) {
  const r = await pool.query('SELECT valor FROM app_config WHERE clave = $1', [clave]);
  return r.rows.length > 0 ? r.rows[0].valor : null;
}

// Helper: set config value
async function setConfig(clave, valor) {
  await pool.query(
    `INSERT INTO app_config (clave, valor, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (clave) DO UPDATE SET valor = $2, updated_at = NOW()`,
    [clave, valor]
  );
}

// Helper: delete config
async function deleteConfig(clave) {
  await pool.query('DELETE FROM app_config WHERE clave = $1', [clave]);
}

// GET /api/google/drive/estado - Estado de conexión [COORD]
router.get('/drive/estado', verificarToken, verificarRol('coordinadora'), async (req, res) => {
  try {
    const refreshToken = await getConfig('google_refresh_token');
    const email = await getConfig('google_drive_email');
    const rootId = await getConfig('google_drive_root_id');
    const error = await getConfig('google_drive_error');

    res.json({
      conectado: !!refreshToken,
      email: email || null,
      carpetaUrl: rootId ? `https://drive.google.com/drive/folders/${rootId}` : null,
      error: error || null,
    });
  } catch (err) {
    console.error('Error al obtener estado de Drive:', err);
    res.status(500).json({ error: 'Error al verificar estado' });
  }
});

// POST /api/google/oauth/iniciar - Iniciar flujo OAuth [COORD]
router.post('/oauth/iniciar', verificarToken, verificarRol('coordinadora'), async (req, res) => {
  try {
    const state = jwt.sign({ userId: req.usuario.id }, JWT_SECRET, { expiresIn: '10m' });

    const oauth2Client = getOAuth2Client();
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/drive.file',
        'openid',
        'email',
      ],
      state,
    });

    res.json({ url });
  } catch (err) {
    console.error('Error al iniciar OAuth:', err);
    res.status(500).json({ error: 'Error al generar URL de autenticación' });
  }
});

// GET /api/google/oauth/callback - Callback de OAuth (sin Bearer, valida state)
router.get('/oauth/callback', async (req, res) => {
  const webUrl = WEB_APP_URL || 'https://app.electroinova.com';
  const redirectError = (motivo) => res.redirect(`${webUrl}/admin/drive?drive=error&motivo=${encodeURIComponent(motivo)}`);

  try {
    const { code, state } = req.query;
    if (!code || !state) return redirectError('Parámetros faltantes');

    // Validate state JWT
    let payload;
    try {
      payload = jwt.verify(state, JWT_SECRET);
    } catch {
      return redirectError('Estado inválido o expirado');
    }

    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      return redirectError('No se obtuvo refresh token. Revoca el acceso en tu cuenta de Google e intenta de nuevo.');
    }

    // Verify email matches expected account
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const accountEmail = userInfo.data.email;

    if (GOOGLE_DRIVE_ACCOUNT_EMAIL && accountEmail !== GOOGLE_DRIVE_ACCOUNT_EMAIL) {
      return redirectError(`Cuenta incorrecta. Usa ${GOOGLE_DRIVE_ACCOUNT_EMAIL}`);
    }

    // Save tokens
    await setConfig('google_refresh_token', tokens.refresh_token);
    await setConfig('google_drive_email', accountEmail);
    await deleteConfig('google_drive_error');

    // Create root folder if needed
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    let rootId = await getConfig('google_drive_root_id');

    if (!rootId) {
      const folderMeta = {
        name: 'InovInfo Fotos',
        mimeType: 'application/vnd.google-apps.folder',
      };
      const folder = await drive.files.create({
        requestBody: folderMeta,
        fields: 'id',
      });
      rootId = folder.data.id;
      await setConfig('google_drive_root_id', rootId);
    }

    res.redirect(`${webUrl}/admin/drive?drive=ok`);
  } catch (err) {
    console.error('Error en OAuth callback:', err);
    redirectError('Error interno al procesar la autenticación');
  }
});

// POST /api/google/drive/desconectar - Desconectar [COORD]
router.post('/drive/desconectar', verificarToken, verificarRol('coordinadora'), async (req, res) => {
  try {
    await deleteConfig('google_refresh_token');
    await deleteConfig('google_drive_email');
    await deleteConfig('google_drive_error');
    // Keep root_id in case they reconnect
    res.json({ ok: true });
  } catch (err) {
    console.error('Error al desconectar Drive:', err);
    res.status(500).json({ error: 'Error al desconectar' });
  }
});

// POST /api/google/drive/probar - Probar conexión [COORD]
router.post('/drive/probar', verificarToken, verificarRol('coordinadora'), async (req, res) => {
  try {
    const refreshToken = await getConfig('google_refresh_token');
    if (!refreshToken) {
      return res.status(503).json({ error: 'Google Drive no está conectado' });
    }

    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Upload test file
    const testFile = await drive.files.create({
      requestBody: {
        name: 'inovinfo_test_' + Date.now() + '.txt',
        mimeType: 'text/plain',
      },
      media: {
        mimeType: 'text/plain',
        body: 'test',
      },
      fields: 'id',
    });

    // Delete test file
    await drive.files.delete({ fileId: testFile.data.id });

    res.json({ ok: true, mensaje: 'Prueba exitosa' });
  } catch (err) {
    console.error('Error al probar Drive:', err);
    if (err.message?.includes('invalid_grant')) {
      await setConfig('google_drive_error', 'Token revocado. Reconecte Google Drive.');
      await deleteConfig('google_refresh_token');
      return res.status(503).json({ error: 'Token revocado. Reconecte Google Drive.' });
    }
    res.status(500).json({ error: 'Error al probar: ' + err.message });
  }
});

module.exports = router;
