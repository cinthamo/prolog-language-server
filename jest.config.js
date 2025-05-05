// jest.config.js
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'], // Look for tests inside src
  testMatch: ['**/__tests__/**/*.test.ts'], // Pattern for test files
  // Automatically clear mock calls and instances between every test
  clearMocks: true,
   // Optional: Setup files, coverage reporting etc.
   // setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts'],
   // collectCoverage: true,
   // coverageDirectory: "coverage",
   // coverageProvider: "v8",
};
