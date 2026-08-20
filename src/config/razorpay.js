const Razorpay = require("razorpay");

/**
 * LAZY INITIALIZATION — jaan-boojh kar.
 *
 * Pehle ye module-load hote hi turant Razorpay instance banata tha.
 * Isse ek real bug nikla: agar `.env` me RAZORPAY_KEY_ID set na ho
 * (jaise fresh clone pe, ya kisi test environment me), to sirf
 * payment routes hi nahi — POORA SERVER crash ho jaata, kyunki
 * `require("./config/razorpay")` chain me kahin bhi ho, turant error
 * throw hoti thi.
 *
 * Fix: instance sirf tab banega jab PEHLI baar zaroorat padegi
 * (`getRazorpayInstance()` call hone pe) — jaisa `jobs/auctionQueue.js`
 * me Redis connection ke saath kiya tha.
 */
let razorpayInstance = null;

function getRazorpayInstance() {
  if (!razorpayInstance) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_SECRET) {
      throw new Error(
        "RAZORPAY_KEY_ID/RAZORPAY_SECRET .env me set nahi hain — payment features kaam nahi karenge"
      );
    }
    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_SECRET,
    });
  }
  return razorpayInstance;
}

module.exports = { getRazorpayInstance };
