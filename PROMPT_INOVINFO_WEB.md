# PROMPT PARA CLAUDE CODE — InovInfo Web (migración + nuevo flujo de visita)

Vas a construir y **poner en producción hoy mismo** la versión web de **InovInfo**, que hoy existe como app Android nativa + backend Node.js. La web reemplaza a la app Android para el trabajo diario de los técnicos, así que debe funcionar muy bien en el navegador del celular.

Este documento tiene todo el contexto. Léelo completo antes de escribir código.

---

## 0. REGLAS DE TRABAJO

1. **Primero inspecciona el código real** del backend (`~/InovInfo/backend/`) y la base de datos de producción. Este documento describe el sistema, pero si el código real difiere, manda el código real. Ejemplo conocido: `usuarios.created_at` existe en el schema pero NO en producción.
2. **El backend sí se modifica, pero solo de forma aditiva.** Nada de renombrar ni borrar columnas, rutas o campos de respuesta. Los campos nuevos son opcionales y con default, para que la app Android siga funcionando mientras se hace el cambio.
3. **Antes de tocar producción:** `pg_dump inovinfodb` a un archivo con fecha, y un commit/tag de git del estado actual del backend.
4. **Migraciones idempotentes** (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `INSERT ... ON CONFLICT DO NOTHING`) en un archivo SQL versionado dentro del repo.
5. **Nunca subas secretos al repo** (`.env`, tokens, API keys). Ninguna clave de terceros va en el frontend.
6. **Hay que salir hoy.** Trabaja en el orden de la sección 12 y despliega al terminar cada fase. Si algo de una fase posterior bloquea, déjalo documentado y sigue.
7. Si te falta un acceso o un dato (SSH, credenciales, un paso en Google Cloud Console), **pídemelo de inmediato con instrucciones exactas** en vez de quedarte bloqueado. La sección 13 lista lo que debo hacer yo.
8. Toda la interfaz va **en español**.

---

## 1. EL PROYECTO

**InovInfo** es la aplicación de **Electroinova Soluciones SAS** (Cali, Colombia) para registrar visitas técnicas a vehículos con DVR Móvil. El cliente es **Veolia**.

**Flujo general:**
1. Los técnicos visitan vehículos (unidades) en diferentes sedes y bases operativas.
2. Registran estado del DVR, checklist de cámaras y equipos, hallazgos, suministros usados y fotos de antes y después.
3. La coordinadora genera informes en formato Veolia exportados a Google Sheets.
4. La coordinadora gestiona catálogos (sedes, bases, unidades, suministros) y usuarios.

**Roles:**
- `coordinadora`: acceso completo (usuarios, catálogos, informes, importar Excel, conexión de Google Drive).
- `tecnico`: registra visitas, ve historial y pendientes.

**Permisos granulares** (se asignan a técnicos):
- `EDITAR_CATALOGOS`: editar suministros y tipos de novedad.
- `VER_TODAS_VISITAS`: ver visitas de otros técnicos.
- `EXPORTAR_SHEETS`: generar informes en Google Sheets.

---

## 2. SERVIDOR E INFRAESTRUCTURA

| Elemento | Valor |
|---|---|
| URL del backend (producción) | `https://api.electroinova.com/` |
| Servidor | Oracle Cloud, Ubuntu |
| Exposición a internet | Cloudflare Tunnel (`cloudflared`) hacia `localhost:3000` |
| Directorio del backend | `~/InovInfo/backend/` |
| Process manager | PM2, proceso `inovinfo` |
| Puerto | `3000` |
| Deploy del backend | `git pull && npm install && pm2 restart inovinfo` |
| Health check | `GET https://api.electroinova.com/health` → `{ status: "ok", app: "InovInfo API", version: "1.0.0" }` |
| CORS | `*` |

**Base de datos:** PostgreSQL en la misma máquina.
- Host `localhost`, puerto `5432`
- DB: `inovinfodb`
- Usuario: `inovinfo`
- Zona horaria: `America/Bogota`, configurada a nivel de conexión

### 2.1 Dónde vive la app web

- Código en el mismo repo, carpeta nueva `~/InovInfo/web/` (al lado de `backend/`).
- **Hosting:** el mismo backend Express sirve el build estático (`web/dist`) con fallback de SPA a `index.html` para toda ruta que no empiece por `/api` ni sea `/health`. Así no hay servidor nuevo que mantener y no hay problemas de CORS.
- **Dominio:** `https://app.electroinova.com`, agregando un *public hostname* al mismo túnel de Cloudflare apuntando a `http://localhost:3000`. El frontend llama a la API con rutas relativas (`/api/...`).
- Mientras el subdominio no esté creado, la app debe funcionar igual entrando por `https://api.electroinova.com/`.
- Deploy completo: `git pull && (cd web && npm ci && npm run build) && (cd backend && npm install) && pm2 restart inovinfo`. Déjalo en un script `deploy.sh`.

### 2.2 Variables de entorno del backend

