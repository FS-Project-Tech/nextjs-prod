/**
 * unimported Configuration
 * 
 * Scans for unused files, dependencies, and exports
 */

module.exports = {
  rootDir: '.',
  scan: [
    'app/**/*.{js,jsx,ts,tsx}',
    'components/**/*.{js,jsx,ts,tsx}',
    'lib/**/*.{js,jsx,ts,tsx}',
    'hooks/**/*.{js,jsx,ts,tsx}',
    'hoc/**/*.{js,jsx,ts,tsx}',
    'middleware.ts',
    'middleware-api.ts',
  ],
  ignore: [
    // Ignore these patterns
    '**/*.d.ts',
    '**/*.config.{js,ts,mjs}',
    '**/node_modules/**',
    '**/.next/**',
    '**/out/**',
    '**/dist/**',
    '**/build/**',
    '**/*.test.{js,ts,tsx}',
    '**/*.spec.{js,ts,tsx}',
    '**/__tests__/**',
    '**/tests/**',
    '**/test-results/**',
    '**/playwright-report/**',
    // Next.js specific
    '**/layout.tsx',
    '**/page.tsx',
    '**/loading.tsx',
    '**/error.tsx',
    '**/not-found.tsx',
    '**/template.tsx',
    '**/default.tsx',
    // API routes (auto-imported by Next.js)
    '**/api/**/route.ts',
    '**/api/**/route.js',
    // Public files
    '**/public/**',
    // Docs
    '**/docs/**',
    '**/*.md',
  ],
  ignoreDependencies: [
    // These are used but might not be detected
    'next',
    'react',
    'react-dom',
    '@types/node',
    '@types/react',
    '@types/react-dom',
    'typescript',
    'eslint',
    'prettier',
    // Next.js plugins
    '@next/bundle-analyzer',
    '@tailwindcss/postcss',
    // Build tools
    'rimraf',
    'autoprefixer',
    'postcss-preset-env',
    'postcss-lab-function',
    'babel-plugin-react-compiler',
  ],
};

