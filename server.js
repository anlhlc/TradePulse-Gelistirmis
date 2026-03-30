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
// MongoDB Bağlantısı
// =====================
async function connectDatabase() {
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 50,  // 10'dan 50'ye artırıldı - daha fazla eşzamanlı kullanıcı desteği
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
// User Model
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
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['admin', 'user'],
    default: 'user'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date,
    default: null
  }
});

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
  const timeout = 15 * 60 * 1000; // 15 dakika
  
  for (const [userId, userData] of onlineUsers.entries()) {
    const timeDiff = now - userData.lastActive;
    if (timeDiff > timeout) {
      console.log(`🟢 ${userId} oturumu zaman aşımı nedeniyle sonlandırıldı.`);
      onlineUsers.delete(userId);
    }
  }
}, 60 * 1000); // Her dakika

// =====================
// Yardımcı Fonksiyonlar
// =====================

// Varsayılan admin kullanıcısını oluştur veya güncelle
async function initDefaultUser() {
  const adminPassword = process.env.ADMIN_PASSWORD || 'BinanceSecure2024!';
  
  try {
    const existingUser = await User.findOne({ username: 'admin' });
    
    if (existingUser) {
      // Mevcut admin kullanıcısının şifresini güncelle
      const hash = await bcrypt.hash(adminPassword, 10);
      existingUser.password = hash;
      existingUser.role = 'admin';
      await existingUser.save();
      console.log('🔐 Mevcut admin kullanıcısı güncellendi.');
    } else {
      // Yeni admin kullanıcısı oluştur
      const hash = await bcrypt.hash(adminPassword, 10);
      await User.create({
        username: 'admin',
        password: hash,
        role: 'admin'
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
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 5, // Maksimum 5 deneme
  message: { error: 'Çok fazla giriş denemesi. Lütfen 15 dakika bekleyin.' }
});

// Track activity middleware'ini tüm rotalara uygula
app.use(trackActivity);

// Auth middleware
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

// Login işlemi
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

    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      return res.json({ error: 'Hatalı kullanıcı adı veya şifre.' });
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

    console.log(`✅ ${user.username} giriş yaptı.`);

    res.json({ success: true, redirect: '/' });
  } catch (error) {
    console.error('Giriş hatası:', error);
    res.json({ error: 'Giriş sırasında bir hata oluştu.' });
  }
});

// Çıkış işlemi
app.get('/logout', (req, res) => {
  // Online kullanıcı listesinden sil
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

// Dashboard rotası (Korumalı)
app.get('/', requireAuth, (req, res) => {
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

// API endpoint - Şifre değiştirme
app.post('/api/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.json({ error: 'Tüm alanlar gereklidir.' });
  }

  if (newPassword.length < 6) {
    return res.json({ error: 'Yeni şifre en az 6 karakter olmalıdır.' });
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

    // Yeni şifreyi hashle ve kaydet
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    console.log(`🔑 ${user.username} şifresini değiştirdi.`);

    res.json({ success: true, message: 'Şifre başarıyla değiştirildi.' });
  } catch (error) {
    console.error('Şifre değiştirme hatası:', error);
    res.json({ error: 'Şifre değiştirme sırasında bir hata oluştu.' });
  }
});

// API endpoint - Kullanıcı bilgilerini getir (profil sayfası için)
app.get('/api/user', requireAuth, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.session.username.toLowerCase() });
    
    if (!user) {
      return res.json({ error: 'Kullanıcı bulunamadı.' });
    }

    res.json({
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    });
  } catch (error) {
    console.error('Kullanıcı bilgisi getirme hatası:', error);
    res.json({ error: 'Kullanıcı bilgileri getirilirken bir hata oluştu.' });
  }
});

// =====================
// Kullanıcı Yönetimi API'leri (Admin Only)
// =====================

// GET /api/users - Tüm kullanıcıları listele (Admin)
app.get('/api/users', requireAdmin, async (req, res) => {
  try {
    console.log('Admin kullanıcı listesi istedi:', req.session.username, 'Rol:', req.session.role);
    const users = await User.find({}, '-password'); // Şifre hariç tüm alanlar
    console.log('Kullanıcı sayısı:', users.length);
    res.json(users);
  } catch (error) {
    console.error('Kullanıcı listeleme hatası:', error);
    res.status(500).json({ error: 'Kullanıcılar listelenirken bir hata oluştu.' });
  }
});

// POST /api/register - Yeni kullanıcı oluştur (Admin)
app.post('/api/register', requireAdmin, async (req, res) => {
  const { username, password, role } = req.body;

  // Validasyon
  if (!username || !password) {
    return res.status(400).json({ error: 'Kullanıcı adı ve şifre gereklidir.' });
  }

  if (username.length < 3 || username.length > 50) {
    return res.status(400).json({ error: 'Kullanıcı adı 3-50 karakter arasında olmalıdır.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Şifre en az 6 karakter olmalıdır.' });
  }

  const validRoles = ['admin', 'user'];
  const userRole = role && validRoles.includes(role) ? role : 'user';

  try {
    // Kullanıcı adı daha önce alınmış mı kontrol et
    const existingUser = await User.findOne({ username: username.toLowerCase() });
    
    if (existingUser) {
      return res.status(400).json({ error: 'Bu kullanıcı adı zaten mevcut.' });
    }

    // Şifreyi hashle ve kullanıcıyı oluştur
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const newUser = await User.create({
      username: username.toLowerCase(),
      password: hashedPassword,
      role: userRole
    });

    console.log(`👤 Admin tarafından yeni kullanıcı oluşturuldu: ${newUser.username} (${newUser.role})`);

    res.status(201).json({
      success: true,
      message: 'Kullanıcı başarıyla oluşturuldu.',
      user: {
        id: newUser._id,
        username: newUser.username,
        role: newUser.role,
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

  // Admin kendini silemesin
  if (username.toLowerCase() === 'admin') {
    return res.status(400).json({ error: 'Admin kullanıcısı silinemez.' });
  }

  try {
    const deletedUser = await User.findOneAndDelete({ username: username.toLowerCase() });
    
    if (!deletedUser) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

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

  // Admin rolünü değiştirilemez
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
    res.status(500).json({ error: 'Rol güncellenirken bir hata oluştu.' });
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

// Statik dosyalar - ÖNEMLI: Rotalardan ÖNCE tanımlanmalı
// Public klasörünü doğru şekilde sun
app.use(express.static(path.join(__dirname, 'public')));

// JS dosyaları için statik servisi (doğru MIME type ile)
app.use('/js', express.static(path.join(__dirname, 'public', 'js'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
  }
}));

// Assets klasörü
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));

// =====================
// Binance API Proxy (CORS sorunu için)
// =====================
// ÖNEMLİ: Bu rotalar /api/users ve /api/online-users gibi SPESİFİK rotalardan SONRA tanımlanmalı
// Express'te wildcard rotaların altında olması gerekiyor

// Likidasyonlar endpoint proxy - Güncel Binance API endpoint
app.get('/api/binance/liquidations', requireAuth, async (req, res) => {
  try {
    const { symbol, startTime, limit } = req.query;
    
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol parameter required' });
    }
    
    // Yeni Binance API endpoint - single symbol liquidations
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

// Genel Binance API proxy (diğer endpoint'ler için) - EN SONDA
app.get('/api/binance/*', requireAuth, async (req, res) => {
  try {
    const endpoint = req.params[0]; // * ile yakalanan kısım
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