```env
# Base de datos
DB_HOST=localhost
DB_PORT=5432
DB_NAME=inovinfodb
DB_USER=inovinfo
DB_PASSWORD=***

# JWT
JWT_SECRET=***
JWT_EXPIRES_IN=30d

# Servidor
PORT=3000
NODE_ENV=production

# Google Service Account (solo para Sheets)
GOOGLE_SERVICE_ACCOUNT_EMAIL=electroinova-inovinfo@gen-lang-client-0382314822.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=***
GOOGLE_SHEET_ID=1bD5Nall4_9ppzjc76CJs-XxmFbZ2WXdJitN7sHPgTgo

# Google Drive (OAuth2, para subir fotos)
GOOGLE_DRIVE_FOLDER_ID=***
GOOGLE_OAUTH_CLIENT_ID=485664645217-o4ubfbubdgle6m3cthmfmfgfcnflpi01.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=***
GOOGLE_OAUTH_REFRESH_TOKEN=***   # NUNCA SE GENERÓ. Ver sección 7.

# Email (SMTP)
SMTP_HOST=***  SMTP_PORT=***  SMTP_SECURE=true/false
SMTP_USER=***  SMTP_PASS=***  SMTP_FROM=***

# NUEVAS
GOOGLE_OAUTH_REDIRECT_URI=https://api.electroinova.com/api/google/oauth/callback
GOOGLE_DRIVE_ACCOUNT_EMAIL=electroinova.soluciones@gmail.com
WEB_APP_URL=https://app.electroinova.com
GEMINI_API_KEY=***               # solo si se implementa la sección 8
```

---

## 3. BASE DE DATOS

### 3.1 Schema actual (PostgreSQL)

```sql
CREATE TABLE sedes (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    activa BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);
-- Defaults: Tuluá, Buga, Sur Occidente, Cali, Río Paila

CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    rol VARCHAR(20) NOT NULL CHECK (rol IN ('coordinadora', 'tecnico')),
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()   -- NO existe en producción. No usarla.
);

CREATE TABLE permisos_usuario (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
    permiso VARCHAR(50) NOT NULL,
    UNIQUE(usuario_id, permiso)
);
-- Válidos: EDITAR_CATALOGOS, VER_TODAS_VISITAS, EXPORTAR_SHEETS

CREATE TABLE unidades (
    id SERIAL PRIMARY KEY,
    numero VARCHAR(20) NOT NULL UNIQUE,
    placa VARCHAR(20),
    sede_id INTEGER REFERENCES sedes(id),
    activa BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE estados_visita (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    color_hex VARCHAR(7) DEFAULT '#9E9E9E',
    activo BOOLEAN DEFAULT TRUE
);
-- Defaults: OK (#2E7D32), Con novedad (#F9A825), Inoperativa (#E24B4A),
--           Sin llaves (#757575), Bat. desconectada (#9E9E9E)

CREATE TABLE suministros (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(200) NOT NULL,
    categoria VARCHAR(100),
    precio_ref DECIMAL(10,2),
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE tipos_novedad (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    requiere_descripcion BOOLEAN DEFAULT TRUE,
    activo BOOLEAN DEFAULT TRUE
);

CREATE TABLE visitas (
    id SERIAL PRIMARY KEY,
    unidad_id INTEGER REFERENCES unidades(id),
    tecnico_id INTEGER REFERENCES usuarios(id),
    estado_id INTEGER REFERENCES estados_visita(id),
    novedad_texto TEXT,
    observacion_estructurada TEXT,
    requiere_seguimiento BOOLEAN DEFAULT FALSE,
    fecha_seguimiento DATE,
    nota_seguimiento TEXT,
    sincronizado BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE visita_suministros (
    id SERIAL PRIMARY KEY,
    visita_id INTEGER REFERENCES visitas(id) ON DELETE CASCADE,
    suministro_id INTEGER REFERENCES suministros(id),
    cantidad INTEGER DEFAULT 1
);

CREATE TABLE visita_fotos (
    id SERIAL PRIMARY KEY,
    visita_id INTEGER REFERENCES visitas(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    orden INTEGER DEFAULT 0
);

CREATE TABLE codigos_verificacion (
    id SERIAL PRIMARY KEY,
    email VARCHAR(150) NOT NULL,
    codigo VARCHAR(6) NOT NULL,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('registro', 'recuperacion')),
    datos_temp TEXT,
    usado BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_codigos_email_tipo ON codigos_verificacion(email, tipo);
```

### 3.2 Migración nueva (aditiva)

```sql
-- Bases operativas: el lugar físico donde se revisa la unidad (ej. Palmira).
-- Es distinto de la sede / unidad de negocio.
CREATE TABLE IF NOT EXISTS bases (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    activa BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);
INSERT INTO bases (nombre) VALUES ('Palmira') ON CONFLICT DO NOTHING;

-- Estados nuevos
INSERT INTO estados_visita (nombre, color_hex) VALUES
  ('No está en la base', '#5C6BC0'),
  ('Pendiente',          '#EF6C00')
ON CONFLICT (nombre) DO NOTHING;

-- Campos nuevos de la visita
ALTER TABLE visitas
  ADD COLUMN IF NOT EXISTS sede_id           INTEGER REFERENCES sedes(id),   -- unidad de negocio elegida en la visita
  ADD COLUMN IF NOT EXISTS base_id           INTEGER REFERENCES bases(id),
  ADD COLUMN IF NOT EXISTS atraso_hora_min   INTEGER,
  ADD COLUMN IF NOT EXISTS dias_grabacion    INTEGER,
  ADD COLUMN IF NOT EXISTS h264_plus         BOOLEAN,
  ADD COLUMN IF NOT EXISTS checklist         JSONB,                          -- solo cuando hay novedad
  ADD COLUMN IF NOT EXISTS es_extraordinaria BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS es_otra_sede      BOOLEAN DEFAULT FALSE;

-- Fotos de antes / después
ALTER TABLE visita_fotos
  ADD COLUMN IF NOT EXISTS tipo VARCHAR(10) DEFAULT 'despues',   -- 'antes' | 'despues'
  ADD COLUMN IF NOT EXISTS drive_file_id TEXT;

-- Configuración de la app (token de Google Drive, carpeta raíz, etc.)
CREATE TABLE IF NOT EXISTS app_config (
    clave VARCHAR(100) PRIMARY KEY,
    valor TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);
```

