/**
 * upload.js (middleware)
 * ---------------------------------------------------------------------------
 * Multer `memoryStorage` use kar rahe hain — file kabhi bhi aapke server
 * ki disk pe save NAHI hoti, seedha memory buffer me rehti hai aur wahan
 * se Cloudinary ko stream ho jaati hai.
 *
 * Kyun disk pe nahi? Agar disk pe save karte, to server restart/crash pe
 * adhoori files pade reh jaatin, aur disk cleanup ka alag jhanjhat.
 * Memory storage + turant Cloudinary upload = koi leftover nahi.
 * ---------------------------------------------------------------------------
 */

const multer = require('multer');
const AppError = require('../utils/AppError');

const MAX_FILE_SIZE_MB = 10;

const ALLOWED_KYC_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  if (!ALLOWED_KYC_MIME_TYPES.includes(file.mimetype)) {
    return cb(new AppError('Only JPG, PNG, or PDF files are allowed.', 400), false);
  }
  cb(null, true);
}

const uploadKycDocs = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
});

module.exports = { uploadKycDocs };
