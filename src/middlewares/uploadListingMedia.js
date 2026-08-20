/**
 * Listing media (equipment photos/videos) ke liye alag multer config —
 * KYC docs se limits/types alag hain isliye alag file rakha.
 */

const multer = require('multer');
const AppError = require('../utils/AppError');

const MAX_FILE_SIZE_MB = 50; // videos ke liye zyada limit chahiye

const ALLOWED_MEDIA_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
];

const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  if (!ALLOWED_MEDIA_MIME_TYPES.includes(file.mimetype)) {
    return cb(new AppError('Only JPG, PNG, WEBP images or MP4/MOV videos are allowed.', 400), false);
  }
  cb(null, true);
}

const uploadListingMedia = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
});

module.exports = { uploadListingMedia };