El **hallazgo** NO necesita columna nueva: se guarda en `visitas.novedad_texto`, que ya cumple ese papel.

Formato de `checklist` (claves fijas, valores `"bien" | "falla" | "no_tiene"`):

```json
{
  "camaras": { "delantera": "bien", "trasera": "falla", "cabina": "bien", "lateral": "no_tiene", "directa": "bien" },
  "equipos": { "monitor_vision_directa": "bien", "visor_principal": "bien", "telo": "bien", "gps": "falla", "wifi": "bien" }
}
```

`checklist = NULL` significa "todo bien" (visita OK).

---

## 4. API REST

**Base URL:** `https://api.electroinova.com` (desde la web, rutas relativas `/api/...`)
**Auth:** `Authorization: Bearer <JWT>`. El token expira en 30 días.
**Content-Type:** `application/json`, excepto uploads (`multipart/form-data`).
`[AUTH]` = requiere token. `[COORD]` = requiere rol coordinadora.

### 4.1 Auth (existente)

| Método y ruta | Auth | Body | Respuesta |
|---|---|---|---|
| `GET /api/auth/check-primer-usuario` | no | — | `{ primerUsuario: boolean }` |
| `POST /api/auth/solicitar-registro` | no (solo si no hay usuarios) | `{ nombre, email, password }` (mín. 6) | `{ mensaje }`. Envía código de 6 dígitos, expira en 10 min |
| `POST /api/auth/verificar-registro` | no | `{ email, codigo }` | `{ token, usuario: { id, nombre, email, rol, permisos: [] } }`. Crea `coordinadora` |
| `POST /api/auth/login` | no | `{ email, password }` | `{ token, usuario: { id, nombre, email, rol, permisos: string[] } }`. 401: `{ error: "Credenciales inválidas" }` |
| `POST /api/auth/solicitar-recuperacion` | no | `{ email }` | `{ mensaje }` siempre igual (no revela si el email existe) |
| `POST /api/auth/verificar-recuperacion` | no | `{ email, codigo, nuevaPassword }` (mín. 6) | `{ mensaje }` |
| `GET /api/auth/me` | AUTH | — | `{ id, nombre, email, rol, permisos }` |
| `POST /api/auth/crear-tecnico` | COORD | `{ nombre, email, password }` | `{ usuario: { id, nombre, email, rol } }` |

Payload del JWT: `{ id, nombre, email, rol, permisos: string[] }`. Hashing: bcryptjs, 12 rounds.

### 4.2 Usuarios (existente) — [COORD]

- `GET /api/usuarios` → array de `{ id, nombre, email, rol, activo, permisos }`
- `PUT /api/usuarios/:id/permisos` — `{ permisos: string[] }`
- `PUT /api/usuarios/:id/estado` — `{ activo: boolean }`
- `PUT /api/usuarios/:id/password` — `{ password }` (mín. 6)

### 4.3 Catálogos (existente) — [AUTH]; escritura requiere `EDITAR_CATALOGOS` o coordinadora

- **Sedes:** `GET /api/catalogos/sedes` → `{ id, nombre, activa, created_at }[]` · `POST` `{ nombre }` · `PUT /:id` `{ nombre, activa }`
- **Unidades:** `GET /api/catalogos/unidades` → `{ id, numero, placa, activa, sede_nombre, sede_id }[]` · `POST` `{ numero, sede_id }` · `PUT /:id` `{ numero, sede_id, activa }` · `DELETE /:id` (soft delete)
- **Suministros:** `GET /api/catalogos/suministros` → `{ id, nombre, categoria, precio_ref, activo, created_at }[]` · `POST` `{ nombre, categoria?, precio_ref? }` · `PUT /:id` `{ nombre, categoria, precio_ref, activo }`
- **Tipos de novedad:** `GET /api/catalogos/tipos-novedad` → `{ id, nombre, requiere_descripcion, activo }[]` · `POST` `{ nombre, requiere_descripcion? }` · `PUT /:id`
- **Estados:** `GET /api/catalogos/estados` → `{ id, nombre, color_hex, activo }[]`

### 4.4 Visitas (existente) — [AUTH]

