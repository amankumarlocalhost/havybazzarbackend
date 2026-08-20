const { adminLoginSchema } = require('../src/validators/adminAuth.validator');
const {
  createSubAdminSchema,
  updatePermissionsSchema,
} = require('../src/validators/subAdmin.validator');
const { upsertCmsPageSchema } = require('../src/validators/cms.validator');
const { suspendUserSchema } = require('../src/validators/userManagement.validator');

describe('Admin login validator', () => {
  test('galat email format reject', () => {
    expect(adminLoginSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(false);
  });

  test('valid login accept', () => {
    expect(adminLoginSchema.safeParse({ email: 'admin@heavybazar.com', password: 'secret123' }).success).toBe(
      true
    );
  });
});

describe('Sub-admin validator', () => {
  const validBase = {
    email: 'subadmin@heavybazar.com',
    password: 'Test1234',
    fullName: 'Sub Admin',
  };

  test('valid sub-admin with known permissions accept', () => {
    const result = createSubAdminSchema.safeParse({
      ...validBase,
      permissions: ['listings:approve', 'kyc:verify'],
    });
    expect(result.success).toBe(true);
  });

  test('galat/fake permission string reject', () => {
    const result = createSubAdminSchema.safeParse({
      ...validBase,
      permissions: ['delete_everything'],
    });
    expect(result.success).toBe(false);
  });

  test('permissions na diye jaayein to khaali array default banta hai', () => {
    const result = createSubAdminSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    expect(result.data.permissions).toEqual([]);
  });

  test('updatePermissionsSchema empty array bhi accept karta hai (sab permissions hataana)', () => {
    expect(updatePermissionsSchema.safeParse({ permissions: [] }).success).toBe(true);
  });
});

describe('CMS page validator', () => {
  test('valid title/content accept', () => {
    const result = upsertCmsPageSchema.safeParse({
      title: { en: 'Privacy Policy' },
      content: { en: 'We respect your privacy...' },
    });
    expect(result.success).toBe(true);
  });

  test('isPublished optional boolean', () => {
    const result = upsertCmsPageSchema.safeParse({
      title: { en: 'FAQ' },
      content: { en: 'Frequently asked questions' },
      isPublished: false,
    });
    expect(result.success).toBe(true);
    expect(result.data.isPublished).toBe(false);
  });
});

describe('Suspend user validator', () => {
  test('reason ke bina reject', () => {
    expect(suspendUserSchema.safeParse({}).success).toBe(false);
  });

  test('reason ke saath accept', () => {
    expect(suspendUserSchema.safeParse({ reason: 'Fake listing repeatedly' }).success).toBe(true);
  });
});
