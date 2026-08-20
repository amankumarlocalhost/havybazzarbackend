/**
 * whatsapp.service.js
 * ---------------------------------------------------------------------------
 * ADAPTER PATTERN — bilkul `sms.service.js` jaisa. WhatsApp Business API
 * provider (Meta direct ya Gupshup/Interakt) client ne abhi finalize
 * nahi kiya. Dev mode me console pe print hota hai.
 *
 * NOTE: WhatsApp Business API me pehle se APPROVED "templates" chahiye
 * hote hain — free-form message nahi bhej sakte. Jab provider finalize
 * ho, sabse pehle templates submit karke approve karwane honge (isme
 * kuch din lag sakte hain) — isliye ye kaam jitni jaldi ho sake shuru
 * kar dena chahiye, code se independent.
 * ---------------------------------------------------------------------------
 */

async function sendWhatsAppMessage(phone, templateName, params) {
  if (process.env.NODE_ENV === 'development' || !process.env.WHATSAPP_API_KEY) {
    console.log(`\nWhatsApp [DEV MODE] to ${phone} | template: ${templateName} | params:`, params, '\n');
    return { success: true, mode: 'console' };
  }

  // TODO: Jab client WhatsApp Business API provider finalize kare,
  // yahan uska actual API call aayega
  throw new Error('WhatsApp provider is not configured yet.');
}

module.exports = { sendWhatsAppMessage };
