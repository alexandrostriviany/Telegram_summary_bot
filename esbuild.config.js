/**
 * esbuild configuration for Lambda bundling
 * 
 * This configuration bundles the TypeScript Lambda handler into a single
 * JavaScript file optimized for AWS Lambda Node.js 18.x runtime.
 * 
 * Key features:
 * - Bundles all dependencies except AWS SDK v3 (provided by Lambda runtime)
 * - Targets Node.js 18 for ES2020 compatibility
 * - Supports both development and production builds
 */

const esbuild = require('esbuild');

const isProduction = process.env.NODE_ENV === 'production';

const buildOptions = {
  entryPoints: ['src/handler.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/handler.js',
  // Externalize AWS SDK v3 - it's provided by Lambda runtime
  external: [
    '@aws-sdk/client-dynamodb',
    '@aws-sdk/lib-dynamodb',
    '@aws-sdk/client-bedrock-runtime',
  ],
  // Production optimizations
  minify: isProduction,
  sourcemap: isProduction ? 'external' : 'inline',
  // Tree shaking for smaller bundles
  treeShaking: true,
  // Keep names for better stack traces
  keepNames: !isProduction,
  // Log level
  logLevel: 'info',
};

// Run the build
esbuild.build(buildOptions)
  .then(() => {
    console.log(`Build completed successfully (${isProduction ? 'production' : 'development'})`);
  })
  .catch((error) => {
    console.error('Build failed:', error);
    process.exit(1);
  });
