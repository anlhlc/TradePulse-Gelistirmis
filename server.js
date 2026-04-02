require('dotenv').config();
const express = require('express');
const app = express();
const session = require('express-session');
app.set('trust proxy', 1);
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const mongoose = require('mongoose');

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tradepulse';

// =====================
// Sabitler
// =====================
const TRIAL_DAYS = 3; // Deneme süresi (gün)
const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000; // Milisaniye cinsinden

// =====================
// MongoDB Bağlantısı
// =====================
async function connectDatabase() {
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 50,
      maxIdleTimeMS: 30000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000
    });
    console.log('✅ MongoDB veritabanına başarıyla bağlanıldı.');
    console.log(`   Veritabanı: ${MONGODB_URI}`);
    console.log(`   Bağlantı havuzu: 50 (artırılmış kapasite)`);
  } catch (error) {
    console.error('❌ MongoDB bağlantı hatası:', error.message);
    console.error('   Lütfen .env dosyasındaki MONGODB_URI değerini kontrol edin.');
    process.exit(1);
  }
}

// =====================
// User Model - GÜNCELLENDİ
// =====================
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    minlength: 3,
    maxlength: 50
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 8
  },
  role: {
    type: String,
    enum: ['admin', 'user'],
    default: 'user'
  },
  // Deneme sistemi alanları
  trialStartDate: {
    type: Date,
    default: null
  },
  trialEndDate: {
    type: Date,
    default: null
  },
  subscriptionStatus: {
    type: String,
    enum: ['trial', 'active', 'expired', 'banned'],
    default: 'trial'
  },
  // Hesap durumu
  isActive: {
    type: Boolean,
    default: true
  },
  // Tarih bilgileri
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date,
    default: null
  }
});

// Virtual field: Deneme süresi dolmuş mu?
userSchema.virtual('isTrialExpired').get(function() {
  if (!this.trialStartDate || !this.trialEndDate) return false;
  return new Date() > this.trialEndDate;
});

// Virtual field: Kalan deneme günleri
userSchema.virtual('remainingTrialDays').get(function() {
  if (!this.trialStartDate || !this.trialEndDate) return 0;
  const remaining = this.trialEndDate - new Date();
  return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
});

// Virtual field: Deneme durumu
userSchema.virtual('trialStatus').get(function() {
  if (this.subscriptionStatus !== 'trial') return this.subscriptionStatus;
  if (this.isTrialExpired) return 'expired';
  return 'active';
});

// Schema'yı JSON'a virtual alanları dahil et
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

const User = mongoose.model('User', userSchema);

// =====================
// Online Kullanıcı Takip Sistemi
// =====================
const onlineUsers = new Map(); // userId -> { username, lastActive, ip }

// Online kullanıcı takip middleware'i
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

// 15 dakika aktif olmayan kullanıcıları temizle (her dakika çalış)
setInterval(() => {
  const now = new Date();
  const timeout = 15 * 60 * 1000;

  for (const [userId, userData] of onlineUsers.entries()) {
    const timeDiff = now - userData.lastActive;
    if (timeDiff > timeout) {
      console.log(`🟢 ${userId} oturumu zaman aşımı nedeniyle sonlandırıldı.`);
      onlineUsers.delete(userId);
    }
  }
}, 60 * 1000);

// =====================
// Yardımcı Fonksiyonlar
// =====================

// Deneme süresi kontrolü
function isTrialValid(user) {
  if (user.role === 'admin') return true; // Admin her zaman erişebilir
  if (user.subscriptionStatus === 'active') return true;
  if (user.subscriptionStatus === 'trial' && user.trialEndDate) {
    return new Date() <= user.trialEndDate;
  }
  return false;
}

// Kullanıcı erişim kontrolü middleware
function checkTrialAccess(req, res, next) {
  if (!req.session || !req.session.authenticated) {
    return res.redirect('/login');
  }

  User.findOne({ username: req.session.username.toLowerCase() })
    .then(user => {
      if (!user) {
        req.session.destroy();
        return res.redirect('/login');
      }

      if (!user.isActive) {
        req.session.destroy();
        return res.status(403).json({
          error: 'Hesabınız askıya alınmış. Lütfen admin ile iletişime geçin.'
        });
      }

      if (!isTrialValid(user)) {
        // Deneme süresi dolmuş
        req.session.destroy();
        return res.status(403).json({
          error: 'Deneme süreniz doldu! Premium erişim için lütfen iletişime geçin.'
        });
      }

      next();
    })
    .catch(err => {
      console.error('Deneme kontrolü hatası:', err);
      next();
    });
}

