const logger = require('../utils/logger');

/**
 * Basic authentication middleware
 * Checks if user is authenticated via session
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  res.redirect('/login');
}

/**
 * Admin authorization middleware
 * Checks if authenticated user has admin role
 */
function requireAdmin(req, res, next) {
  if (req.session && req.session.authenticated && req.session.role === 'admin') {
    return next();
  }
  res.status(403).json({ error: 'Bu işlem için admin yetkisi gereklidir.' });
}

/**
 * Track user activity middleware
 * Updates online users map with current activity
 */
const onlineUsers = new Map(); // In-memory store (use Redis in production)

function trackActivity(req, res, next) {
  if (req.session && req.session.authenticated) {
    const userId = req.session.username;
    onlineUsers.set(userId, {
      username: req.session.username,
      role: req.session.role,
      lastActive: new Date(),
      ip: req.ip || req.connection.remoteAddress
    });
  }
  next();
}

/**
 * Clean up inactive users (runs every minute)
 * Removes users inactive for more than 15 minutes
 */
setInterval(() => {
  const now = new Date();
  const timeout = 15 * 60 * 1000;

  for (const [userId, userData] of onlineUsers.entries()) {
    const timeDiff = now - userData.lastActive;
    if (timeDiff > timeout) {
      logger.info(`${userId} oturumu zaman aşımı nedeniyle sonlandırıldı.`);
      onlineUsers.delete(userId);
    }
  }
}, 60 * 1000);

/**
 * Get online users count
 */
function getOnlineUsersCount() {
  return onlineUsers.size;
}

/**
 * Get all online users
 */
function getOnlineUsers() {
  return Array.from(onlineUsers.entries()).map(([userId, userData]) => ({
    username: userData.username,
    role: userData.role,
    lastActive: userData.lastActive,
    ip: userData.ip
  }));
}

/**
 * Remove user from online list
 */
function removeOnlineUser(username) {
  onlineUsers.delete(username);
}

/**
 * Add user to online list
 */
function addOnlineUser(username, role, ip) {
  onlineUsers.set(username, {
    username,
    role,
    lastActive: new Date(),
    ip
  });
}

module.exports = {
  requireAuth,
  requireAdmin,
  trackActivity,
  getOnlineUsersCount,
  getOnlineUsers,
  removeOnlineUser,
  addOnlineUser
};
