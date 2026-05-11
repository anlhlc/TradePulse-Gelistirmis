/**
 * Authentication Routes
 * Handles login, logout, registration, and session management
 */

const express = require('express');
const router = express.Router();
const path = require('path');

const authController = require('../controllers/authController');
const { loginLimiter } = require('../middleware/rateLimit');
const { requireAuth } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/errorHandler');
const { loginValidation, registerValidation, changePasswordValidation } = require('../middleware/validators');

// =====================
// Public Routes
// =====================

// Login page
router.get('/login', (req, res) => {
  if (req.session && req.session.authenticated) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, '../../views/login.html'));
});

// Login submission
router.post('/login', loginLimiter, loginValidation, handleValidationErrors, authController.login);

// Public registration endpoint
router.post('/api/register', require('../middleware/rateLimit').registerLimiter, registerValidation, handleValidationErrors, authController.register);

// =====================
// Protected Routes
// =====================

// Logout - GET (redirect)
router.get('/logout', authController.logout);

// Logout - POST (JSON response)
router.post('/logout', authController.logout);

// Session info
router.get('/api/session', requireAuth, authController.getSessionInfo);

// User profile
router.get('/api/user', requireAuth, authController.getUserProfile);

// Change password
router.post('/api/change-password', requireAuth, require('../middleware/rateLimit').passwordChangeLimiter, changePasswordValidation, handleValidationErrors, authController.changePassword);

module.exports = router;