// Varsayılan admin kullanıcısını oluştur veya güncelle
async function initDefaultUser() {
  const adminPassword = process.env.ADMIN_PASSWORD || 'BinanceSecure2024!';

  try {
    const existingUser = await User.findOne({ username: 'admin' });

    if (existingUser) {
      const hash = await bcrypt.hash(adminPassword, 10);
      existingUser.password = hash;
      existingUser.role = 'admin';
      existingUser.email = 'admin@tradepulse.local';
      existingUser.subscriptionStatus = 'active';
      existingUser.isActive = true;
      await existingUser.save();
      console.log('🔐 Mevcut admin kullanıcısı güncellendi.');
    } else {
      const hash = await bcrypt.hash(adminPassword, 10);
      await User.create({
        username: 'admin',
        email: 'admin@tradepulse.local',
        password: hash,
        role: 'admin',
        subscriptionStatus: 'active',
        isActive: true
      });
      console.log('🔐 Yeni admin kullanıcısı oluşturuldu.');
    }

    console.log(`   Kullanıcı adı: admin`);
    console.log(`   Şifre: ${adminPassword}`);
    console.log(`   ⚠️  İlk girişten sonra .env dosyasından şifreyi değiştirin!`);
  } catch (error) {
    console.error('❌ Varsayılan kullanıcı oluşturma hatası:', error.message);
  }
}

// Güvenlik middleware'leri
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// JSON body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session yapılandırması
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-super-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 saat
  }
}));

// Rate limiting - Brute force koruması
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Çok fazla giriş denemesi. Lütfen 15 dakika bekleyin.' }
});

// Rate limiting - Kayıt için
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 saat
  max: 5, // Saat başı max 5 kayıt
  message: { error: 'Çok fazla kayıt denemesi. Lütfen daha sonra tekrar deneyin.' }
});

// Track activity middleware'ini tüm rotalara uygula
app.use(trackActivity);

// Auth middleware - Temel
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  res.redirect('/login');
}

// Admin yetki kontrolü
function requireAdmin(req, res, next) {
  if (req.session && req.session.authenticated && req.session.role === 'admin') {
    return next();
  }
  res.status(403).json({ error: 'Bu işlem için admin yetkisi gereklidir.' });
}

// =====================
// Rotalar
// =====================

// Login sayfası
app.get('/login', (req, res) => {
  if (req.session && req.session.authenticated) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

// Login işlemi - GÜNCELLENDİ (Deneme kontrolü eklendi)
app.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.json({ error: 'Kullanıcı adı ve şifre gereklidir.' });
  }

  try {
    const user = await User.findOne({ username: username.toLowerCase() });

    if (!user) {
      return res.json({ error: 'Hatalı kullanıcı adı veya şifre.' });
    }

    // Hesap aktif mi kontrolü
    if (!user.isActive) {
      return res.json({ error: 'Hesabınız askıya alınmış. Lütfen admin ile iletişime geçin.' });
    }

    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      return res.json({ error: 'Hatalı kullanıcı adı veya şifre.' });
    }

    // Deneme süresi kontrolü
    if (!isTrialValid(user)) {
      return res.json({
        error: 'Deneme süreniz doldu! Premium erişim için lütfen iletişime geçin.'
      });
    }

    // Son giriş zamanını güncelle
    user.lastLogin = new Date();
    await user.save();

    // Online kullanıcı listesine ekle
    onlineUsers.set(user.username, {
      username: user.username,
      role: user.role,
      lastActive: new Date(),
      ip: req.ip || req.connection.remoteAddress
    });

    // Başarılı giriş
    req.session.authenticated = true;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.loginTime = new Date();

    console.log(`✅ ${user.username} giriş yaptı. (Kalan deneme: ${user.remainingTrialDays} gün)`);

    res.json({ success: true, redirect: '/' });
  } catch (error) {
    console.error('Giriş hatası:', error);
    res.json({ error: 'Giriş sırasında bir hata oluştu.' });
  }
});