- `GET /api/visitas` (`?unidad_id=X` opcional). Todos ven todas las visitas. Devuelve por visita: `id, created_at, requiere_seguimiento, fecha_seguimiento, nota_seguimiento, novedad_texto, observacion_estructurada, tecnico_nombre, unidad_id, unidad_numero, sede_nombre, estado, color_hex, suministros: [{nombre, cantidad}], fotos: [url]`
- `GET /api/visitas/hoy` (día actual en hora Colombia) → `{ id, unidad_id, unidad_numero, sede_nombre, sede_id, estado, color_hex, tecnico_nombre, observacion_estructurada, fotos_count }[]`
- `GET /api/visitas/pendientes` → `{ id, unidad_id, unidad_numero, sede_nombre, fecha_seguimiento, nota_seguimiento, tecnico_nombre, urgencia: "vencido"|"hoy"|"futuro" }[]`
- `GET /api/visitas/progreso?dias=N` (default 15) → `{ visitadas, total, dias }`. Unidades únicas visitadas en N días vs. total de unidades activas.
- `POST /api/visitas` — body actual: `{ unidad_id, estado_id, novedad_texto, observacion_estructurada, requiere_seguimiento, fecha_seguimiento, nota_seguimiento, suministros: [{ suministro_id, cantidad }] }`. `tecnico_id` sale del JWT. Visita y suministros se insertan en una transacción. Las fotos se suben después.
- `POST /api/visitas/:id/fotos` — multipart, campo `foto` (JPEG/PNG, máx. 5MB). Solo el técnico dueño o coordinadora. Respuesta `{ id, url }`.
- `DELETE /api/visitas/:id/fotos/:fotoId` — dueño o coordinadora. Borra de la BD, no de Drive.
- `DELETE /api/visitas/:id` — [COORD]. Cascada en transacción.
- **No existe endpoint para editar visitas.** No lo crees en esta entrega.

### 4.5 Informes (existente) — [AUTH + EXPORTAR_SHEETS]

- `POST /api/informes/generar` — `{ fechaDesde, fechaHasta, sedeId, sedeNombre, linkFotos }` → `{ sheetUrl, pestana, totalVisitas }`
- `GET /api/informes/sedes` → `{ id, nombre }[]`

### 4.6 Importar (existente) — [COORD]

- `POST /api/importar/excel` — multipart, campo `archivo` (.xlsx, máx. 10MB). Columnas `no_interno` (req.), `sede` (req.), `placa` (opc.). UPSERT de unidades, crea sedes que no existan. Respuesta: `{ sedesCreadas, unidadesCreadas, unidadesActualizadas, sinPlaca, advertencias: [], errores: [] }`

### 4.7 CAMBIOS AL BACKEND (nuevos, todos aditivos)

1. **`POST /api/visitas`** acepta además, todos opcionales: `sede_id`, `base_id`, `atraso_hora_min`, `dias_grabacion`, `h264_plus`, `checklist`, `es_extraordinaria`, `es_otra_sede`. Si no llegan, se comporta como hoy.
2. **`GET /api/visitas`** devuelve además esos campos, más `base_nombre` y `fotos_detalle: [{ id, url, tipo, drive_file_id }]`. El array `fotos` de URLs se mantiene igual para Android. `sede_nombre` debe salir de `visitas.sede_id` cuando exista, y si no, de la sede de la unidad (`COALESCE`).
3. **`POST /api/visitas/:id/fotos`** acepta el campo de formulario `tipo` (`antes` | `despues`, default `despues`) y guarda `drive_file_id`.
4. **Bases:** `GET /api/catalogos/bases` [AUTH], `POST` y `PUT /:id` [COORD], mismo patrón que sedes.
5. **Google Drive OAuth:** endpoints de la sección 7.
6. **Informe:** ajustes de la sección 6.
7. **Estático:** servir `web/dist` con fallback SPA (sección 2.1).
8. **Opcional:** `POST /api/ia/observacion` (sección 8).

---

## 5. NUEVO FLUJO DE VISITA (lo más importante de esta entrega)

Reemplaza la pantalla "Nueva Visita" de Android. Diseño de referencia: tema oscuro azul marino, tarjetas con bordes redondeados, título de sección en mayúsculas pequeñas, botones grandes para dedo.

### 5.1 Antes de la unidad: base de trabajo y buscador

- Al iniciar la jornada el técnico elige su **base de trabajo** (catálogo `bases`, ej. "Palmira"). Se recuerda en `localStorage` y se puede cambiar desde la pantalla principal.
- **Buscador de unidades** con autocompletado por número (y placa). Las unidades ya visitadas hoy (`/api/visitas/hoy`) se marcan con el color de su estado.
- Encima, el **progreso** (`/api/visitas/progreso?dias=15`): visitadas / total.

### 5.2 Pantalla de la unidad

**Encabezado fijo:** flecha de volver, número de unidad en grande (ej. `10004`) y debajo `{unidad de negocio} · base {base}` (ej. `Sur Occidente · base Palmira`).

Las secciones son tarjetas en este orden:

**1) ESTADO DE LA UNIDAD**
- Seis botones en cuadrícula de 2 columnas: **OK**, **Con novedad**, **Inoperativa**, **Sin llaves**, **No está en la base**, **Pendiente**. El seleccionado se pinta con su `color_hex`.
- Los estados se leen de `/api/catalogos/estados` y se muestran estos seis en ese orden. `Bat. desconectada` sigue en la BD por el historial, pero no se ofrece en la web.
- Debajo, selector **Unidad de negocio**: lista de sedes activas, preseleccionada la sede de la unidad. Se envía como `sede_id`.

