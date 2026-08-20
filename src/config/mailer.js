const nodemailer = require("nodemailer");
const dns = require("dns").promises;

/**
 * LAZY INITIALIZATION — Razorpay config (config/razorpay.js) jaisa pattern.
 * Transporter sirf pehli baar zaroorat padne pe banega, taaki EMAIL_USER/
 * EMAIL_PASS missing hone pe poora server crash na ho — sirf email bhejne
 * waale features fail honge.
 */
let transporter = null;

async function getTransporter() {
  if (!transporter) {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      throw new Error(
        "EMAIL_USER/EMAIL_PASS .env me set nahi hain — email bhejna kaam nahi karega"
      );
    }

    /**
     * Render ke containers me outbound IPv6 route nahi hai. `family: 4`
     * option se fix karne ki koshish ki thi, par nodemailer ka internal DNS
     * resolver (lib/shared/index.js) smtp.gmail.com ke IPv4 aur IPv6 dono
     * addresses resolve karke un me se RANDOMLY ek choose karta hai — `family`
     * option us logic me kahin consult hi nahi hota, isliye wo fix kaam nahi
     * kiya (~50% requests abhi bhi IPv6 pe jaakar ENETUNREACH/ESOCKET se
     * hang/fail ho rahe the).
     *
     * Asli fix: khud IPv4 address resolve karke seedha `host` me literal IP
     * daal do. Jab host already IP hoti hai, nodemailer wahi random-pick
     * resolution step skip kar deta hai (net.isIP check) — koi randomness
     * nahi bachti. `tls.servername` alag se set kiya taaki TLS certificate
     * validation "smtp.gmail.com" ke against ho (IP ke against nahi).
     */
    const [ipv4] = await dns.resolve4("smtp.gmail.com");

    transporter = nodemailer.createTransport({
      host: ipv4,
      port: 465,
      secure: true,
      tls: { servername: "smtp.gmail.com" },
      auth: {
        user: process.env.EMAIL_USER,
        // Google UI app password ko spaces ke saath dikhata hai (e.g. "abcd efgh
        // ijkl mnop") — agar wahi copy-paste ho jaaye to SMTP auth fail hota hai
        // (535 error), isliye yahan whitespace strip kar rahe hain.
        pass: process.env.EMAIL_PASS.replace(/\s+/g, ""),
      },
    });
  }
  return transporter;
}

module.exports = { getTransporter };
