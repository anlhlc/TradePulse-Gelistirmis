module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'server/**/*.js',
    '!server/server.js',
    '!server/config/**/*.js'
  ],
  testMatch: [
    '**/tests/**/*.test.js',
    '**/server/**/*.test.js'
  ],
  verbose: true,
  testTimeout: 10000,
  setupFilesAfterEnv: ['./tests/setup.js']
};