**2) FOTO DEL ANTES**
- Texto: "Monitor encendido antes de intervenir. Cada foto queda marcada con el número de la unidad."
- Dos botones: **Tomar** (`<input type="file" accept="image/*" capture="environment">`) y **Cargar** (galería, selección múltiple).
- Miniaturas con opción de quitar. Se suben con `tipo=antes`.

**3) GRABACIÓN**
- **Atraso de la hora (min)**: numérico entero.
- **Días de grabación**: numérico entero.
- Casilla **Grabación en H264+ activada**.

**4) CÁMARAS Y EQUIPOS** — *solo visible si el estado es "Con novedad"*
- Si la unidad está **OK, todo está bien por definición**: la sección no se muestra y `checklist` se envía `null`.
- Cada ítem tiene tres botones excluyentes: **Bien** / **Falla** / **No tiene**. Al abrir la sección todos arrancan en **Bien**; el técnico solo toca lo que falla.
- Primer ítem: **Cámaras**, un submenú desplegable (acordeón) que contiene:
  - Delantera
  - Trasera
  - Cabina
  - Lateral
  - Directa
- Con el acordeón cerrado, la fila "Cámaras" muestra un resumen (ej. "5 bien" o "1 falla · 1 no tiene") y se resalta si hay alguna falla.
- Después, como filas normales:
  - Monitor visión directa
  - Visor principal
  - Telo (pantalla táctil)
  - GPS
  - WiFi / credenciales
- Ayuda al técnico: precarga los "No tiene" desde el checklist de la última visita de esa unidad, si existe (`GET /api/visitas?unidad_id=X`).

**5) HALLAZGO** — *solo si "Con novedad"*
- Texto: `Qué se encontró. Se agrega después de "durante la inspección…"`
- Textarea con placeholder: `Ej: la pantalla presenta rayas de colores por daño en la board`
- Se guarda en `novedad_texto`.
- Si se deja vacío y hay ítems en Falla, se propone un texto automático: `se evidenció falla en {lista de ítems}`.
- Para guardar "Con novedad" se exige hallazgo o al menos un ítem en Falla.

**6) SUMINISTROS Y CAMBIOS**
- Botón **+ Agregar suministro**: selector con búsqueda sobre suministros activos + cantidad con stepper. Lista editable de lo agregado.

**7) FOTO DEL DESPUÉS**
- Igual que la del antes: **Tomar** / **Cargar**. Se suben con `tipo=despues`.

**8) MÁS OPCIONES**
- Casilla **Hubo visita extraordinaria (a solicitud del área de mantenimiento)** → `es_extraordinaria`.
- Casilla **Es de otra sede: agregar "(Unidad revisada en base operativa {base})"** → `es_otra_sede`. El texto de la casilla usa la base actual.
- **Requiere seguimiento**: interruptor + fecha + nota (ya existía; alimenta la pantalla Pendientes).

**Botón Guardar**, fijo al fondo.

### 5.3 Qué secciones aparecen según el estado

| Sección | OK | Con novedad | Inoperativa / Sin llaves / No está en la base | Pendiente |
|---|---|---|---|---|
| Estado + unidad de negocio | sí | sí | sí | sí |
| Foto del antes | sí | sí | sí (opcional, como evidencia) | no |
| Grabación | sí | sí | no | no |
| Cámaras y equipos | **no** | **sí** | no | no |
| Hallazgo | no | sí | no | no |
| Suministros y cambios | sí | sí | no | no |
| Foto del después | sí | sí | no | no |
| Más opciones | sí | sí | sí | sí |

- **Pendiente** activa `requiere_seguimiento` automáticamente y pide fecha y nota.
- Al cambiar de estado no se pierde lo ya escrito en secciones que se ocultan, pero al guardar solo se envían los campos de las secciones visibles.

### 5.4 Texto de observación (lo arma el cliente y lo envía en `observacion_estructurada`)

Texto estándar:
> Se ejecutó el servicio de revisión, diagnóstico técnico, ajuste, reparación, mantenimiento general y limpieza del sistema de cámaras

| Estado | Texto base |
|---|---|
| OK | texto estándar |
| Con novedad | `{texto estándar}, durante la inspección {hallazgo en minúscula inicial y sin punto final}` |
| Inoperativa | Al momento de la visita esta unidad se encuentra inoperativa |
| Sin llaves | Al momento de la inspección no se encontraron llaves |
| No está en la base | Al momento de la visita la unidad no se encontraba en la base |
| Bat. desconectada (histórico) | Al momento de la visita la batería de la unidad se encontraba desconectada |
| Pendiente | (no genera observación; no entra al informe) |

Sufijos, en este orden:
- `es_extraordinaria` → `. Visita extraordinaria a solicitud del área de mantenimiento`
- `es_otra_sede` → ` (Unidad revisada en base operativa {base})`

Muestra la observación final en una vista previa editable antes de guardar. Pon esta lógica en una sola función pura con pruebas unitarias.

### 5.5 Fotos en el cliente

