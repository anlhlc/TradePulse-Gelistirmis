/**
 * Binance API Routes
 * Proxy routes for Binance Futures API
 */

const express = require('express');
const router = express.Router();

const binanceController = require('../controllers/binanceController');
const { checkTrialAccess } = require('../middleware/trialAccess');

// =====================
// Binance Proxy Routes
// =====================

// Get force orders (liquidations)
router.get('/api/binance/liquidations', checkTrialAccess, binanceController.getLiquidations);

// Generic proxy endpoint
router.get('/api/binance/:endpoint', checkTrialAccess, binanceController.proxyRequest);

module.exports = router;
