# Integración de cambios al backend InovInfo

## Orden de ejecución

### 1. Backup previo (en el servidor)
```bash
pg_dump inovinfodb > ~/backups/inovinfodb_$(date +%Y%m%d_%H%M%S).sql
cd ~/InovInfo && git add -A && git commit -m "backup pre-web" && git tag pre-web
```

### 2. Aplicar migración SQL
```bash
psql -U inovinfo -d inovinfodb -f backend/migrations/001_web_migration.sql
```

### 3. Instalar dependencias nuevas
```bash
cd ~/InovInfo/backend
npm install googleapis
```
(jsonwebtoken y express ya están instalados)

### 4. Copiar archivos nuevos al backend
Copiar estos archivos al directorio `~/InovInfo/backend/`:
- `routes/bases.js` → rutas del catálogo de bases
- `routes/google-drive.js` → rutas de OAuth y estado de Drive
- `lib/drive-upload.js` → helper de subida a Drive

### 5. Modificar el archivo principal del servidor

En el archivo principal (probablemente `app.js` o `server.js` o `index.js`):

#### 5a. Registrar rutas nuevas
```javascript
// Añadir junto a las demás rutas
app.use('/api/catalogos/bases', require('./routes/bases'));
app.use('/api/google', require('./routes/google-drive'));
```

#### 5b. Servir la app web estática (después de las rutas API)
```javascript
const path = require('path');

// Servir archivos estáticos de la web
const webDistPath = path.join(__dirname, '..', 'web', 'dist');
app.use(express.static(webDistPath));

// Fallback SPA: toda ruta que no sea /api ni /health devuelve index.html
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path === '/health') {
    return next();
  }
  res.sendFile(path.join(webDistPath, 'index.html'));
});
```

### 6. Modificar la ruta de visitas

En el archivo de rutas de visitas (probablemente `routes/visitas.js`):

#### 6a. POST /api/visitas — aceptar campos nuevos
En la función que crea visitas, añadir los campos nuevos al INSERT:

```javascript
// Antes (existente):
// INSERT INTO visitas (unidad_id, tecnico_id, estado_id, novedad_texto, ...) VALUES (...)

// Ahora: agregar estos campos opcionales
const {
  unidad_id, estado_id, novedad_texto, observacion_estructurada,
  requiere_seguimiento, fecha_seguimiento, nota_seguimiento,
  suministros,
  // CAMPOS NUEVOS:
  sede_id, base_id, atraso_hora_min, dias_grabacion, h264_plus,
  checklist, es_extraordinaria, es_otra_sede
} = req.body;

// El INSERT debe incluir los nuevos campos:
const result = await pool.query(
  `INSERT INTO visitas (
    unidad_id, tecnico_id, estado_id, novedad_texto, observacion_estructurada,
    requiere_seguimiento, fecha_seguimiento, nota_seguimiento,
    sede_id, base_id, atraso_hora_min, dias_grabacion, h264_plus,
    checklist, es_extraordinaria, es_otra_sede
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
  [
    unidad_id, req.usuario.id, estado_id, novedad_texto || null, observacion_estructurada || null,
    requiere_seguimiento || false, fecha_seguimiento || null, nota_seguimiento || null,
    sede_id || null, base_id || null, atraso_hora_min || null, dias_grabacion || null,
    h264_plus || null, checklist ? JSON.stringify(checklist) : null,
    es_extraordinaria || false, es_otra_sede || false
  ]
);
```

#### 6b. GET /api/visitas — devolver campos nuevos
Modificar la consulta SELECT para incluir:

```sql
SELECT v.*,
  ev.nombre as estado, ev.color_hex,
  u.numero as unidad_numero,
  COALESCE(s_visita.nombre, s_unidad.nombre) as sede_nombre,
  b.nombre as base_nombre,
  t.nombre as tecnico_nombre
FROM visitas v
JOIN estados_visita ev ON v.estado_id = ev.id
JOIN unidades u ON v.unidad_id = u.id
LEFT JOIN sedes s_visita ON v.sede_id = s_visita.id
LEFT JOIN sedes s_unidad ON u.sede_id = s_unidad.id
LEFT JOIN bases b ON v.base_id = b.id
JOIN usuarios t ON v.tecnico_id = t.id
ORDER BY v.created_at DESC
```

Y las fotos deben devolver `fotos_detalle`:
```sql
SELECT id, url, tipo, drive_file_id FROM visita_fotos WHERE visita_id = $1 ORDER BY orden
```

#### 6c. POST /api/visitas/:id/fotos — aceptar tipo y drive_file_id
```javascript
// Aceptar campo 'tipo' del formulario
const tipo = req.body.tipo || 'despues'; // 'antes' | 'despues'

// Si hay upload a Drive:
const driveUpload = require('../lib/drive-upload');
let driveFileId = null;
let fotoUrl = '';

try {
  const result = await driveUpload.uploadPhoto(req.file.buffer, {
    visitaId: req.params.id,
    tipo,
    index: Date.now(),
    sedeNombre: 'sede', // obtener de la visita
    unidadNumero: 'num', // obtener de la visita
  });
  fotoUrl = result.url;
  driveFileId = result.fileId;
} catch (err) {
  if (err.status === 503) {
    return res.status(503).json({ error: err.message });
  }
  // Fallback: guardar localmente o devolver error
  return res.status(500).json({ error: 'Error al subir foto: ' + err.message });
}

// INSERT incluyendo tipo y drive_file_id
await pool.query(
  'INSERT INTO visita_fotos (visita_id, url, tipo, drive_file_id, orden) VALUES ($1, $2, $3, $4, $5) RETURNING id, url',
  [req.params.id, fotoUrl, tipo, driveFileId, 0]
);
```

### 7. Variables de entorno nuevas
Agregar al `.env`:
```
GOOGLE_OAUTH_REDIRECT_URI=https://api.electroinova.com/api/google/oauth/callback
GOOGLE_DRIVE_ACCOUNT_EMAIL=electroinova.soluciones@gmail.com
WEB_APP_URL=https://app.electroinova.com
```

### 8. Build y deploy
```bash
cd ~/InovInfo
bash deploy.sh
```

### 9. Verificar
```bash
curl https://api.electroinova.com/health
# Probar login desde la web
```
