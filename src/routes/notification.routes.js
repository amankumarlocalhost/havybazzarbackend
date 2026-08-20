const express = require('express');
const router = express.Router();

const notificationController = require('../controllers/notification.controller');
const { authenticate } = require('../middlewares/authenticate');

router.get('/mine', authenticate, notificationController.getMine);
router.patch('/read-all', authenticate, notificationController.markAllAsRead);
router.patch('/:notificationId/read', authenticate, notificationController.markAsRead);

module.exports = router;