// =====================
// PUBLIC KAYIT ENDPOINT - YENİ EKLENDİ
// =====================
app.post('/api/register', registerLimiter, async (req, res) => {
  const { email, username, password } = req.body;

  // Validation
  if (!email || !username || !password) {
    return res.status(400).json({ error: 'E-posta, kullanıcı adı ve şifre gereklidir.' });
  }

  // Email format kontrolü
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Geçerli bir e-posta adresi giriniz.' });
  }

  if (username.length < 3 || username.length > 50) {
    return res.status(400).json({ error: 'Kullanıcı adı 3-50 karakter arasında olmalıdır.' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Şifre en az 8 karakter olmalıdır.' });
  }

  try {
    // Email daha önce kullanılmış mı kontrol et
    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.status(400).json({ error: 'Bu e-posta adresi zaten kayıtlı.' });
    }

    // Kullanıcı adı daha önce alınmış mı kontrol et
    const existingUser = await User.findOne({ username: username.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'Bu kullanıcı adı zaten alınmış.' });
    }

    // Şifreyi hashle
    const hashedPassword = await bcrypt.hash(password, 10);

    // Yeni kullanıcı oluştur (Deneme ile)
    const now = new Date();
    const trialEnd = new Date(now.getTime() + TRIAL_MS);

    const newUser = await User.create({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password: hashedPassword,
      role: 'user',
      trialStartDate: now,
      trialEndDate: trialEnd,
      subscriptionStatus: 'trial',
      isActive: true
    });

    console.log(`👤 Yeni kullanıcı kaydoldu: ${newUser.username}`);
    console.log(`   E-posta: ${newUser.email}`);
    console.log(`   Deneme başlangıcı: ${now.toISOString()}`);
    console.log(`   Deneme bitişi: ${trialEnd.toISOString()}`);

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
    console.error('Kayıt hatası:', error);
    res.status(500).json({ error: 'Kayıt sırasında bir hata oluştu.' });
  }
});

// Çıkış işlemi
app.get('/logout', (req, res) => {
  if (req.session && req.session.username) {
    onlineUsers.delete(req.session.username);
    console.log(`👋 ${req.session.username} çıkış yaptı.`);
  }

  req.session.destroy((err) => {
    if (err) {
      console.error('Çıkış hatası:', err);
    }
    res.redirect('/login');
  });
});

// Dashboard rotası (Korumalı + Deneme Kontrolü)
app.get('/', checkTrialAccess, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Admin Panel rotası (Korumalı - Admin Only)
app.get('/admin', requireAuth, requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// API endpoint - Oturum bilgisi
app.get('/api/session', requireAuth, (req, res) => {
  res.json({
    authenticated: true,
    username: req.session.username,
    role: req.session.role,
    loginTime: req.session.loginTime
  });
});

// API endpoint - Kullanıcı profili (deneme bilgisi dahil)
app.get('/api/user', requireAuth, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.session.username.toLowerCase() });

    if (!user) {
      return res.json({ error: 'Kullanıcı bulunamadı.' });
    }

    res.json({
      username: user.username,
      email: user.email,
      role: user.role,
      subscriptionStatus: user.subscriptionStatus,
      trialDays: user.remainingTrialDays,
      trialEndDate: user.trialEndDate,
      isActive: user.isActive,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    });
  } catch (error) {
    console.error('Kullanıcı bilgisi getirme hatası:', error);
    res.json({ error: 'Kullanıcı bilgileri getirilirken bir hata oluştu.' });
  }
});

// API endpoint - Online kullanıcılar listesi (Admin)
app.get('/api/online-users', requireAuth, requireAdmin, (req, res) => {
  const users = [];
  for (const [userId, userData] of onlineUsers.entries()) {
    users.push({
      username: userData.username,
      role: userData.role,
      lastActive: userData.lastActive,
      ip: userData.ip
    });
  }
  res.json({
    count: users.length,
    users: users
  });
});

