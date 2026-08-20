const { Resend } = require("resend");

/**
 * LAZY INITIALIZATION — Razorpay config (config/razorpay.js) jaisa pattern.
 * Client sirf pehli baar zaroorat padne pe banega, taaki RESEND_API_KEY
 * missing hone pe poora server crash na ho — sirf email bhejne waale
 * features fail honge.
 *
 * Nodemailer (Gmail SMTP) se yahan shift kiya gaya — Render ke containers
 * me outbound IPv6 route nahi hai, aur nodemailer ka internal DNS resolver
 * IPv4/IPv6 addresses ke beech RANDOMLY choose karta hai, isliye SMTP
 * connections randomly hang/fail ho rahe the. Resend ek plain HTTPS API
 * call hai — koi raw socket/DNS dual-stack issue hi nahi hai.
 */
let resendClient = null;

function getResendClient() {
  if (!resendClient) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error(
        "RESEND_API_KEY .env me set nahi hai — email bhejna kaam nahi karega"
      );
    }
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

module.exports = { getResendClient };
