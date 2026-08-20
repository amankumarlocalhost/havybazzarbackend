/**
 * auctionMath.js
 * ---------------------------------------------------------------------------
 * Auction engine ki SAARI calculation logic yahan hai, aur jaan-boojh kar
 * "pure" functions ke roop me — koi database call nahi, koi side-effect
 * nahi. Sirf input lo, output do.
 *
 * Kyun? Kyunki auto-bid resolution jaisi logic sabse zyada bug-prone
 * hissa hai poore auction engine ka. Pure functions ko bina MongoDB ke
 * bhi 100% test kiya ja sakta hai — jo maine isi file ke test suite me
 * kiya hai. `auction.service.js` sirf inhe call karega aur result ko
 * database me save karega.
 *
 * DESIGN — "plain bid" aur "auto-bid" ek hi model se resolve hote hain:
 *
 * Pehla version step-by-step increment karta tha (jaisa currentHighest
 * + increment, phir doosre ka turn, phir teesre ka) — ismein bug tha:
 * agar do bidders ke max ka farak bada ho (jaise ₹5 lakh), to system
 * har baar sirf ek increment (jaise ₹1000) badhata, jisse resolution
 * ke sainkdon steps lagte — matlab sainkdon Bid documents ban jaate
 * ek hi resolution ke liye. Production me ye bahut bura hota.
 *
 * Fix: `resolveAuctionState()` ek hi call me PORA final answer deta hai —
 * classic eBay-style proxy bidding: winner wahi hai jiska max sabse
 * zyada hai, aur wo sirf DOOSRE SABSE ZYADA max se ek increment upar
 * dega, apne poore max tak nahi jaayega. Isse resolution hamesha EK
 * step me hota hai, chahe max ka farak kitna bhi bada ho.
 * ---------------------------------------------------------------------------
 */

/**
 * EMD amount nikalta hai — base amount ka bps (basis points) hissa.
 * 100 bps = 1%, isliye 200 bps = 2%.
 */
function calculateEmdAmountPaise(baseAmountPaise, bps) {
  return Math.round((baseAmountPaise * bps) / 10000);
}

/**
 * Ek naya bid submit karne se PEHLE ka quick check — taaki user ko
 * turant pata chale uska bid kaafi hai ya nahi (UI validation).
 *
 * Ye asli auction price decide NAHI karta — asli price hamesha
 * `resolveAuctionState()` se aata hai. Ye sirf ek entry gate hai.
 */
function validateBidAmount({ bidAmountPaise, currentHighestPaise, minIncrementPaise, startingBidPaise }) {
  const minRequired = currentHighestPaise != null ? currentHighestPaise + minIncrementPaise : startingBidPaise;

  return {
    valid: bidAmountPaise >= minRequired,
    minRequiredPaise: minRequired,
  };
}

/**
 * AUCTION KA POORA STATE — auto-bid (proxy bidding) resolution.
 *
 * Is function ko har baar chalao jab bhi:
 *   - Koi naya plain bid aaye (uska amount hi uska "max" hai us waqt)
 *   - Koi naya auto-bid register/update ho (uska max jo bhi set kiya)
 *
 * `activeMaxBids` me har bidder ki SIRF EK, LATEST entry honi chahiye
 * (agar unhone plain bid aur auto-bid dono kiye hain, to auto-bid wala
 * max use karo — kyunki wo unki asli max intent hai).
 *
 * Array ORDER matters: pehle wale index ka matlab "pehle bid kiya" —
 * isse TIE-BREAK hota hai (same max ho to jo pehle aaya wahi leader).
 *
 * @param {Number} startingBidPaise
 * @param {Number} minIncrementPaise
 * @param {Array<{bidderId: String, maxAmountPaise: Number}>} activeMaxBids
 * @returns {{leaderId: String|null, currentPricePaise: Number|null}}
 */
function resolveAuctionState({ startingBidPaise, minIncrementPaise, activeMaxBids }) {
  if (activeMaxBids.length === 0) {
    return { leaderId: null, currentPricePaise: null };
  }

  if (activeMaxBids.length === 1) {
    // Sirf ek hi interested party hai — price starting bid pe rahega,
    // jab tak koi doosra bidder na aaye
    return { leaderId: activeMaxBids[0].bidderId, currentPricePaise: startingBidPaise };
  }

  // Max ke hisaab se sort karo, descending. Stable sort (JS ka default
  // Array.sort V8 me stable hai) — isliye equal max wale apne original
  // (pehle-aaya) order me rahenge, tie-break sahi hoga.
  const sorted = [...activeMaxBids].sort((a, b) => b.maxAmountPaise - a.maxAmountPaise);

  const top1 = sorted[0];
  const top2 = sorted[1];

  // Winner sirf doosre-sabse-zyada max se ek increment upar dega —
  // apna poora max kabhi reveal nahi karega jab tak zaroorat na ho
  let price = Math.min(top1.maxAmountPaise, top2.maxAmountPaise + minIncrementPaise);
  price = Math.max(price, startingBidPaise);

  return { leaderId: top1.bidderId, currentPricePaise: price };
}

/**
 * ANTI-SNIPING: kya ye bid auction ke "extend window" ke andar aayi hai?
 */
function isWithinExtensionWindow(endTime, now, windowMinutes) {
  const msRemaining = new Date(endTime).getTime() - new Date(now).getTime();
  return msRemaining > 0 && msRemaining <= windowMinutes * 60 * 1000;
}

function computeExtendedEndTime(currentEndTime, extendByMinutes) {
  return new Date(new Date(currentEndTime).getTime() + extendByMinutes * 60 * 1000);
}

/**
 * Kya ye auction aur extend ho sakta hai — dono conditions check:
 *   1. Max extensions ki limit paar nahi hui
 *   2. Naya end time, start time se max total days se zyada door nahi jaata
 */
function canExtend({ extensionCount, maxExtensions, startTime, proposedNewEndTime, maxTotalDays }) {
  if (extensionCount >= maxExtensions) return false;

  const totalMs = new Date(proposedNewEndTime).getTime() - new Date(startTime).getTime();
  const maxMs = maxTotalDays * 24 * 60 * 60 * 1000;

  return totalMs <= maxMs;
}

module.exports = {
  calculateEmdAmountPaise,
  validateBidAmount,
  resolveAuctionState,
  isWithinExtensionWindow,
  computeExtendedEndTime,
  canExtend,
};
