const { validationResult } = require('express-validator');
const logger = require('../utils/logger');

/**
 * Validation error handler middleware
 * Processes express-validator results
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn(`Validation error: ${JSON.stringify(errors.array())}`);
    return res.status(400).json({
      error: 'Doğrulama hatası',
      details: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
}

/**
 * Error handler middleware
 * Centralized error handling
 */
function errorHandler(err, req, res, next) {
  logger.error('Sunucu hatası:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip
  });

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => ({
      field: e.path,
      message: e.message
    }));
    return res.status(400).json({
      error: 'Doğrulama hatası',
      details: errors
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({
      error: `${field} zaten kullanılmaktadır.`
    });
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      error: 'Geçersiz ID formatı'
    });
  }

  // Default error response
  const statusCode = err.statusCode || 500;
  const message = err.statusCode ? err.message : 'Bir hata oluştu. Lütfen tekrar deneyin.';

  res.status(statusCode).json({ error: message });
}

/**
 * 404 Not Found handler
 */
function notFoundHandler(req, res) {
  res.status(404).sendFile(require('path').join(__dirname, '../../views/404.html'));
}

/**
 * Async handler wrapper
 * Catches async errors and passes to error handler
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Not found route error
 */
class NotFoundError extends Error {
  constructor(message = 'Kaynak bulunamadı') {
    super(message);
    this.statusCode = 404;
    this.name = 'NotFoundError';
  }
}

/**
 * Validation error
 */
class ValidationError extends Error {
  constructor(message = 'Doğrulama hatası', details = []) {
    super(message);
    this.statusCode = 400;
    this.name = 'ValidationError';
    this.details = details;
  }
}

/**
 * Authentication error
 */
class AuthError extends Error {
  constructor(message = 'Kimlik doğrulama başarısız') {
    super(message);
    this.statusCode = 401;
    this.name = 'AuthError';
  }
}

/**
 * Authorization error
 */
class ForbiddenError extends Error {
  constructor(message = 'Erişim yetkiniz yok') {
    super(message);
    this.statusCode = 403;
    this.name = 'ForbiddenError';
  }
}

module.exports = {
  handleValidationErrors,
  errorHandler,
  notFoundHandler,
  asyncHandler,
  NotFoundError,
  ValidationError,
  AuthError,
  ForbiddenError
};