- Procesar con Canvas antes de subir: lado mayor máx. 1920 px, JPEG, bajar calidad hasta quedar ≤ 4 MB. Respetar la orientación EXIF.
- **Marca de agua** en cada foto: número de unidad en grande + fecha y hora de Colombia, en una franja con buen contraste en una esquina.
- Máximo 8 fotos por visita en total (antes + después).

### 5.6 Guardado

1. `POST /api/visitas` con todo.
2. Subir las fotos una por una a `POST /api/visitas/:id/fotos` con su `tipo`, mostrando progreso por foto.
3. Si una foto falla, **la visita ya quedó guardada**: mostrar cuáles fallaron y un botón **Reintentar** sin recrear la visita.
4. Confirmación y regreso al buscador, con la unidad marcada como visitada.
5. Bloquear el doble envío del botón Guardar.

---

## 6. INFORME GOOGLE SHEETS (formato Veolia)

Genera una pestaña nueva en el Sheet `1bD5Nall4_9ppzjc76CJs-XxmFbZ2WXdJitN7sHPgTgo`, usando la service account.

**Nombre de la pestaña:** `{Sede} {día}{MesCorto}{año}`, ej. `Buga 18Oct2026`.

| Fila | Contenido |
|---|---|
| 1 | vacía |
| 2 | Título "VISITA TÉCNICA ELECTROINOVA A SEDE OPERATIVA" (merge A2:E2, fondo #B7D7C9, Arial 14, centrado) |
| 3 | Encabezados: Fecha / Unidad de negocio / Ref. Vehículo / Actividad / Observación (fondo verde, Arial 10 negrita, bordes) |
| 4+ | Datos de visitas |
| … | 5 filas vacías |
| … | Firma fija: Jhon Fernando Agudelo A. / Ingeniero Electrónico / Electroinova SAS / electroinova.soluciones@gmail.com |
| … | Nota 1: disclaimer de acompañamiento + link de fotos |
| … | Nota 2: disclaimer de unidades no disponibles |
| … | Nota 3: nota de buen uso de equipos |

- Anchos: A=100, B=120, C=100, D=240, E=420 px.
- Actividad: siempre `· Mtto preventivo y correctivo Dvr Movil`.
- Suministros: debajo de la observación como `Sum Nombre` (o `Sum Nombre x2`). Columnas A–D con merge vertical por bloque de unidad.
- Visitas de otra sede: resaltadas en naranja claro `#FFE8CC`.

**Ajustes necesarios en el generador:**
1. Si la visita trae `observacion_estructurada`, se usa tal cual **para cualquier estado** (hoy solo se usa en "Con novedad"). Si viene vacía, se mantiene la lógica actual por estado, agregando el texto de "No está en la base".
2. La columna "Unidad de negocio" y el filtro por sede usan `COALESCE(visitas.sede_id, unidades.sede_id)`.
3. El resaltado naranja aplica también cuando `es_otra_sede = true`.
4. Las visitas en estado **Pendiente** se excluyen del informe.

---

## 7. GOOGLE DRIVE — SOLUCIÓN A LA CARGA DE FOTOS

### 7.1 El problema actual

`GOOGLE_OAUTH_REFRESH_TOKEN` nunca se generó, así que el backend cae al fallback de la service account. Las service accounts **no tienen cuota de almacenamiento** en Drive, por eso las subidas fallan. Confirma este diagnóstico en los logs de PM2 antes de cambiar nada.

### 7.2 La solución: conectar UNA cuenta de Google, una sola vez

- Los técnicos **no** inician sesión con Google. Siguen entrando con email y contraseña.
- La coordinadora conecta una sola vez la cuenta `electroinova.soluciones@gmail.com` desde la web (**Admin → Google Drive → "Conectar Google Drive"**). El backend guarda el refresh token y sube todas las fotos a esa cuenta.
- Si el token se revoca o vence, la coordinadora lo reconecta desde el mismo botón, sin tocar el servidor.

### 7.3 Endpoints nuevos

- `GET /api/google/drive/estado` [COORD] → `{ conectado: boolean, email: string|null, carpetaUrl: string|null, error: string|null }`
- `POST /api/google/oauth/iniciar` [COORD] → `{ url }`. URL de consentimiento con `access_type=offline`, `prompt=consent`, scope `https://www.googleapis.com/auth/drive.file` + `openid email`, y un `state` firmado (JWT de 10 min con el id de la coordinadora).
- `GET /api/google/oauth/callback` (sin Bearer; se valida el `state`) → intercambia el `code`, verifica que el email de la cuenta sea `GOOGLE_DRIVE_ACCOUNT_EMAIL`, guarda en `app_config` (`google_refresh_token`, `google_drive_email`) y redirige a `{WEB_APP_URL}/admin?drive=ok` (o `?drive=error&motivo=...`).
- `POST /api/google/drive/desconectar` [COORD].
- `POST /api/google/drive/probar` [COORD] → sube y borra un archivo de prueba, para verificar de punta a punta.

### 7.4 Detalles de implementación

- Orden de credenciales al subir: token en `app_config` → `GOOGLE_OAUTH_REFRESH_TOKEN` del `.env`. **Elimina el fallback a service account para subir fotos**; en su lugar responde `503 { error: "Google Drive no está conectado. Pida a la coordinadora conectarlo en Admin." }`.
- Con el scope `drive.file` la app solo ve archivos creados por ella misma. Por eso, al conectar, **el backend crea su propia carpeta raíz** `InovInfo Fotos` en el Drive de la cuenta, y guarda su id en `app_config` (`google_drive_root_id`). Ese id tiene prioridad sobre `GOOGLE_DRIVE_FOLDER_ID`.
- Estructura de carpetas (se crea sola): `raíz / año / sede / YYYY-MM-DD / visita_{id}_{tipo}_{n}_{timestamp}.jpg`. La sede es la unidad de negocio de la visita.
- Las fotos se suben desde memoria (Buffer), sin tocar disco, y se hacen públicas con `anyone:reader`.
- Cachea los ids de carpetas en memoria para no buscarlas en cada subida.
- Si Google responde `invalid_grant`, marca Drive como desconectado en `app_config` y devuelve el 503 anterior.
- El refresh token nunca se devuelve por la API ni se escribe en logs.

### 7.5 Cómo mostrar las fotos en la web

`https://drive.google.com/uc?id=<id>` es poco fiable dentro de `<img>`. Se sigue guardando esa URL (compatibilidad con Android y el informe), pero la web debe:
- extraer el id del archivo (`drive_file_id` o desde la URL),
- usar `https://drive.google.com/thumbnail?id=<id>&sz=w400` para miniaturas y `&sz=w1600` para la vista ampliada,
- enlazar "Abrir en Drive" a `https://drive.google.com/file/d/<id>/view`.

En Admin, junto al estado de Drive, muestra el enlace a la carpeta raíz: sirve para copiar el link de fotos que pide el informe.

---

## 8. GEMINI AI (opcional, fase final)

La app Android llamaba a **Gemini 2.5 Flash** desde el cliente para redactar la observación. En la web **la API key no puede ir en el frontend**.

- La observación de la web se arma con la plantilla de la sección 5.4; no depende de la IA.
- Si alcanza el tiempo: botón **"Mejorar redacción con IA"** junto al hallazgo, que llama a `POST /api/ia/observacion` [AUTH] `{ hallazgo, checklist, unidad }` → `{ texto }`. El backend llama a `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent` con `GEMINI_API_KEY`.
- El prompt debe incluir: contexto (técnico de DVR Móvil de Electroinova, informe para Veolia), glosario de normalización de términos, ejemplos de observaciones bien redactadas, y formato (profesional, tercera persona, sin puntuación innecesaria). El resultado debe poder continuar la frase "durante la inspección…".
- Si la IA falla, se usa el texto del técnico tal cual.

---

## 9. RESTO DE PANTALLAS (replicar de Android)

**Navegación:** barra inferior en celular (lateral en escritorio): Nueva Visita, Historial, Pendientes, Perfil, y Admin si es coordinadora. Sin token → Login. Con token → Nueva Visita. Ante un 401, cerrar sesión y volver a Login.

- **Login:** email + contraseña con botón de mostrar/ocultar, enlace "Recuperar contraseña". Si `check-primer-usuario` es `true`, se muestra Registro.
- **Registro (solo primer usuario):** nombre, email, contraseña, confirmar → código al email.
- **Verificación:** código de 6 dígitos con temporizador de 10 min. Sirve para registro y recuperación.
- **Recuperar contraseña:** email → código + nueva contraseña.
- **Historial:** buscador de unidad → visitas por fecha descendente. Cada una: fecha, técnico, chip de estado, unidad de negocio y base, observación, datos de grabación, checklist (solo fallas y "no tiene"), suministros, fotos separadas en Antes / Después, etiquetas de "Extraordinaria" y "Otra sede". La coordinadora puede eliminar la visita, con confirmación.
- **Pendientes:** seguimientos ordenados por fecha ascendente, con unidad, sede, fecha, nota, técnico y urgencia en color (vencido / hoy / futuro). Tocar uno abre la unidad para registrar la visita.
- **Perfil:** nombre, email, rol, cerrar sesión.
- **Admin (coordinadora):**
  - Equipo técnico: listar, crear técnico, cambiar contraseña, activar/desactivar, permisos.
  - Catálogos: CRUD de sedes, **bases**, unidades, suministros y tipos de novedad. Quien tenga `EDITAR_CATALOGOS` ve suministros y tipos de novedad.
  - Informes: fecha desde/hasta + sede + link de fotos → genera y muestra el enlace al Sheet. Visible también con `EXPORTAR_SHEETS`.
  - Importar Excel: subir .xlsx y mostrar el resumen (creadas, actualizadas, advertencias, errores).
  - Google Drive: estado, conectar/reconectar, probar, enlace a la carpeta.

---

## 10. DISEÑO Y STACK

**Stack:** Vite + React + TypeScript, React Router, CSS con variables (o Tailwind). Pocas dependencias. PWA instalable (manifest + íconos + service worker que solo cachea el shell; **no** hay modo offline).

**Tema oscuro (por defecto), marca Electroinova:**

```
Fondo:              #0F1722
Superficie/tarjeta: #18222D   borde #2A3644, radio 14px
Encabezado:         #1A3A5C → #0D1F33
Primario (navy):    #1A3A5C
Acento (dorado):    #D4A843
Texto:              #F2F4F7   secundario #9AA7B5
Error:              #E24B4A

Estados:
  OK                 #2E7D32
  Con novedad        #F9A825
  Inoperativa        #E24B4A
  Sin llaves         #757575
  No está en la base #5C6BC0
  Pendiente          #EF6C00
  Bat. desconectada  #9E9E9E
```

- **Mobile-first**: se usa de pie junto al vehículo, con una mano. Botones de mínimo 48 px de alto, campos con `font-size` ≥ 16 px (evita el zoom de iOS), `inputmode="numeric"` en los numéricos.
- Fechas y horas siempre en `America/Bogota`, sin importar la zona del dispositivo.
- Estados de carga, vacío y error en todas las pantallas. Mensajes de error del backend (`{ error }`) visibles para el usuario.
- Token JWT y datos del usuario en `localStorage`.

---

## 11. REGLAS DE NEGOCIO A RESPETAR

- **Soft deletes:** unidades y suministros no se borran, se marcan inactivos. Los selectores solo muestran activos.
- **Visitas:** se crean y se eliminan (coordinadora). No se editan.
- **Transacción:** visita + suministros en una transacción; fotos después.
- **Importación Excel:** UPSERT por `no_interno`; crea sedes que no existan.
- **Sin modo offline** en la web.
- **Compatibilidad:** la app Android debe seguir funcionando contra el backend modificado.

---

## 12. PLAN DE ENTREGA PARA HOY (en este orden)

**Fase 0 — Preparación (corta)**
- Leer el backend real, respaldar BD y código, confirmar el diagnóstico de Drive en logs.

**Fase 1 — Backend**
- Migración 3.2. Cambios 4.7 (campos nuevos, bases, `tipo` de foto). Google Drive OAuth (sección 7). Servir estáticos. Desplegar y verificar `/health` y que el login de Android siga respondiendo.

**Fase 2 — Web mínima operable → DESPLEGAR**
- Login + sesión. Base de trabajo + buscador + progreso. Flujo de visita completo (sección 5) con fotos. Admin → Google Drive.
- Prueba real de punta a punta desde un celular: crear visita "Con novedad" con fotos de antes y después y verificar que aparecen en Drive.

**Fase 3 — Operación completa → DESPLEGAR**
- Historial, Pendientes, Perfil. Informes (con los ajustes de la sección 6). Admin: equipo técnico, catálogos, importar Excel.

**Fase 4 — Si alcanza el tiempo**
- Registro de primer usuario y recuperación de contraseña (si no entraron antes), PWA, IA (sección 8).

**Criterios de aceptación**
- [ ] Un técnico inicia sesión en el celular y registra una visita OK sin ver el checklist.
- [ ] En "Con novedad" aparece el checklist, con el acordeón de Cámaras (delantera, trasera, cabina, lateral, directa).
- [ ] Las fotos llegan a Drive en `año/sede/fecha`, con marca de agua del número de unidad, y se ven en Historial separadas en Antes / Después.
- [ ] La coordinadora conecta Drive desde Admin sin entrar al servidor.
- [ ] El informe de Sheets sale con el formato Veolia y los textos nuevos.
- [ ] La app Android sigue funcionando.
- [ ] No hay secretos en el repo ni claves en el frontend.

Al terminar, entrégame: URL final, resumen de cambios al backend, SQL aplicado, y pendientes.

---

## 13. LO QUE NECESITAS DE MÍ (pídemelo apenas lo requieras)

1. **Acceso** al servidor (SSH) o que yo ejecute los comandos de deploy y migración que me indiques.
2. **Google Cloud Console** (proyecto del client ID `485664645217-...`):
   - que el cliente OAuth sea de tipo **"Aplicación web"** (si es de escritorio, crear uno nuevo y actualizar `GOOGLE_OAUTH_CLIENT_ID` / `SECRET`);
   - agregar el URI de redirección autorizado `https://api.electroinova.com/api/google/oauth/callback`;
   - **publicar la pantalla de consentimiento en "En producción"**. En modo "Prueba" el refresh token caduca a los 7 días y las subidas volverían a fallar;
   - tener habilitada la Google Drive API.
3. **Cloudflare:** crear el hostname `app.electroinova.com` en el túnel, apuntando a `http://localhost:3000`.
4. **Iniciar sesión una vez** con `electroinova.soluciones@gmail.com` al pulsar "Conectar Google Drive".
5. `GEMINI_API_KEY`, solo si se hace la fase de IA.

---

## 14. SUPUESTOS (avanza con ellos; cámbialos solo si te digo lo contrario)

1. La web se publica en `app.electroinova.com`, servida por el mismo backend.
2. "Base" (ej. Palmira) es un catálogo nuevo, distinto de sede. Arranca solo con "Palmira".
3. `Bat. desconectada` no se ofrece en la web; `No está en la base` y `Pendiente` son estados nuevos.
4. `Pendiente` crea un seguimiento y no entra al informe.
5. Texto de "No está en la base": "Al momento de la visita la unidad no se encontraba en la base".
6. Texto de visita extraordinaria: ". Visita extraordinaria a solicitud del área de mantenimiento".
7. "Monitor visión directa" sigue como equipo aparte, además de la cámara "Directa".
8. Los datos de grabación y el checklist se guardan y se ven en Historial, pero no van al informe de Veolia.
9. La app Android sigue en uso durante la transición.
