require('dotenv').config({ path: require('path').join(__dirname, 'backend/.env') });
const { google } = require('googleapis');

const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const token = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

console.log('Client ID:', id ? id.slice(0, 20) + '...' : 'FALTA');
console.log('Client Secret:', secret ? secret.slice(0, 10) + '...' : 'FALTA');
console.log('Refresh Token:', token ? token.slice(0, 20) + '...' : 'FALTA');

const oauth2 = new google.auth.OAuth2(id, secret);
oauth2.setCredentials({ refresh_token: token });

async function test() {
  try {
    console.log('\n1. Obteniendo access token...');
    const { credentials } = await oauth2.refreshAccessToken();
    console.log('   OK - access token obtenido');

    console.log('2. Conectando a Drive...');
    const drive = google.drive({ version: 'v3', auth: oauth2 });

    console.log('3. Listando archivos...');
    const res = await drive.files.list({ pageSize: 3, fields: 'files(id,name)' });
    console.log('   OK -', res.data.files.length, 'archivos encontrados');
    res.data.files.forEach(f => console.log('   -', f.name));

    console.log('\n✅ Drive funciona correctamente');
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    if (err.response) {
      console.error('   Status:', err.response.status);
      console.error('   Data:', JSON.stringify(err.response.data, null, 2));
    }
  }
}
test();
