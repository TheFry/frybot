/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/chat_bot/**',
    '!src/helpers/discord.ts',
    '!src/helpers/google.ts',
    '!src/helpers/stream-examples.ts',
    '!src/**/main.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
  },
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/test/unit/**/*.test.ts'],
      globalSetup: '<rootDir>/test/setup/unit.ts',
    },
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/test/integration/**/*.test.ts'],
      globalSetup: '<rootDir>/test/setup/integration.ts',
    },
    {
      displayName: 'e2e',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/test/e2e/**/*.test.ts'],
      globalSetup: '<rootDir>/test/setup/e2e.ts',
    },
  ],
};
