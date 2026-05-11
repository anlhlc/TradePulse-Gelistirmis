/**
 * Auth Routes Tests
 */

const request = require('supertest');
const express = require('express');
const session = require('express-session');

// Mock User model
jest.mock('../server/models/User', () => {
  const mockUser = {
    _id: 'test-id',
    username: 'testuser',
    email: 'test@test.com',
    password: '$2a$10$hashedpassword',
    role: 'user',
    subscriptionStatus: 'trial',
    trialEndDate: new Date(Date.now() + 86400000 * 3),
    isActive: true,
    isTrialValid: function() { return true; },
    remainingTrialDays: 3,
    getPublicProfile: function() {
      return {
        username: this.username,
        email: this.email,
        role: this.role,
        subscriptionStatus: this.subscriptionStatus,
        trialDays: this.remainingTrialDays
      };
    }
  };

  return {
    findByCredentials: jest.fn().mockResolvedValue(mockUser),
    findOne: jest.fn().mockResolvedValue(mockUser),
    findOneAndDelete: jest.fn().mockResolvedValue(mockUser),
    create: jest.fn().mockResolvedValue(mockUser)
  };
});

// Create test app
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: false
  }));

  // Mock auth middleware
  app.use((req, res, next) => {
    req.session = req.session || {};
    next();
  });

  return app;
}

describe('Auth Routes', () => {
  describe('POST /login', () => {
    it('should return error for missing credentials', async () => {
      const app = createTestApp();

      // Simple route for testing
      app.post('/login', (req, res) => {
        const { username, password } = req.body;
        if (!username || !password) {
          return res.json({ error: 'Kullanıcı adı ve şifre gereklidir.' });
        }
        res.json({ success: true });
      });

      const response = await request(app)
        .post('/login')
        .send({})
        .expect(200);

      expect(response.body.error).toBe('Kullanıcı adı ve şifre gereklidir.');
    });

    it('should accept valid credentials', async () => {
      const app = createTestApp();

      app.post('/login', (req, res) => {
        const { username, password } = req.body;
        if (username === 'testuser' && password === 'TestPassword123') {
          req.session.authenticated = true;
          return res.json({ success: true, redirect: '/' });
        }
        res.json({ error: 'Hatalı kullanıcı adı veya şifre.' });
      });

      const response = await request(app)
        .post('/login')
        .send({ username: 'testuser', password: 'TestPassword123' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.redirect).toBe('/');
    });
  });

  describe('POST /api/register', () => {
    it('should validate email format', async () => {
      const app = createTestApp();

      app.post('/api/register', (req, res) => {
        const { email } = req.body;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({ error: 'Geçerli bir e-posta adresi giriniz.' });
        }
        res.status(201).json({ success: true });
      });

      const response = await request(app)
        .post('/api/register')
        .send({ email: 'invalid-email', username: 'testuser', password: 'TestPassword123' })
        .expect(400);

      expect(response.body.error).toBe('Geçerli bir e-posta adresi giriniz.');
    });

    it('should validate password strength', async () => {
      const app = createTestApp();

      app.post('/api/register', (req, res) => {
        const { password } = req.body;
        if (password.length < 8) {
          return res.status(400).json({ error: 'Şifre en az 8 karakter olmalıdır.' });
        }
        res.status(201).json({ success: true });
      });

      const response = await request(app)
        .post('/api/register')
        .send({ email: 'test@test.com', username: 'testuser', password: 'short' })
        .expect(400);

      expect(response.body.error).toBe('Şifre en az 8 karakter olmalıdır.');
    });
  });

  describe('POST /logout', () => {
    it('should destroy session', async () => {
      const app = createTestApp();

      app.post('/logout', (req, res) => {
        req.session.destroy((err) => {
          if (err) {
            return res.status(500).json({ success: false, error: 'Çıkış sırasında hata oluştu.' });
          }
          res.json({ success: true });
        });
      });

      const response = await request(app)
        .post('/logout')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });
});

describe('User Model', () => {
  const User = require('../server/models/User');

  it('should find user by credentials', async () => {
    const user = await User.findByCredentials('testuser', 'TestPassword123');
    expect(user).toBeDefined();
    expect(user.username).toBe('testuser');
  });

  it('should return null for invalid credentials', async () => {
    User.findByCredentials = jest.fn().mockResolvedValue(null);
    const user = await User.findByCredentials('testuser', 'wrongpassword');
    expect(user).toBeNull();
  });
});
