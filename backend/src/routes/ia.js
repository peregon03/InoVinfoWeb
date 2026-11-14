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
    // Solo pedimos a Gemini la CONTINUACIÓN después del texto base.
    // El texto base se concatena en el backend para evitar que Gemini lo trunque.
    return `Eres el redactor técnico de Electroinova SAS. Redactas la continuación de informes de mantenimiento de DVR Móvil para Veolia.

El informe SIEMPRE comienza con este texto (NO lo incluyas en tu respuesta, ya está agregado):
"${TEXTO_BASE}"

Tu tarea: redacta SOLO la continuación que va DESPUÉS de ese texto base. Responde ÚNICAMENTE con la frase de continuación.

REGLAS:
1. Tercera persona, tiempo pasado, tono formal técnico.
2. Máximo 1-2 oraciones. Un solo párrafo, sin viñetas ni saltos de línea.
3. Si el estado es "OK" y no hay novedad, responde exactamente: SOLO_BASE
4. Si hay novedad, inicia con ", durante la inspección" seguido de lo encontrado.
5. Si se usaron suministros, menciónalos como "se realizó cambio de [suministro]".
6. No inventes datos. No repitas el número de unidad. No uses comillas.
7. No agregues recomendaciones, solo lo que se hizo y encontró.

GLOSARIO (reemplaza jerga por término formal):
- "cámara dañada" → "falla en la cámara"
- "no graba" → "el equipo no realiza grabación"
- "se ve borroso" → "deficiencia en la calidad de imagen"
- "cables sueltos" → "conexiones sueltas"
- "no enciende" → "el equipo no presenta encendido"
- "pantalla rota" → "daño en la pantalla del monitor"
- "sin señal" → "ausencia de señal"
- "memoria llena" → "capacidad de almacenamiento agotada"
- "se reinicia solo" → "el equipo presenta reinicios intermitentes"

EJEMPLOS:
Entrada: "la camara trasera no sirve y el gps esta malo"
Respuesta: , durante la inspección se evidenció falla en la cámara trasera y falla en el módulo GPS

Entrada: "se cambio disco duro porque no grababa"
Respuesta: , durante la inspección se evidenció que el equipo no realizaba grabación, por lo cual se realizó cambio de disco duro

Entrada: "todo bien"
Respuesta: SOLO_BASE

DATOS DE ESTA VISITA:
- Estado: ${estado}
- Checklist: ${formatChecklist(checklist)}
- Suministros: ${suministros || 'Ninguno'}
- Descripción del técnico: "${descripcion}"

Responde SOLO la continuación (o SOLO_BASE si no hay novedad).`;
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
            generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
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

        const candidate = data?.candidates?.[0];
        const finishReason = candidate?.finishReason;
        const text = candidate?.content?.parts?.[0]?.text;
        console.log('Gemini finishReason:', finishReason, '| raw:', JSON.stringify(text));

        if (!text) {
            console.error('Gemini data:', JSON.stringify(data));
            return res.status(502).json({ error: 'Respuesta vacía del servicio de IA' });
        }

        const cleaned = text.replace(/^["']|["']$/g, '').trim();

        // Si Gemini dice SOLO_BASE o la respuesta está vacía, devolver solo el texto base
        let observacion;
        if (cleaned === 'SOLO_BASE' || !cleaned) {
            observacion = TEXTO_BASE;
        } else {
            // La continuación puede empezar con ", durante..." o con texto directo
            const continuacion = cleaned.startsWith(',') ? cleaned : ', ' + cleaned;
            observacion = TEXTO_BASE + continuacion;
        }

        console.log('Observacion final:', observacion);
        res.json({ observacion });

    } catch (err) {
        console.error('Error en POST /api/ia/redactar:', err.message);
        res.status(502).json({ error: err.message || 'Error interno al procesar la redacción' });
    }
});

module.exports = router;
