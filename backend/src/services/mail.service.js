const nodemailer = require('nodemailer');
const env = require('../config/env');

let transporter = null;

function isConfigured() {
  return Boolean(env.smtp.host);
}

function getTransporter() {
  if (!isConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
  }
  return transporter;
}

/**
 * Sends an email. When SMTP is not configured the message is logged in development
 * (so password-reset codes can still be tested) and silently skipped in production.
 */
async function sendMail({ to, subject, text, html }) {
  const t = getTransporter();
  if (!t) {
    if (!env.isProd && !env.isTest) {
      console.log(`\n[mail:dev] SMTP not configured - email to ${to}\nSubject: ${subject}\n${text}\n`);
    }
    return { delivered: false };
  }
  await t.sendMail({ from: env.smtp.from, to, subject, text, html });
  return { delivered: true };
}

module.exports = { sendMail, isConfigured };
