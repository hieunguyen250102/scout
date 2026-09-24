/**
 * Vercel function: mails a login code through Gmail SMTP.
 *
 * Render's free plan blocks SMTP ports, so the realtime server keeps all the
 * login logic (codes, attempts, cooldowns) and only hands the actual sending
 * to this function over HTTPS. It accepts nothing but an address and a
 * 6-digit code and builds the message itself, so even a leaked secret cannot
 * turn it into a general-purpose mail relay.
 */

const crypto = require('node:crypto');
const nodemailer = require('nodemailer');

let transport = null;

function getTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transport;
}

function authorized(header) {
  const secret = process.env.MAIL_RELAY_SECRET;
  if (!secret || typeof header !== 'string') return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!authorized(req.headers.authorization)) return res.status(401).json({ error: 'unauthorized' });
  if (!process.env.SMTP_HOST) return res.status(500).json({ error: 'SMTP is not configured' });

  const { to, code } = req.body ?? {};
  if (typeof to !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to) || to.length > 254) {
    return res.status(400).json({ error: 'bad address' });
  }
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'bad code' });

  const text = `Mã đăng nhập SCOUT của bạn: ${code}\n\nMã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu mã này, cứ bỏ qua email.`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;padding:24px;color:#1b1e24">
  <h2 style="margin:0 0 12px;font-size:18px">Mã đăng nhập SCOUT</h2>
  <p style="margin:0 0 16px;color:#555">Nhập mã này vào trang game để vào chơi:</p>
  <div style="font-size:34px;font-weight:800;letter-spacing:10px;padding:14px 0;text-align:center;background:#f4efe4;border-radius:12px">${code}</div>
  <p style="margin:16px 0 0;font-size:13px;color:#888">Mã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu mã này, cứ bỏ qua email.</p>
</div>`;

  try {
    await getTransport().sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to,
      subject: `${code} là mã đăng nhập SCOUT của bạn`,
      text,
      html,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[send-code] SMTP failed:', err);
    return res.status(502).json({ error: 'send failed' });
  }
};
