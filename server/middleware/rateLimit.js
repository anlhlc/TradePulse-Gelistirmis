const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

/**
 * Rate limiter for login attempts
 * Prevents brute-force attacks
 * - Window: 15 minutes
 * - Max attempts: 5 per IP
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per window
  message: { error: 'Çok fazla giriş denemesi. Lütfen 15 dakika bekleyin.' },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res, next, options) => {
    logger.warn(`Brute-force attempt blocked from IP: ${req.ip}`);
    res.status(options.statusCode).json(options.message);
  },
  skip: (req) => {
    // Skip rate limiting in test environment
    return process.env.NODE_ENV === 'test';
  }
});

/**
 * Rate limiter for registration
 * Prevents spam registrations
 * - Window: 1 hour
 * - Max attempts: 5 per IP
 */
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 registrations per window
  message: { error: 'Çok fazla kayıt denemesi. Lütfen daha sonra tekrar deneyin.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logger.warn(`Registration spam attempt blocked from IP: ${req.ip}`);
    res.status(options.statusCode).json(options.message);
  },
  skip: (req) => {
    return process.env.NODE_ENV === 'test';
  }
});

/**
 * Rate limiter for general API calls
 * Prevents API abuse
 * - Window: 1 minute
 * - Max requests: 100 per IP
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 100 requests per minute
  message: { error: 'Çok fazla istek. Lütfen daha sonra tekrar deneyin.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return process.env.NODE_ENV === 'test';
  }
});

/**
 * Rate limiter for password change
 * Prevents password change spam
 * - Window: 15 minutes
 * - Max attempts: 3 per user
 */
const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // Limit each user to 3 password change attempts per window
  message: { error: 'Çok fazla şifre değiştirme denemesi. Lütfen 15 dakika bekleyin.' },
  keyGenerator: (req) => {
    // Use username as key instead of IP for user-specific limiting
    return req.session?.username || req.ip;
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return process.env.NODE_ENV === 'test';
  }
});

module.exports = {
  loginLimiter,
  registerLimiter,
  apiLimiter,
  passwordChangeLimiter
};
