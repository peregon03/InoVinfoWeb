# Integración en el servidor — InovInfo Web

## Arquitectura

```
~/InovInfo/backend/          ← repo existente (se modifican 2 archivos, se agregan 2)
~/InovInfoWeb/               ← repo nuevo (se clona)
  web/                       ← frontend React
  backend/src/               ← archivos listos para copiar al backend
```

El Express sirve los estáticos de `~/InovInfoWeb/web/dist` con fallback SPA.

---

## Paso a paso

### 1. Backup

```bash
mkdir -p ~/backups
pg_dump -U inovinfo inovinfodb > ~/backups/inovinfodb_$(date +%Y%m%d_%H%M%S).sql
cd ~/InovInfo && git add -A && git commit -m "backup pre-web" && git tag pre-web
```

### 2. Clonar el repo web

```bash
cd ~
git clone https://github.com/peregon03/InoVinfoWeb.git InovInfoWeb
```

### 3. Aplicar migración SQL

```bash
psql -U inovinfo -d inovinfodb -f ~/InovInfoWeb/backend/migrations/001_web_migration.sql
```

Esto crea: tabla `bases`, tabla `app_config`, estados nuevos, columnas nuevas en `visitas` y `visita_fotos`. Todo idempotente.

### 4. Copiar archivos al backend

```bash
# Archivos NUEVOS (no existen en el backend):
cp ~/InovInfoWeb/backend/src/routes/bases.js        ~/InovInfo/backend/src/routes/
cp ~/InovInfoWeb/backend/src/routes/google-drive.js  ~/InovInfo/backend/src/routes/

# Archivos MODIFICADOS (reemplazan los existentes):
cp ~/InovInfoWeb/backend/src/app.js                  ~/InovInfo/backend/src/
cp ~/InovInfoWeb/backend/src/routes/visitas.js       ~/InovInfo/backend/src/routes/
```

### 5. Variables de entorno

Agregar al `~/InovInfo/backend/.env`:

```
GOOGLE_OAUTH_REDIRECT_URI=https://api.electroinova.com/api/google/oauth/callback
GOOGLE_DRIVE_ACCOUNT_EMAIL=electroinova.soluciones@gmail.com
WEB_APP_URL=https://app.electroinova.com
```

### 6. Build del frontend

```bash
cd ~/InovInfoWeb/web
npm ci
npm run build
```

Esto genera `~/InovInfoWeb/web/dist/` que el Express sirve como estáticos.

### 7. Reiniciar backend

```bash
cd ~/InovInfo/backend
npm install   # por si hay deps nuevas
pm2 restart inovinfo
```

### 8. Verificar

```bash
# Health check
curl https://api.electroinova.com/health
# Debe devolver: { "status": "ok", "app": "InovInfo API", "version": "1.1.0" }

# Probar que la web carga
curl -s https://api.electroinova.com/ | head -5
# Debe devolver HTML del index.html

# Probar que el login de Android sigue funcionando
curl -X POST https://api.electroinova.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test"}'
```

---

## Resumen de cambios al backend

| Archivo | Acción | Qué cambia |
|---------|--------|------------|
| `src/app.js` | **Reemplazar** | Agrega rutas `/api/catalogos/bases` y `/api/google`, sirve estáticos de `~/InovInfoWeb/web/dist` |
| `src/routes/visitas.js` | **Reemplazar** | POST acepta campos nuevos, GET devuelve campos nuevos + fotos_detalle, fotos aceptan tipo |
| `src/routes/bases.js` | **Nuevo** | CRUD de bases operativas |
| `src/routes/google-drive.js` | **Nuevo** | OAuth: iniciar, callback, estado, probar, desconectar |

No se toca: `auth.js`, `catalogos.js`, `usuarios.js`, `informes.js`, `importar.js`, `config/google.js`, `config/db.js`, `middleware/auth.js`.

---

## Deploy futuro (después de la primera vez)

```bash
# Frontend
cd ~/InovInfoWeb && git pull && cd web && npm ci && npm run build

# Backend (si hay cambios)
cd ~/InovInfo && git pull && cd backend && npm install && pm2 restart inovinfo
```
