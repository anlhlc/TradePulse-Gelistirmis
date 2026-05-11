/**
 * TradePulse Server - Main Entry Point
 * Refactored modular architecture
 */

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const mongoose = require('mongoose');
const path = require('path');

// Import configurations
const {
  TRIAL_DAYS,
  SESSION_CONFIG,
  MONGODB_CONFIG,
  SERVER_CONFIG,
  ADMIN_CONFIG
} = require('./config/constants');

// Import utilities and middleware
const logger = require('./utils/logger');
const { trackActivity } = require('./middleware/auth');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const binanceRoutes = require('./routes/binance');
const indexRoutes = require('./routes/index');

// Create Express app
const app = express();

// =====================
// Security Middleware
// =====================
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// =====================
// Body Parsing
// =====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =====================
// Session Configuration
// =====================

// Validate session secret
if (!SESSION_CONFIG.secret) {
  logger.error('SESSION_SECRET environment variable is required');
  process.exit(1);
}

app.set('trust proxy', 1);
app.use(session({
  secret: SESSION_CONFIG.secret,
  resave: SESSION_CONFIG.resave,
  saveUninitialized: SESSION_CONFIG.saveUninitialized,
  cookie: SESSION_CONFIG.cookie
}));

// =====================
// Activity Tracking
// =====================
app.use(trackActivity);

// =====================
// Static Files
// =====================
app.use(express.static(path.join(__dirname, 'public')));

// JS files with security headers
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
// Routes
// =====================
app.use(authRoutes);
app.use(userRoutes);
app.use(binanceRoutes);
app.use(indexRoutes);

// =====================
// Error Handling
// =====================
app.use(notFoundHandler);
app.use(errorHandler);

// =====================
// Database Connection
// =====================
async function connectDatabase() {
  try {
    await mongoose.connect(MONGODB_CONFIG.uri, MONGODB_CONFIG.options);
    logger.info('MongoDB veritabanına başarıyla bağlanıldı');
    logger.info(`Veritabanı: ${MONGODB_CONFIG.uri}`);
    logger.info(`Bağlantı havuzu: ${MONGODB_CONFIG.options.maxPoolSize}`);
  } catch (error) {
    logger.error('MongoDB bağlantı hatası:', error.message);
    logger.error('Lütfen .env dosyasındaki MONGODB_URI değerini kontrol edin');
    process.exit(1);
  }
}

// =====================
// Initialize Default Admin User
// =====================
async function initDefaultUser() {
  const User = require('./models/User');

  try {
    const existingUser = await User.findOne({ username: ADMIN_CONFIG.defaultUsername });

    if (existingUser) {
      // Update password if user exists
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash(ADMIN_CONFIG.defaultPassword, 10);
      existingUser.password = hash;
      existingUser.role = 'admin';
      existingUser.email = ADMIN_CONFIG.defaultEmail;
      existingUser.subscriptionStatus = 'active';
      existingUser.isActive = true;
      await existingUser.save();
      logger.info('Mevcut admin kullanıcısı güncellendi');
    } else {
      // Create new admin user
      await User.create({
        username: ADMIN_CONFIG.defaultUsername,
        email: ADMIN_CONFIG.defaultEmail,
        password: ADMIN_CONFIG.defaultPassword,
        role: 'admin',
        subscriptionStatus: 'active',
        isActive: true
      });
      logger.info('Yeni admin kullanıcısı oluşturuldu');
    }

    logger.info(`Kullanıcı adı: ${ADMIN_CONFIG.defaultUsername}`);
    logger.info(`Şifre: ${ADMIN_CONFIG.defaultPassword}`);
    logger.warn('İlk girişten sonra .env dosyasından şifreyi değiştirin!');
  } catch (error) {
    logger.error('Varsayılan kullanıcı oluşturma hatası:', error.message);
  }
}

// =====================
// Start Server
// =====================
async function startServer() {
  await connectDatabase();
  await initDefaultUser();

  app.listen(SERVER_CONFIG.port, () => {
    logger.info(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   TradePulse - Secure Binance Dashboard v2.0                ║
║                                                            ║
║   🌐 Sunucu çalışıyor: http://localhost:${SERVER_CONFIG.port}               ║
║   🔐 Giriş sayfası:  http://localhost:${SERVER_CONFIG.port}/login           ║
║   📊 Deneme süresi:  ${TRIAL_DAYS} gün                                ║
║   📊 MongoDB:       ${MONGODB_CONFIG.uri.split('@')[1] || MONGODB_CONFIG.uri}  ║
║   📦 Mimari:        Modüler (Routes/Controllers/Middleware) ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
    `);
  });
}

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection:', err);
  process.exit(1);
});

// Start the server
startServer().catch(error => {
  logger.error('Sunucu başlatma hatası:', error);
  process.exit(1);
});

// Export for testing
module.exports = app;
