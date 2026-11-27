const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

const generarCodigo = () =>
    Math.floor(100000 + Math.random() * 900000).toString();

const enviarCodigoVerificacion = async (email, codigo, tipo) => {
    const asunto = tipo === 'registro'
        ? 'Código de verificación — InovInfo'
        : 'Recuperación de contraseña — InovInfo';

    const mensaje = tipo === 'registro'
        ? `Tu código para crear tu cuenta de InovInfo es: <b>${codigo}</b>`
        : `Tu código para recuperar tu contraseña de InovInfo es: <b>${codigo}</b>`;

    // Si no hay SMTP configurado, imprime en consola (útil para desarrollo)
    if (!process.env.SMTP_USER) {
        console.log(`[EMAIL SIMULADO] Para ${email} — Código: ${codigo}`);
        return;
    }

    await transporter.sendMail({
        from:    process.env.SMTP_FROM,
        to:      email,
        subject: asunto,
        html: `
            <div style="font-family:sans-serif;max-width:400px;margin:auto;padding:24px;border:1px solid #e0e0e0;border-radius:8px">
                <h2 style="color:#1A3A5C">Electroinova Soluciones</h2>
                <p>${mensaje}</p>
                <div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#1A3A5C;text-align:center;padding:16px">
                    ${codigo}
                </div>
                <p style="color:#757575;font-size:12px">Este código expira en 10 minutos. Si no solicitaste esto, ignora este mensaje.</p>
            </div>
        `
    });
};

module.exports = { generarCodigo, enviarCodigoVerificacion };
