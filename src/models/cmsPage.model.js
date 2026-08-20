/**
 * cmsPage.model.js
 * ---------------------------------------------------------------------------
 * Doc ka module: "Admin can update pages such as Contact Support, Legal,
 * Privacy Policy, FAQs, and more."
 *
 * Localized content — doc ka rule "localization sirf static content pe"
 * yahan bilkul fit baithta hai, CMS content hi static content hai.
 * ---------------------------------------------------------------------------
 */

const mongoose = require('mongoose');
const { LANGUAGE } = require('../constants/enums');

const localizedTextSchema = new mongoose.Schema(
  {
    [LANGUAGE.ENGLISH]: { type: String, trim: true },
    [LANGUAGE.HINDI]: { type: String, trim: true },
    [LANGUAGE.ASSAMESE]: { type: String, trim: true },
  },
  { _id: false }
);

const cmsPageSchema = new mongoose.Schema(
  {
    // "privacy-policy", "terms-and-conditions", "faq", "contact-support"
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },

    title: { type: localizedTextSchema, required: true },
    content: { type: localizedTextSchema, required: true },

    isPublished: { type: Boolean, default: true },

    updatedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CmsPage', cmsPageSchema);
