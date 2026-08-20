/**
 * email.service.js
 * ---------------------------------------------------------------------------
 * ADAPTER PATTERN — general notification emails (order confirm, KYC
 * status, waghera). OTP emails `sms.service.js` me hain (alag concern).
 *
 * Nodemailer (Gmail SMTP) use ho raha hai — transporter config/mailer.js
 * me lazy-init hota hai.
 * ---------------------------------------------------------------------------
 */

const { getTransporter } = require("../config/mailer");

async function sendEmail(to, subject, body) {
  // EMAIL_USER/PASS set hai to real email bhejo (dev me bhi) — sirf
  // configure na hone par console fallback taaki bina creds ke bhi
  // baaki flow test ho sake.
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log(`\nEmail [DEV MODE] to ${to} | subject: ${subject}\n${body}\n`);
    return { success: true, mode: "console" };
  }

  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"Heavy Bazar" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html: body,
  });

  return { success: true, mode: "smtp" };
}

module.exports = { sendEmail };
