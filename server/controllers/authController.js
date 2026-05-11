/**
 * Authentication Controller
 * Handles login, logout, registration, and password management
 */

const User = require('../models/User');
const logger = require('../utils/logger');
const { TRIAL_DAYS, TRIAL_MS } = require('../config/constants');

// Trial constants (imported from config)

// =====================
// Login Handler
// =====================

async function login(req, res) {
  const { username, password } = req.body;

  try {
    // Find user by credentials
    const user = await User.findByCredentials(username, password);

    if (!user) {
      logger.warn(`Failed login attempt for username: ${username}`);
      return res.json({ error: 'Hatalı kullanıcı adı veya şifre.' });
    }

    // Check if account is active
    if (!user.isActive) {
      logger.warn(`Login attempt for inactive account: ${user.username}`);
      return res.json({ error: 'Hesabınız askıya alınmış. Lütfen admin ile iletişime geçin.' });
    }

    // Check trial validity
    if (!user.isTrialValid()) {
      logger.warn(`Login attempt with expired trial: ${user.username}`);
      return res.json({
        error: 'Deneme süreniz doldu! Premium erişim için lütfen iletişime geçin.'
      });
    }

    // Update last login time
    user.lastLogin = new Date();
    await user.save();

    // Add to online users
    const { addOnlineUser } = require('../middleware/auth');
    addOnlineUser(user.username, user.role, req.ip || req.connection.remoteAddress);

    // Create session
    req.session.authenticated = true;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.loginTime = new Date();

    logger.info(`${user.username} giriş yaptı. (Kalan deneme: ${user.remainingTrialDays} gün)`);

    res.json({ success: true, redirect: '/' });
  } catch (error) {
    logger.error('Giriş hatası:', error);
    res.json({ error: 'Giriş sırasında bir hata oluştu.' });
  }
}

// =====================
// Logout Handler
// =====================

async function logout(req, res) {
  const username = req.session?.username;

  if (username) {
    const { removeOnlineUser } = require('../middleware/auth');
    removeOnlineUser(username);
    logger.info(`${username} çıkış yaptı.`);
  }

  req.session.destroy((err) => {
    if (err) {
      logger.error('Çıkış hatası:', err);
      return res.status(500).json({ success: false, error: 'Çıkış sırasında hata oluştu.' });
    }
    res.json({ success: true });
  });
}

// =====================
// Register Handler
// =====================

async function register(req, res) {
  const { email, username, password } = req.body;

  try {
    // Check if email already exists
    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.status(400).json({ error: 'Bu e-posta adresi zaten kayıtlı.' });
    }

    // Check if username already exists
    const existingUser = await User.findOne({ username: username.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'Bu kullanıcı adı zaten alınmış.' });
    }

    // Create new user with trial
    const now = new Date();
    const trialEnd = new Date(now.getTime() + TRIAL_MS);

    const newUser = await User.create({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password: password,
      role: 'user',
      trialStartDate: now,
      trialEndDate: trialEnd,
      subscriptionStatus: 'trial',
      isActive: true
    });

    logger.info(`Yeni kullanıcı kaydoldu: ${newUser.username}`);
    logger.info(`   E-posta: ${newUser.email}`);
    logger.info(`   Deneme başlangıcı: ${now.toISOString()}`);
    logger.info(`   Deneme bitişi: ${trialEnd.toISOString()}`);

    res.status(201).json({
      success: true,
      message: 'Kayıt başarılı! 3 günlük ücretsiz deneme süreniz başladı.',
      user: {
        username: newUser.username,
        trialDays: TRIAL_DAYS,
        trialEndDate: trialEnd
      }
    });
  } catch (error) {
    logger.error('Kayıt hatası:', error);
    res.status(500).json({ error: 'Kayıt sırasında bir hata oluştu.' });
  }
}

// =====================
// Change Password Handler
// =====================

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;

  try {
    // Find user with password field
    const user = await User.findOne({ username: req.session.username.toLowerCase() }).select('+password');

    if (!user) {
      return res.json({ error: 'Kullanıcı bulunamadı.' });
    }

    // Verify current password
    const isValid = await user.comparePassword(currentPassword);
    if (!isValid) {
      return res.json({ error: 'Mevcut şifre yanlış.' });
    }

    // Update password (triggers pre-save hook for hashing)
    user.password = newPassword;
    await user.save();

    logger.info(`${user.username} şifresini değiştirdi.`);

    res.json({ success: true, message: 'Şifre başarıyla değiştirildi.' });
  } catch (error) {
    logger.error('Şifre değiştirme hatası:', error);
    res.json({ error: 'Şifre değiştirme sırasında bir hata oluştu.' });
  }
}

// =====================
// Session Info Handler
// =====================

function getSessionInfo(req, res) {
  res.json({
    authenticated: true,
    username: req.session.username,
    role: req.session.role,
    loginTime: req.session.loginTime
  });
}

// =====================
// User Profile Handler
// =====================

async function getUserProfile(req, res) {
  try {
    const user = await User.findOne({ username: req.session.username.toLowerCase() });

    if (!user) {
      return res.json({ error: 'Kullanıcı bulunamadı.' });
    }

    res.json(user.getPublicProfile());
  } catch (error) {
    logger.error('Kullanıcı bilgisi getirme hatası:', error);
    res.json({ error: 'Kullanıcı bilgileri getirilirken bir hata oluştu.' });
  }
}

module.exports = {
  login,
  logout,
  register,
  changePassword,
  getSessionInfo,
  getUserProfile
};
