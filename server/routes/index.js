/**
 * Index Route
 * Redirects to dashboard after trial check
 */

const express = require('express');
const router = express.Router();
const path = require('path');

const { checkTrialAccess } = require('../middleware/trialAccess');

// Dashboard (protected + trial check)
router.get('/', checkTrialAccess, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/dashboard.html'));
});

// Admin panel (protected + admin only)
router.get('/admin', require('../middleware/auth').requireAuth, require('../middleware/auth').requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/admin.html'));
});

module.exports = router;
