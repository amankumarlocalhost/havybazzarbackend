const { slugify } = require('../src/utils/slugify');
const { createListingSchema, reviewListingSchema } = require('../src/validators/listing.validator');
const { createCategorySchema } = require('../src/validators/category.validator');
const { BUSINESS_RULES } = require('../src/constants/enums');

describe('slugify', () => {
  test('title ko lowercase, hyphen-separated slug me badalta hai', () => {
    expect(slugify('Hitachi ZX19-6 CR')).toBe('hitachi-zx19-6-cr');
  });

  test('special characters hataata hai', () => {
    expect(slugify('JCB 3DX!! (2020 Model)')).toBe('jcb-3dx-2020-model');
  });

  test('extra hyphens shuru/aakhir se hataata hai', () => {
    expect(slugify('  --Test--  ')).toBe('test');
  });
});

describe('Listing validator — business rules', () => {
  const baseListing = {
    title: 'Hitachi ZX19-6 CR',
    categoryId: '507f1f77bcf86cd799439011',
    location: { state: 'Assam' },
    listingType: 'fixed_price',
    fixedPrice: 1200000,
  };

  test('valid fixed-price listing accept honi chahiye', () => {
    const result = createListingSchema.safeParse(baseListing);
    expect(result.success).toBe(true);
  });

  test('fixed_price listing bina price ke reject honi chahiye', () => {
    const { fixedPrice, ...withoutPrice } = baseListing;
    const result = createListingSchema.safeParse(withoutPrice);
    expect(result.success).toBe(false);
  });

  test('auction listing bina auctionConfig ke reject honi chahiye', () => {
    const result = createListingSchema.safeParse({
      ...baseListing,
      listingType: 'auction',
      fixedPrice: undefined,
    });
    expect(result.success).toBe(false);
  });

  test(`${BUSINESS_RULES.MAX_EQUIPMENT_AGE_YEARS} saal se zyada purana equipment reject hona chahiye`, () => {
    const tooOldYear = new Date().getFullYear() - BUSINESS_RULES.MAX_EQUIPMENT_AGE_YEARS - 1;
    const result = createListingSchema.safeParse({
      ...baseListing,
      specifications: { general: { productionYear: tooOldYear } },
    });
    expect(result.success).toBe(false);
  });

  test('current year ka equipment accept hona chahiye', () => {
    const result = createListingSchema.safeParse({
      ...baseListing,
      specifications: { general: { productionYear: new Date().getFullYear() } },
    });
    expect(result.success).toBe(true);
  });

  test(`hour meter ${BUSINESS_RULES.MAX_HOUR_METER} se zyada reject hona chahiye`, () => {
    const result = createListingSchema.safeParse({
      ...baseListing,
      specifications: { general: { hoursOnMeter: BUSINESS_RULES.MAX_HOUR_METER + 1 } },
    });
    expect(result.success).toBe(false);
  });

  test('hour meter limit ke andar accept hona chahiye', () => {
    const result = createListingSchema.safeParse({
      ...baseListing,
      specifications: { general: { hoursOnMeter: 5000 } },
    });
    expect(result.success).toBe(true);
  });

  test('future production year reject honi chahiye', () => {
    const result = createListingSchema.safeParse({
      ...baseListing,
      specifications: { general: { productionYear: new Date().getFullYear() + 1 } },
    });
    expect(result.success).toBe(false);
  });
});

describe('Listing review validator', () => {
  test('reject bina reason ke fail hona chahiye', () => {
    expect(reviewListingSchema.safeParse({ action: 'reject' }).success).toBe(false);
  });

  test('approve bina reason ke pass hona chahiye', () => {
    expect(reviewListingSchema.safeParse({ action: 'approve' }).success).toBe(true);
  });
});

describe('Category validator', () => {
  test('English naam ke bina reject hona chahiye', () => {
    const result = createCategorySchema.safeParse({ name: { hi: 'खुदाई करने वाला' } });
    expect(result.success).toBe(false);
  });

  test('sirf English naam ke saath valid hona chahiye', () => {
    const result = createCategorySchema.safeParse({ name: { en: 'Excavators' } });
    expect(result.success).toBe(true);
  });
});
