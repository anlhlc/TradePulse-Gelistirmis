const { body } = require('express-validator');

/**
 * Login validation rules
 */
const loginValidation = [
  body('username')
    .trim()
    .notEmpty().withMessage('Kullanıcı adı gereklidir')
    .isLength({ min: 3, max: 50 }).withMessage('Kullanıcı adı 3-50 karakter arasında olmalıdır'),
  body('password')
    .notEmpty().withMessage('Şifre gereklidir')
    .isLength({ min: 8 }).withMessage('Şifre en az 8 karakter olmalıdır')
];

/**
 * Registration validation rules
 */
const registerValidation = [
  body('email')
    .trim()
    .notEmpty().withMessage('E-posta gereklidir')
    .isEmail().withMessage('Geçerli bir e-posta adresi giriniz')
    .normalizeEmail(),
  body('username')
    .trim()
    .notEmpty().withMessage('Kullanıcı adı gereklidir')
    .isLength({ min: 3, max: 50 }).withMessage('Kullanıcı adı 3-50 karakter arasında olmalıdır')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Kullanıcı adı sadece harf, rakam ve alt çizgi içerebilir'),
  body('password')
    .notEmpty().withMessage('Şifre gereklidir')
    .isLength({ min: 8 }).withMessage('Şifre en az 8 karakter olmalıdır')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Şifre en az bir büyük harf, bir küçük harf ve bir rakam içermelidir')
];

/**
 * Password change validation rules
 */
const changePasswordValidation = [
  body('currentPassword')
    .notEmpty().withMessage('Mevcut şifre gereklidir'),
  body('newPassword')
    .notEmpty().withMessage('Yeni şifre gereklidir')
    .isLength({ min: 8 }).withMessage('Yeni şifre en az 8 karakter olmalıdır')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Şifre en az bir büyük harf, bir küçük harf ve bir rakam içermelidir')
    .custom((value, { req }) => {
      if (value === req.body.currentPassword) {
        throw new Error('Yeni şifre mevcut şifre ile aynı olamaz');
      }
      return true;
    })
];

/**
 * Admin user creation validation
 */
const adminCreateUserValidation = [
  body('email')
    .trim()
    .notEmpty().withMessage('E-posta gereklidir')
    .isEmail().withMessage('Geçerli bir e-posta adresi giriniz')
    .normalizeEmail(),
  body('username')
    .trim()
    .notEmpty().withMessage('Kullanıcı adı gereklidir')
    .isLength({ min: 3, max: 50 }).withMessage('Kullanıcı adı 3-50 karakter arasında olmalıdır'),
  body('password')
    .notEmpty().withMessage('Şifre gereklidir')
    .isLength({ min: 8 }).withMessage('Şifre en az 8 karakter olmalıdır'),
  body('role')
    .optional()
    .isIn(['admin', 'user']).withMessage('Geçersiz rol')
];

/**
 * Update user status validation
 */
const updateUserStatusValidation = [
  body('isActive')
    .optional()
    .isBoolean().withMessage('isActive boolean olmalıdır'),
  body('subscriptionStatus')
    .optional()
    .isIn(['trial', 'active', 'expired', 'banned']).withMessage('Geçersiz abonelik durumu')
];

/**
 * Extend trial validation
 */
const extendTrialValidation = [
  body('days')
    .optional()
    .isInt({ min: 1, max: 30 }).withMessage('Gün sayısı 1-30 arasında olmalıdır')
    .toInt()
];

module.exports = {
  loginValidation,
  registerValidation,
  changePasswordValidation,
  adminCreateUserValidation,
  updateUserStatusValidation,
  extendTrialValidation
};
