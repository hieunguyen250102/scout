/**
 * Vercel function: mails a login code through Gmail SMTP (Render's free plan
 * blocks SMTP ports). The handler lives in oink-kit; see its README.
 * Games can also point MAIL_RELAY_URL at the shared oink-mail relay instead.
 */

module.exports = require('oink-kit/relay').createSendCodeHandler({ brand: 'SCOUT' });
