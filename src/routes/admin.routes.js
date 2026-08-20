const express = require('express');
const router = express.Router();

const adminAuthController = require('../controllers/adminAuth.controller');
const subAdminController = require('../controllers/subAdmin.controller');
const userManagementController = require('../controllers/userManagement.controller');
const dashboardController = require('../controllers/dashboard.controller');

const validate = require('../middlewares/validate');
const { authenticateAdmin, requirePermission, requireSuperAdmin } = require('../middlewares/authenticateAdmin');
const { loginLimiter } = require('../middlewares/rateLimiter');

const { adminLoginSchema } = require('../validators/adminAuth.validator');
const {
  createSubAdminSchema,
  updatePermissionsSchema,
  setActiveStatusSchema,
} = require('../validators/subAdmin.validator');
const { suspendUserSchema } = require('../validators/userManagement.validator');
const { PERMISSION } = require('../constants/enums');

// ---- Auth ----
router.post('/login', loginLimiter, validate(adminLoginSchema), adminAuthController.login);
router.get('/me', authenticateAdmin, adminAuthController.getMe);

// ---- Dashboard ----
// Koi bhi logged-in admin dekh sakta hai — permission-gated nahi,
// kyunki ye sirf overview hai, koi sensitive action nahi
router.get('/dashboard/stats', authenticateAdmin, dashboardController.getStats);
router.get('/dashboard/revenue-trend', authenticateAdmin, dashboardController.getRevenueTrend);
router.get('/dashboard/activity', authenticateAdmin, dashboardController.getRecentActivity);

// ---- Manage Buyers/Sellers ----
router.get('/users', authenticateAdmin, requirePermission(PERMISSION.USERS_VIEW), userManagementController.list);
router.get(
  '/users/export',
  authenticateAdmin,
  requirePermission(PERMISSION.USERS_EXPORT),
  userManagementController.exportCsv
);
router.get(
  '/users/:userId',
  authenticateAdmin,
  requirePermission(PERMISSION.USERS_VIEW),
  userManagementController.getOne
);
router.post(
  '/users/:userId/suspend',
  authenticateAdmin,
  requirePermission(PERMISSION.USERS_SUSPEND),
  validate(suspendUserSchema),
  userManagementController.suspend
);
router.post(
  '/users/:userId/activate',
  authenticateAdmin,
  requirePermission(PERMISSION.USERS_SUSPEND),
  userManagementController.activate
);
router.post(
  '/users/:userId/make-seller',
  authenticateAdmin,
  requirePermission(PERMISSION.USERS_EDIT),
  userManagementController.makeSeller
);

// ---- Sub-Admin Management (Super Admin ONLY) ----
router.post(
  '/sub-admins',
  authenticateAdmin,
  requireSuperAdmin,
  validate(createSubAdminSchema),
  subAdminController.create
);
router.get('/sub-admins', authenticateAdmin, requireSuperAdmin, subAdminController.list);
router.patch(
  '/sub-admins/:subAdminId/permissions',
  authenticateAdmin,
  requireSuperAdmin,
  validate(updatePermissionsSchema),
  subAdminController.updatePermissions
);
router.patch(
  '/sub-admins/:subAdminId/status',
  authenticateAdmin,
  requireSuperAdmin,
  validate(setActiveStatusSchema),
  subAdminController.setActiveStatus
);

module.exports = router;
