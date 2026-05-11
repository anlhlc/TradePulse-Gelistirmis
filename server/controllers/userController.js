/**
 * User Management Controller
 * Handles admin user management operations
 */

const User = require('../models/User');
const logger = require('../utils/logger');
const { TRIAL_DAYS, TRIAL_MS } = require('../config/constants');

// =====================
// Get All Users (Admin)
// =====================

async function getAllUsers(req, res) {
  try {
    logger.info(`Admin kullanıcı listesi istedi: ${req.session.username}`);
    const users = await User.find({}, '-password');
    logger.info(`Kullanıcı sayısı: ${users.length}`);
    res.json(users);
  } catch (error) {
    logger.error('Kullanıcı listeleme hatası:', error);
    res.status(500).json({ error: 'Kullanıcılar listelenirken bir hata oluştu.' });
  }
}

// =====================
// Create User (Admin)
// =====================

async function createUser(req, res) {
  const { username, email, password, role } = req.body;

  try {
    // Check if username exists
    const existingUser = await User.findOne({ username: username.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'Bu kullanıcı adı zaten mevcut.' });
    }

    // Check if email exists
    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.status(400).json({ error: 'Bu e-posta adresi zaten mevcut.' });
    }

    // Determine role
    const validRoles = ['admin', 'user'];
    const userRole = role && validRoles.includes(role) ? role : 'user';

    // Create user with trial (or active for admin)
    const now = new Date();
    const trialEnd = new Date(now.getTime() + TRIAL_MS);

    const newUser = await User.create({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password: password,
      role: userRole,
      trialStartDate: now,
      trialEndDate: trialEnd,
      subscriptionStatus: userRole === 'admin' ? 'active' : 'trial',
      isActive: true
    });

    logger.info(`Admin tarafından yeni kullanıcı oluşturuldu: ${newUser.username} (${newUser.role})`);

    res.status(201).json({
      success: true,
      message: 'Kullanıcı başarıyla oluşturuldu.',
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        subscriptionStatus: newUser.subscriptionStatus,
        createdAt: newUser.createdAt
      }
    });
  } catch (error) {
    logger.error('Kullanıcı oluşturma hatası:', error);
    res.status(500).json({ error: 'Kullanıcı oluşturulurken bir hata oluştu.' });
  }
}

// =====================
// Delete User (Admin)
// =====================

async function deleteUser(req, res) {
  const { username } = req.params;

  // Prevent admin deletion
  if (username.toLowerCase() === 'admin') {
    return res.status(400).json({ error: 'Admin kullanıcısı silinemez.' });
  }

  try {
    const deletedUser = await User.findOneAndDelete({ username: username.toLowerCase() });

    if (!deletedUser) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

    // Remove from online users
    const { removeOnlineUser } = require('../middleware/auth');
    removeOnlineUser(deletedUser.username);

    logger.info(`Admin tarafından kullanıcı silindi: ${deletedUser.username}`);

    res.json({
      success: true,
      message: `Kullanıcı '${deletedUser.username}' başarıyla silindi.`
    });
  } catch (error) {
    logger.error('Kullanıcı silme hatası:', error);
    res.status(500).json({ error: 'Kullanıcı silinirken bir hata oluştu.' });
  }
}

// =====================
// Update User Role (Admin)
// =====================

