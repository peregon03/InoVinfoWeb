const https = require('https');
const key = process.env.GEMINI_API_KEY || require('dotenv').config({ path: require('path').join(__dirname, 'backend/.env') }).parsed?.GEMINI_API_KEY || '';
console.log('Key:', key.slice(0, 10) + '...');
const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-preview-05-20', 'gemini-1.5-flash'];
let i = 0;
function test() {
  if (i >= models.length) { console.log('Done'); return; }
  const m = models[i++];
  const body = JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'di hola' }] }] });
  const url = new URL('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent?key=' + key);
  const req = https.request({ hostname: url.hostname, path: url.pathname + url.search, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => { console.log(m, '→', res.statusCode, d.slice(0, 300)); test(); });
  });
  req.on('error', e => { console.log(m, '→ ERROR:', e.message); test(); });
  req.write(body);
  req.end();
}
test();
