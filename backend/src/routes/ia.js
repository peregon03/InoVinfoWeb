const router = require('express').Router();
const https  = require('https');
const { verificarToken } = require('../middleware/auth');

router.use(verificarToken);

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const TEXTO_BASE = 'Se ejecutó el servicio de revisión, diagnóstico técnico, ajuste, reparación, mantenimiento general y limpieza del sistema de cámaras';

function formatChecklist(checklist) {
    if (!checklist) return 'No aplica';
    const lines = [];
    const labels = {
        delantera: 'Cámara delantera', trasera: 'Cámara trasera', cabina: 'Cámara de cabina',
        lateral: 'Cámara lateral', directa: 'Cámara directa',
        monitor_vision_directa: 'Monitor de visión directa', visor_principal: 'Visor principal',
        telo: 'Telo (pantalla táctil)', wifi: 'WiFi/credenciales',
    };
    for (const [grupo, items] of Object.entries(checklist)) {
        for (const [key, val] of Object.entries(items)) {
            if (val !== 'bien') {
                lines.push(`${labels[key] || key}: ${val === 'falla' ? 'FALLA' : 'No tiene'}`);
            }
        }
    }
    return lines.length > 0 ? lines.join(', ') : 'Todo en buen estado';
}

function buildPrompt({ unidad_numero, estado, suministros, descripcion, checklist }) {
    return `Eres el redactor técnico de Electroinova SAS. Redactas informes de mantenimiento de DVR Móvil para el cliente Veolia.

TEXTO BASE OBLIGATORIO (siempre inicia con esto cuando el estado es OK o Con novedad):
"${TEXTO_BASE}"

REGLAS DE REDACCIÓN:
1. Escribe en tercera persona y tiempo pasado.
2. Tono formal y técnico, sin tutear ni saludar.
3. Máximo 2-3 oraciones después del texto base.
4. No uses viñetas, listas, títulos ni saltos de línea. Todo debe ser un párrafo continuo.
5. Si el estado es "OK" y no hay novedad, devuelve SOLO el texto base.
6. Si hay novedad, agrega "durante la inspección" seguido de lo que encontró el técnico, redactado profesionalmente.
7. Si se usaron suministros, menciónalos como "se realizó cambio de [suministro]".
8. No inventes información que no esté en los datos.
9. No repitas el número de unidad en el texto.
10. No agregues recomendaciones, solo describe lo que se hizo y encontró.
11. No uses comillas en la respuesta.
12. Devuelve SOLO el texto de la observación, sin explicaciones ni comentarios adicionales.

GLOSARIO (reemplaza jerga por término formal):
- "unidad de almacenamiento averiada" → "Falla en la unidad de almacenamiento"
- "cámara dañada" → "Falla en la cámara"
- "no graba" → "El equipo no realiza grabación"
- "se ve borroso" → "Se evidencia deficiencia en la calidad de imagen"
- "cables sueltos" → "Conexiones sueltas"
- "cables cruzados" → "Inversión de conexiones"
- "no enciende" → "El equipo no presenta encendido"
- "pantalla rota" → "Daño en la pantalla del monitor"
- "sin señal" → "Ausencia de señal"
- "memoria llena" → "Capacidad de almacenamiento agotada"
- "se reinicia solo" → "El equipo presenta reinicios intermitentes"
- "está lento" → "Se evidencia lentitud en el sistema"

EJEMPLOS:
Entrada: "la camara trasera no sirve y el gps esta malo"
Salida: "${TEXTO_BASE}, durante la inspección se evidenció falla en la cámara trasera y falla en el módulo GPS"

Entrada: "se cambio disco duro porque no grababa"
Salida: "${TEXTO_BASE}, durante la inspección se evidenció que el equipo no realizaba grabación, por lo cual se realizó cambio de disco duro"

Entrada: "todo bien"
Salida: "${TEXTO_BASE}"

DATOS DE ESTA VISITA:
- Unidad: ${unidad_numero}
- Estado reportado: ${estado}
- Checklist de equipos: ${formatChecklist(checklist)}
- Suministros utilizados: ${suministros || 'Ninguno'}
- Descripción del técnico: "${descripcion}"

Devuelve SOLO el texto de la observación.`;
}

// POST /api/ia/redactar
router.post('/redactar', async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY no configurada en el servidor' });
    }

    const { unidad_numero, estado, suministros, descripcion, checklist } = req.body;
    if (!descripcion || !descripcion.trim()) {
        return res.status(400).json({ error: 'La descripción del técnico es requerida' });
    }

    try {
        const prompt = buildPrompt({
            unidad_numero: unidad_numero || '',
            estado: estado || '',
            suministros: suministros || '',
            descripcion: descripcion.trim(),
            checklist: checklist || null,
        });

        const payload = JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 500 },
        });

        const data = await new Promise((resolve, reject) => {
            const url = new URL(`${GEMINI_URL}?key=${apiKey}`);
            const reqOpts = {
                hostname: url.hostname,
                path: url.pathname + url.search,
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
            };
            const httpReq = https.request(reqOpts, (httpRes) => {
                let body = '';
                httpRes.on('data', (chunk) => { body += chunk; });
                httpRes.on('end', () => {
                    if (httpRes.statusCode >= 400) {
                        console.error('Gemini API error:', httpRes.statusCode, body);
                        return reject(new Error('Error al contactar el servicio de IA'));
                    }
                    try { resolve(JSON.parse(body)); }
                    catch (e) { reject(new Error('Respuesta inválida del servicio de IA')); }
                });
            });
            httpReq.on('error', reject);
            httpReq.write(payload);
            httpReq.end();
        });

        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            return res.status(502).json({ error: 'Respuesta vacía del servicio de IA' });
        }

        // Clean up: remove quotes, extra whitespace
        const cleaned = text.replace(/^["']|["']$/g, '').trim();
        res.json({ observacion: cleaned });

    } catch (err) {
        console.error('Error en POST /api/ia/redactar:', err.message);
        res.status(502).json({ error: err.message || 'Error interno al procesar la redacción' });
    }
});

module.exports = router;