// API endpoint - Şifre değiştirme
app.post('/api/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.json({ error: 'Tüm alanlar gereklidir.' });
  }

  if (newPassword.length < 8) {
    return res.json({ error: 'Yeni şifre en az 8 karakter olmalıdır.' });
  }

  try {
    const user = await User.findOne({ username: req.session.username.toLowerCase() });

    if (!user) {
      return res.json({ error: 'Kullanıcı bulunamadı.' });
    }

    const isValid = await bcrypt.compare(currentPassword, user.password);

    if (!isValid) {
      return res.json({ error: 'Mevcut şifre yanlış.' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    console.log(`🔑 ${user.username} şifresini değiştirdi.`);

    res.json({ success: true, message: 'Şifre başarıyla değiştirildi.' });
  } catch (error) {
    console.error('Şifre değiştirme hatası:', error);
    res.json({ error: 'Şifre değiştirme sırasında bir hata oluştu.' });
  }
});

// =====================
// Kullanıcı Yönetimi API'leri (Admin Only)
// =====================

// GET /api/users - Tüm kullanıcıları listele (Admin)
app.get('/api/users', requireAdmin, async (req, res) => {
  try {
    console.log('Admin kullanıcı listesi istedi:', req.session.username, 'Rol:', req.session.role);
    const users = await User.find({}, '-password');
    console.log('Kullanıcı sayısı:', users.length);
    res.json(users);
  } catch (error) {
    console.error('Kullanıcı listeleme hatası:', error);
    res.status(500).json({ error: 'Kullanıcılar listelenirken bir hata oluştu.' });
  }
});

// POST /api/register (Admin - eski endpoint)
app.post('/api/admin/register', requireAdmin, async (req, res) => {
  const { username, email, password, role } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Kullanıcı adı, e-posta ve şifre gereklidir.' });
  }

  if (username.length < 3 || username.length > 50) {
    return res.status(400).json({ error: 'Kullanıcı adı 3-50 karakter arasında olmalıdır.' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Şifre en az 8 karakter olmalıdır.' });
  }

  const validRoles = ['admin', 'user'];
  const userRole = role && validRoles.includes(role) ? role : 'user';

  try {
    const existingUser = await User.findOne({ username: username.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'Bu kullanıcı adı zaten mevcut.' });
    }

    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.status(400).json({ error: 'Bu e-posta adresi zaten mevcut.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Admin tarafından oluşturulan kullanıcılar için deneme süresi ayarla
    const now = new Date();
    const trialEnd = new Date(now.getTime() + TRIAL_MS);

    const newUser = await User.create({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password: hashedPassword,
      role: userRole,
      trialStartDate: now,
      trialEndDate: trialEnd,
      subscriptionStatus: userRole === 'admin' ? 'active' : 'trial',
      isActive: true
    });

    console.log(`👤 Admin tarafından yeni kullanıcı oluşturuldu: ${newUser.username} (${newUser.role})`);

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
    console.error('Kullanıcı oluşturma hatası:', error);
    res.status(500).json({ error: 'Kullanıcı oluşturulurken bir hata oluştu.' });
  }
});

// DELETE /api/users/:username - Kullanıcı sil (Admin)
app.delete('/api/users/:username', requireAdmin, async (req, res) => {
  const { username } = req.params;

  if (username.toLowerCase() === 'admin') {
    return res.status(400).json({ error: 'Admin kullanıcısı silinemez.' });
  }

  try {
    const deletedUser = await User.findOneAndDelete({ username: username.toLowerCase() });

    if (!deletedUser) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

    // Online kullanıcı listesinden de sil
    onlineUsers.delete(deletedUser.username);

    console.log(`🗑️ Admin tarafından kullanıcı silindi: ${deletedUser.username}`);

    res.json({
      success: true,
      message: `Kullanıcı '${deletedUser.username}' başarıyla silindi.`
    });
  } catch (error) {
    console.error('Kullanıcı silme hatası:', error);
    res.status(500).json({ error: 'Kullanıcı silinirken bir hata oluştu.' });
  }
});

// PUT /api/users/:username/role - Kullanıcı rolünü güncelle (Admin)
app.put('/api/users/:username/role', requireAdmin, async (req, res) => {
  const { username } = req.params;
  const { role } = req.body;

  const validRoles = ['admin', 'user'];
  if (!role || !validRoles.includes(role)) {
    return res.status(400).json({ error: 'Geçersiz rol. Kabul edilen değerler: admin, user' });
  }

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

    console.log(`🔄 ${updatedUser.username} rolü '${role}' olarak güncellendi.`);

    res.json({
      success: true,
      message: 'Kullanıcı rolü başarıyla güncellendi.',
      user: {
        username: updatedUser.username,
        role: updatedUser.role
      }
    });
  } catch (error) {
    console.error('Rol güncelleme hatası:', error);
    res.status(500).json({ error: 'Rol genncellenirken bir hata oluştu.' });
  }
});

// PUT /api/users/:username/status - Kullanıcı durumunu güncelle (Admin) - YENİ
app.put('/api/users/:username/status', requireAdmin, async (req, res) => {
  const { username } = req.params;
  const { isActive, subscriptionStatus } = req.body;

  if (username.toLowerCase() === 'admin') {
    return res.status(400).json({ error: 'Admin kullanıcısının durumu değiştirilemez.' });
  }

  try {
    const updateData = {};
    if (typeof isActive === 'boolean') updateData.isActive = isActive;
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

    console.log(`🔄 ${updatedUser.username} durumu güncellendi: isActive=${updatedUser.isActive}, status=${updatedUser.subscriptionStatus}`);

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
    console.error('Durum güncelleme hatası:', error);
    res.status(500).json({ error: 'Durum güncellenirken bir hata oluştu.' });
  }
});

// PUT /api/users/:username/extend-trial - Deneme süresini uzat (Admin) - YENİ
app.put('/api/users/:username/extend-trial', requireAdmin, async (req, res) => {
  const { username } = req.params;
  const { days } = req.body;

  const extendDays = parseInt(days) || 3;
  const maxDays = 30; // Max 30 gün uzatma

  if (extendDays > maxDays) {
    return res.status(400).json({ error: `Deneme süresi en fazla ${maxDays} gün uzatılabilir.` });
  }

  try {
    const user = await User.findOne({ username: username.toLowerCase() });

    if (!user) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

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

    console.log(`🔄 ${user.username} deneme süresi ${extendDays} gün uzatıldı. Yeni bitiş: ${newTrialEnd.toISOString()}`);

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
    console.error('Deneme uzatma hatası:', error);
    res.status(500).json({ error: 'Deneme süresi uzatılırken bir hata oluştu.' });
  }
});

// GET /api/online-users - Online kullanıcıları listele (Admin)
app.get('/api/online-users', requireAdmin, (req, res) => {
  console.log('Online kullanıcılar istendi - Admin:', req.session.username);
  const now = new Date();
  const users = Array.from(onlineUsers.values()).map(user => {
    const timeDiff = now - user.lastActive;
    const minutesAgo = Math.floor(timeDiff / 60000);
    return {
      username: user.username,
      role: user.role,
      lastActive: user.lastActive,
      minutesAgo: minutesAgo,
      ip: user.ip,
      status: minutesAgo < 15 ? 'online' : 'idle'
    };
  });

  res.json({
    count: users.length,
    users: users.sort((a, b) => a.minutesAgo - b.minutesAgo)
  });
});

// Statik dosyalar
app.use(express.static(path.join(__dirname, 'public')));

// JS dosyaları için statik servisi
app.use('/js', express.static(path.join(__dirname, 'public', 'js'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
  }
}));

app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));

