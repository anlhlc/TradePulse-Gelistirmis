// =====================
// Constants Configuration
// =====================

const TRIAL_DAYS = 3; // Trial period in days
const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000; // Trial period in milliseconds

// =====================
// Session Configuration
// =====================

const SESSION_CONFIG = {
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
};

// =====================
// MongoDB Configuration
// =====================

const MONGODB_CONFIG = {
  uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/tradepulse',
  options: {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 50,
    maxIdleTimeMS: 30000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000
  }
};

// =====================
// Security Configuration
// =====================

const SECURITY_CONFIG = {
  bcryptRounds: 10,
  rateLimit: {
    login: { windowMs: 15 * 60 * 1000, max: 5 },
    register: { windowMs: 60 * 60 * 1000, max: 5 },
    api: { windowMs: 60 * 1000, max: 100 },
    passwordChange: { windowMs: 15 * 60 * 1000, max: 3 }
  },
  session: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    onlineUserTimeout: 15 * 60 * 1000 // 15 minutes
  }
};

// =====================
// Server Configuration
// =====================

const SERVER_CONFIG = {
  port: process.env.PORT || 3000,
  env: process.env.NODE_ENV || 'development'
};

// =====================
// Default Admin Configuration
// =====================

const ADMIN_CONFIG = {
  defaultUsername: 'admin',
  defaultPassword: process.env.ADMIN_PASSWORD || 'BinanceSecure2024!',
  defaultEmail: 'admin@tradepulse.local'
};

module.exports = {
  // Trial
  TRIAL_DAYS,
  TRIAL_MS,

  // Session
  SESSION_CONFIG,

  // MongoDB
  MONGODB_CONFIG,

  // Security
  SECURITY_CONFIG,

  // Server
  SERVER_CONFIG,

  // Admin
  ADMIN_CONFIG
};
