const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

// User Schema Definition
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Kullanıcı adı gereklidir'],
    unique: true,
    trim: true,
    lowercase: true,
    minlength: [3, 'Kullanıcı adı en az 3 karakter olmalıdır'],
    maxlength: [50, 'Kullanıcı adı en fazla 50 karakter olabilir']
  },
  email: {
    type: String,
    required: [true, 'E-posta gereklidir'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Geçerli bir e-posta adresi giriniz']
  },
  password: {
    type: String,
    required: [true, 'Şifre gereklidir'],
    minlength: [8, 'Şifre en az 8 karakter olmalıdır'],
    select: false // Don't include password in queries by default
  },
  role: {
    type: String,
    enum: {
      values: ['admin', 'user'],
      message: 'Geçersiz rol. Kabul edilen değerler: admin, user'
    },
    default: 'user'
  },
  // Trial system fields
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
    enum: {
      values: ['trial', 'active', 'expired', 'banned'],
      message: 'Geçersiz abonelik durumu'
    },
    default: 'trial'
  },
  // Account status
  isActive: {
    type: Boolean,
    default: true
  },
  // Date information
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date,
    default: null
  }
});

// =====================
// Virtual Fields
// =====================

// Virtual field: Is trial expired?
userSchema.virtual('isTrialExpired').get(function() {
  if (!this.trialStartDate || !this.trialEndDate) return false;
  return new Date() > this.trialEndDate;
});

// Virtual field: Remaining trial days
userSchema.virtual('remainingTrialDays').get(function() {
  if (!this.trialStartDate || !this.trialEndDate) return 0;
  const remaining = this.trialEndDate - new Date();
  return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
});

// Virtual field: Trial status
userSchema.virtual('trialStatus').get(function() {
  if (this.subscriptionStatus !== 'trial') return this.subscriptionStatus;
  if (this.isTrialExpired) return 'expired';
  return 'active';
});

// =====================
// Instance Methods
// =====================

// Hash password before saving
userSchema.pre('save', async function(next) {
  // Only hash if password is modified or new
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Check if trial is valid
userSchema.methods.isTrialValid = function() {
  if (this.role === 'admin') return true;
  if (this.subscriptionStatus === 'active') return true;
  if (this.subscriptionStatus === 'trial' && this.trialEndDate) {
    return new Date() <= this.trialEndDate;
  }
  return false;
};

// Get public profile (without sensitive data)
userSchema.methods.getPublicProfile = function() {
  return {
    id: this._id,
    username: this.username,
    email: this.email,
    role: this.role,
    subscriptionStatus: this.subscriptionStatus,
    trialDays: this.remainingTrialDays,
    trialEndDate: this.trialEndDate,
    isActive: this.isActive,
    createdAt: this.createdAt,
    lastLogin: this.lastLogin
  };
};

// =====================
// Static Methods
// =====================

// Find user by credentials
userSchema.statics.findByCredentials = async function(username, password) {
  const user = await this.findOne({ username: username.toLowerCase() }).select('+password');
  if (!user) return null;

  const isMatch = await user.comparePassword(password);
  if (!isMatch) return null;

  return user;
};

// =====================
// Middleware
// =====================

// Include virtual fields in JSON
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

// Index for better query performance
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
userSchema.index({ subscriptionStatus: 1 });

// =====================
// Model Export
// =====================

const User = mongoose.model('User', userSchema);

module.exports = User;