// =====================
// Binance API Proxy
// =====================
app.get('/api/binance/liquidations', checkTrialAccess, async (req, res) => {
  try {
    const { symbol, startTime, limit } = req.query;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol parameter required' });
    }

    let url = `https://fapi.binance.com/fapi/v1/forceOrders?symbol=${symbol}&limit=${limit || 100}`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'TradePulse/1.0'
      }
    });

    if (!response.ok) {
      console.log(`Binance API response code: ${response.status}`);
      return res.json([]);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Liquidations proxy error:', error.message);
    res.json([]);
  }
});

app.get('/api/binance/*', checkTrialAccess, async (req, res) => {
  try {
    const endpoint = req.params[0];
    const queryString = new URLSearchParams(req.query).toString();
    const url = `https://fapi.binance.com/fapi/v1/${endpoint}${queryString ? '?' + queryString : ''}`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'TradePulse/1.0'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Binance API hatası' });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Binance proxy hatası:', error.message);
    res.status(500).json({ error: 'Proxy hatası' });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'views', '404.html'));
});

// Hata handler
app.use((err, req, res, next) => {
  console.error('Sunucu hatası:', err);
  res.status(500).send('Bir hata oluştu. Lütfen tekrar deneyin.');
});

// =====================
// Sunucu Başlatma
// =====================
async function startServer() {
  await connectDatabase();
  await initDefaultUser();

  app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🔒 Secure Binance Dashboard                              ║
║                                                            ║
║   🌐 Sunucu çalışıyor: http://localhost:${PORT}               ║
║   🔐 Giriş sayfası:  http://localhost:${PORT}/login           ║
║   📊 Deneme süresi:  ${TRIAL_DAYS} gün                                ║
║   📊 MongoDB:       ${MONGODB_URI.split('@')[1] || MONGODB_URI}  ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
    `);
  });
}

startServer().catch(error => {
  console.error('Sunucu başlatma hatası:', error);
  process.exit(1);
});
