// Jest test setup
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-testing-only';
process.env.LOG_LEVEL = 'error';

// Increase timeout for async tests
jest.setTimeout(10000);

// Global teardown
afterAll(async () => {
  // Cleanup after all tests
  await new Promise(resolve => setTimeout(resolve, 500));
});
