/**
 * email.service.js
 * ---------------------------------------------------------------------------
 * ADAPTER PATTERN — general notification emails (order confirm, KYC
 * status, waghera). OTP emails `sms.service.js` me hain (alag concern).
 *
 * Resend use ho raha hai — client config/resend.js me lazy-init hota hai.
 *
 * NOTE: domain verify hone tak Resend sirf apne "onboarding@resend.dev"
 * sandbox address se, aur sirf apne Resend-account-verified email pe hi
 * bhejne deta hai. Custom domain verify hote hi FROM_EMAIL asli domain
 * pe badal jaayega aur kisi ko bhi bhej sakenge.
 * ---------------------------------------------------------------------------
 */

const { getResendClient } = require("../config/resend");

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Heavy Bazar <onboarding@resend.dev>";

async function sendEmail(to, subject, body) {
  // RESEND_API_KEY set hai to real email bhejo (dev me bhi) — sirf
  // configure na hone par console fallback taaki bina creds ke bhi
  // baaki flow test ho sake.
  if (!process.env.RESEND_API_KEY) {
    console.log(`\nEmail [DEV MODE] to ${to} | subject: ${subject}\n${body}\n`);
    return { success: true, mode: "console" };
  }

  const resend = getResendClient();
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject,
    html: body,
  });

  if (error) {
    throw new Error(`Resend email bhejne me fail hua: ${error.message}`);
  }

  return { success: true, mode: "resend" };
}

module.exports = { sendEmail };
