/**
 * slugify.js
 * ---------------------------------------------------------------------------
 * "Hitachi ZX19-6 CR" -> "hitachi-zx19-6-cr"
 *
 * Slug unique hona chahiye (schema me unique index hai). Agar same naam
 * ki do listings/categories bane, to doosri ke slug ke aakhir me
 * random suffix jud jaayega — taaki duplicate key error na aaye.
 * ---------------------------------------------------------------------------
 */

function slugify(text) {
  return text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // sab special characters ko hyphen se replace
    .replace(/^-+|-+$/g, '');   // shuru/aakhir ke extra hyphens hataao
}

/**
 * Model pass karo, base text pass karo — ye check karega slug already
 * exist to nahi karta, agar karta hai to random suffix jod dega.
 */
async function generateUniqueSlug(Model, text) {
  const base = slugify(text);
  let slug = base;
  let counter = 1;

  // eslint-disable-next-line no-await-in-loop
  while (await Model.exists({ slug })) {
    slug = `${base}-${counter}`;
    counter += 1;
  }

  return slug;
}

module.exports = { slugify, generateUniqueSlug };
