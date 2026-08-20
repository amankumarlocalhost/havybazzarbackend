/**
 * auditLog.service.js
 * ---------------------------------------------------------------------------
 * Ek chhota, reusable function jo har admin service call karega jab bhi
 * koi sensitive action ho (approve, reject, suspend, waghera).
 *
 * Isko alag service banaya taaki KYC, listings, users — sab modules isi
 * ek function ko call karein, alag-alag jagah audit log likhne ka code
 * duplicate na ho.
 * ---------------------------------------------------------------------------
 */

const AuditLog = require('../models/auditLog.model');

/**
 * @param {Object} params
 * @param {String} params.adminId
 * @param {String} params.adminName
 * @param {String} params.adminEmail
 * @param {String} params.action         - AUDIT_ACTION constant se
 * @param {String} params.targetType     - "User" | "Listing" | "KycVerification" etc
 * @param {String} params.targetId
 * @param {String} [params.targetLabel]  - human-readable naam, e.g. "Hitachi ZX19-6 CR"
 * @param {Object} [params.changesBefore]
 * @param {Object} [params.changesAfter]
 * @param {String} [params.reason]
 */
async function logAdminAction({
  adminId,
  adminName,
  adminEmail,
  action,
  targetType,
  targetId,
  targetLabel,
  changesBefore,
  changesAfter,
  reason,
}) {
  // Audit log likhna FAIL hone se main action (jaise KYC verify) rukna
  // NAHI chahiye — isliye try/catch se sirf console error, throw nahi karte.
  // (Trade-off: crash ke waqt audit trail me chhota gap aa sakta hai, par
  // admin action hi block ho jaana usse zyada bura hai.)
  try {
    await AuditLog.create({
      adminId,
      adminName,
      adminEmail,
      action,
      targetType,
      targetId,
      targetLabel,
      changesBefore,
      changesAfter,
      reason,
    });
  } catch (err) {
    console.error('AUDIT LOG FAILED (action still proceeded):', err.message);
  }
}

module.exports = { logAdminAction };
