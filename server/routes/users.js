/**
 * User Management Routes (Admin Only)
 * Handles user CRUD operations
 */

const express = require('express');
const router = express.Router();

const userController = require('../controllers/userController');
const { requireAdmin } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/errorHandler');
const { adminCreateUserValidation, updateUserStatusValidation, extendTrialValidation } = require('../middleware/validators');

// =====================
// Admin Routes (All Protected)
// =====================

// Get all users
router.get('/api/users', requireAdmin, userController.getAllUsers);

// Create new user (admin)
router.post('/api/admin/register', requireAdmin, adminCreateUserValidation, handleValidationErrors, userController.createUser);

// Delete user
router.delete('/api/users/:username', requireAdmin, userController.deleteUser);

// Update user role
router.put('/api/users/:username/role', requireAdmin, userController.updateUserRole);

// Update user status (isActive, subscriptionStatus)
router.put('/api/users/:username/status', requireAdmin, updateUserStatusValidation, handleValidationErrors, userController.updateUserStatus);

// Extend trial period
router.put('/api/users/:username/extend-trial', requireAdmin, extendTrialValidation, handleValidationErrors, userController.extendTrial);

// Get online users
router.get('/api/online-users', requireAdmin, userController.getOnlineUsers);

module.exports = router;