async function updateUserRole(req, res) {
  const { username } = req.params;
  const { role } = req.body;

  // Validate role
  const validRoles = ['admin', 'user'];
  if (!role || !validRoles.includes(role)) {
    return res.status(400).json({ error: 'Geçersiz rol. Kabul edilen değerler: admin, user' });
  }

  // Prevent admin role change
  if (username.toLowerCase() === 'admin') {
    return res.status(400).json({ error: 'Admin kullanıcısının rolü değiştirilemez.' });
  }

  try {
    const updatedUser = await User.findOneAndUpdate(
      { username: username.toLowerCase() },
      { role: role },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

    logger.info(`${updatedUser.username} rolü '${role}' olarak güncellendi.`);

    res.json({
      success: true,
      message: 'Kullanıcı rolü başarıyla güncellendi.',
      user: {
        username: updatedUser.username,
        role: updatedUser.role
      }
    });
  } catch (error) {
    logger.error('Rol güncelleme hatası:', error);
    res.status(500).json({ error: 'Rol güncellenirken bir hata oluştu.' });
  }
}

// =====================
// Update User Status (Admin)
// =====================

async function updateUserStatus(req, res) {
  const { username } = req.params;
  const { isActive, subscriptionStatus } = req.body;

  // Prevent admin status change
  if (username.toLowerCase() === 'admin') {
    return res.status(400).json({ error: 'Admin kullanıcısının durumu değiştirilemez.' });
  }

  try {
    const updateData = {};

    if (typeof isActive === 'boolean') {
      updateData.isActive = isActive;
    }

    if (subscriptionStatus && ['trial', 'active', 'expired', 'banned'].includes(subscriptionStatus)) {
      updateData.subscriptionStatus = subscriptionStatus;
    }

    const updatedUser = await User.findOneAndUpdate(
      { username: username.toLowerCase() },
      updateData,
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

    logger.info(`Kullanıcı durumu güncellendi: ${updatedUser.username}, isActive=${updatedUser.isActive}, status=${updatedUser.subscriptionStatus}`);

    res.json({
      success: true,
      message: 'Kullanıcı durumu başarıyla güncellendi.',
      user: {
        username: updatedUser.username,
        isActive: updatedUser.isActive,
        subscriptionStatus: updatedUser.subscriptionStatus
      }
    });
  } catch (error) {
    logger.error('Durum güncelleme hatası:', error);
    res.status(500).json({ error: 'Durum güncellenirken bir hata oluştu.' });
  }
}

// =====================
// Extend Trial Period (Admin)
// =====================

async function extendTrial(req, res) {
  const { username } = req.params;
  const { days } = req.body;

  const extendDays = parseInt(days) || TRIAL_DAYS;
  const maxDays = 30; // Maximum 30 days extension

  if (extendDays > maxDays) {
    return res.status(400).json({ error: `Deneme süresi en fazla ${maxDays} gün uzatılabilir.` });
  }

  try {
    const user = await User.findOne({ username: username.toLowerCase() });

    if (!user) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

    // Admin doesn't need trial extension
    if (user.role === 'admin') {
      return res.status(400).json({ error: 'Admin kullanıcısının deneme süresi değiştirilemez.' });
    }

    const now = new Date();
    const newTrialEnd = new Date(now.getTime() + (extendDays * 24 * 60 * 60 * 1000));

    user.trialStartDate = now;
    user.trialEndDate = newTrialEnd;
    user.subscriptionStatus = 'trial';
    user.isActive = true;
    await user.save();

    logger.info(`${user.username} deneme süresi ${extendDays} gün uzatıldı. Yeni bitiş: ${newTrialEnd.toISOString()}`);

    res.json({
      success: true,
      message: `Deneme süresi ${extendDays} gün uzatıldı.`,
      user: {
        username: user.username,
        trialDays: extendDays,
        trialEndDate: newTrialEnd
      }
    });
  } catch (error) {
    logger.error('Deneme uzatma hatası:', error);
    res.status(500).json({ error: 'Deneme süresi uzatılırken bir hata oluştu.' });
  }
}

// =====================
// Get Online Users (Admin)
// =====================

function getOnlineUsers(req, res) {
  const { getOnlineUsers } = require('../middleware/auth');
  const now = new Date();
  const users = getOnlineUsers().map(user => {
    const timeDiff = now - user.lastActive;
    const minutesAgo = Math.floor(timeDiff / 60000);
    return {
      ...user,
      minutesAgo,
      status: minutesAgo < 15 ? 'online' : 'idle'
    };
  });

  res.json({
    count: users.length,
    users: users.sort((a, b) => a.minutesAgo - b.minutesAgo)
  });
}

module.exports = {
  getAllUsers,
  createUser,
  deleteUser,
  updateUserRole,
  updateUserStatus,
  extendTrial,
  getOnlineUsers
};
