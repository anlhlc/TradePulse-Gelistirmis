const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Check if trial is valid for a user
 */
function isTrialValid(user) {
  if (user.role === 'admin') return true;
  if (user.subscriptionStatus === 'active') return true;
  if (user.subscriptionStatus === 'trial' && user.trialEndDate) {
    return new Date() <= user.trialEndDate;
  }
  return false;
}

/**
 * Trial access middleware
 * Redirects unauthenticated users to login
 * Checks trial status for authenticated users
 */
function checkTrialAccess(req, res, next) {
  // Check if user is authenticated
  if (!req.session || !req.session.authenticated) {
    return res.redirect('/login');
  }

  // Find user and check trial status
  User.findOne({ username: req.session.username.toLowerCase() })
    .then(user => {
      if (!user) {
        req.session.destroy();
        return res.redirect('/login');
      }

      // Check if account is active
      if (!user.isActive) {
        req.session.destroy();
        return res.status(403).json({
          error: 'Hesabınız askıya alınmış. Lütfen admin ile iletişime geçin.'
        });
      }

      // Check trial validity
      if (!isTrialValid(user)) {
        req.session.destroy();
        return res.status(403).json({
          error: 'Deneme süreniz doldu! Premium erişim için lütfen iletişime geçin.'
        });
      }

      // Update last active time in session
      req.session.lastActivity = new Date();
      next();
    })
    .catch(err => {
      logger.error('Deneme kontrolü hatası:', err);
      // On error, allow access but log the issue
      next();
    });
}

/**
 * Check trial access for API endpoints (JSON response)
 */
function checkTrialAccessAPI(req, res, next) {
  if (!req.session || !req.session.authenticated) {
    return res.status(401).json({ error: 'Giriş yapmanız gereklidir.' });
  }

  User.findOne({ username: req.session.username.toLowerCase() })
    .then(user => {
      if (!user) {
        req.session.destroy();
        return res.status(401).json({ error: 'Kullanıcı bulunamadı.' });
      }

      if (!user.isActive) {
        req.session.destroy();
        return res.status(403).json({
          error: 'Hesabınız askıya alınmış. Lütfen admin ile iletişime geçin.'
        });
      }

      if (!isTrialValid(user)) {
        req.session.destroy();
        return res.status(403).json({
          error: 'Deneme süreniz doldu! Premium erişim için lütfen iletişime geçin.'
        });
      }

      req.user = user; // Attach user to request for later use
      next();
    })
    .catch(err => {
      logger.error('Deneme kontrolü API hatası:', err);
      res.status(500).json({ error: 'Sunucu hatası oluştu.' });
    });
}

module.exports = {
  isTrialValid,
  checkTrialAccess,
  checkTrialAccessAPI
};
