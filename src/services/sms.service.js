/**
 * sms.service.js
 * ---------------------------------------------------------------------------
 * ADAPTER PATTERN: SMS provider client ne abhi finalize nahi kiya hai.
 *
 * Isliye poore codebase me kahin bhi "SMS_PROVIDER_X.send(...)" seedha call
 * nahi hoga. Har jagah se sirf ye service call hoga. Jis din provider
 * (MSG91, Twilio, jo bhi) finalize ho, SIRF YE FILE badlegi — auth service,
 * controllers, kahin kuch chhedna nahi padega.
 *
 * Abhi DEV MODE me ye sirf console pe OTP print karta hai, taaki aap bina
 * real SMS provider ke bhi poora flow test kar sakein.
 *
 * Email OTP ke liye Nodemailer (Gmail SMTP) use ho raha hai —
 * config/mailer.js me transporter lazy-init hota hai.
 * ---------------------------------------------------------------------------
 */

const { getTransporter } = require('../config/mailer');

async function sendOtpSms(phone, otp) {
  if (process.env.NODE_ENV === 'development' || !process.env.SMS_API_KEY) {
    // Real SMS provider nahi laga hai abhi — console me dikhao taaki testing ho sake
    console.log(`\n📱 [DEV MODE] OTP for ${phone}: ${otp}\n`);
    return { success: true, mode: 'console' };
  }

  // TODO: Jab client SMS provider (MSG91 / Twilio / etc) finalize kare,
  // yahan uska actual API call aayega. Baaki poora codebase isse touch
  // nahi hoga kyunki sab isi function ko call kar rahe hain.
  throw new Error('SMS provider is not configured yet — set SMS_API_KEY in .env');
}

async function sendOtpEmail(email, otp) {
  // EMAIL_USER/PASS set hai to real email bhejo (dev me bhi) — sirf
  // configure na hone par console fallback taaki bina creds ke bhi
  // baaki flow test ho sake.
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log(`\n📧 [DEV MODE] OTP for ${email}: ${otp}\n`);
    return { success: true, mode: 'console' };
  }

  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"Heavy Bazar" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Your Heavy Bazar OTP',
    html: `<p>Your OTP is <b>${otp}</b>. It expires in 5 minutes. Do not share it with anyone.</p>`,
  });

  return { success: true, mode: 'smtp' };
}

module.exports = { sendOtpSms, sendOtpEmail };
