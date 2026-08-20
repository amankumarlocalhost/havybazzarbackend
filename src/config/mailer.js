const nodemailer = require("nodemailer");

/**
 * LAZY INITIALIZATION — Razorpay config (config/razorpay.js) jaisa pattern.
 * Transporter sirf pehli baar zaroorat padne pe banega, taaki EMAIL_USER/
 * EMAIL_PASS missing hone pe poora server crash na ho — sirf email bhejne
 * waale features fail honge.
 */
let transporter = null;

function getTransporter() {
  if (!transporter) {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      throw new Error(
        "EMAIL_USER/EMAIL_PASS .env me set nahi hain — email bhejna kaam nahi karega"
      );
    }
    // Gmail SMTP + App Password (2FA-enabled Gmail account ke liye).
    // Google UI app password ko spaces ke saath dikhata hai (e.g. "abcd efgh
    // ijkl mnop") — agar wahi copy-paste ho jaaye to SMTP auth fail hota hai
    // (535 error), isliye yahan whitespace strip kar rahe hain.
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS.replace(/\s+/g, ""),
      },
      // Render ke containers me outbound IPv6 route nahi hai, par Node
      // smtp.gmail.com ko resolve karte waqt IPv6 address prefer karta hai —
      // isse "ENETUNREACH" hota hai. `family: 4` force IPv4 connection.
      family: 4,
    });
  }
  return transporter;
}

module.exports = { getTransporter };
