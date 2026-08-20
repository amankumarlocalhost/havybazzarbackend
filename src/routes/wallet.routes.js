const express = require('express');
const router = express.Router();

const walletController = require('../controllers/wallet.controller');
const { authenticate } = require('../middlewares/authenticate');

router.get('/balance', authenticate, walletController.getBalance);
router.get('/history', authenticate, walletController.getHistory);

module.exports = router;
