/**
 * upload.service.js
 * ---------------------------------------------------------------------------
 * Cloudinary pe file upload karne ka reusable helper.
 *
 * ZAROORI DESIGN DECISION — "authenticated" vs "public" delivery:
 *
 *   KYC documents (PAN, Aadhaar, address proof) — inko kabhi koi bhi
 *   direct URL se nahi khol sakta. Cloudinary ka `type: 'authenticated'`
 *   use karte hain. Iska URL bina signed token ke access hi nahi hota.
 *
 *   Listing photos (JCB, excavator ki tasveerein) — ye public honi
 *   chahiye, taaki website pe seedha `<img src>` me use ho sakein.
 *   Wo `type: 'upload'` (normal/default) se jaayengi — Phase 4 me.
 *
 * Isliye ye function `isPrivate` flag leta hai — caller decide karta hai.
 * ---------------------------------------------------------------------------
 */

const cloudinary = require('../config/cloudinary');
const AppError = require('../utils/AppError');

/**
 * Buffer (multer se aaya hua file data) ko Cloudinary pe upload karta hai.
 *
 * @param {Buffer} fileBuffer
 * @param {Object} options
 * @param {String} options.folder      - e.g. "kyc-documents/<userId>"
 * @param {Boolean} options.isPrivate  - true = KYC docs, false = public images
 * @param {String} [options.resourceType] - "image" | "video" | "raw" (PDF ke liye raw)
 */
function uploadBuffer(fileBuffer, { folder, isPrivate = false, resourceType = 'image' }) {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder,
      resource_type: resourceType,
      type: isPrivate ? 'authenticated' : 'upload',
    };

    const stream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
      if (error) {
        return reject(new AppError('File upload failed. Please try again.', 500));
      }
      resolve(result);
    });

    stream.end(fileBuffer);
  });
}

/**
 * KYC document ke liye ek signed, TIME-LIMITED URL banata hai — sirf
 * admin ko dikhane ke liye. Ye URL 10 minute me expire ho jaayega.
 *
 * Kyun zaroori hai: agar hum seedha Cloudinary ka public_id URL bana ke
 * de dein, to wo hamesha ke liye access hota — jo KYC docs ke liye
 * bilkul galat hai (sensitive ID proofs hain).
 */
function getSignedKycUrl(publicId, resourceType = 'image', format) {
  const expiresAt = Math.floor(Date.now() / 1000) + 10 * 60; // 10 minute

  // NOTE: Cloudinary SDK me private_download_url(public_id, format, options)
  // hai — 2nd positional arg FILE FORMAT hai ("jpg", "pdf"), resource type
  // nahi. resource_type options object ke andar jaata hai (warna Cloudinary
  // chup-chaap "image" default kar leta hai). Pehle ye dono mix ho gaye the.
  return cloudinary.utils.private_download_url(publicId, format, {
    type: 'authenticated',
    resource_type: resourceType,
    expires_at: expiresAt,
  });
}

module.exports = { uploadBuffer, getSignedKycUrl };
