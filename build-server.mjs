import { build } from 'esbuild';

await build({
  entryPoints: ['server.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  minify: true,
  sourcemap: false,
  external: ['vite', 'pg-native', 'bufferutil', 'utf-8-validate'],
  outfile: 'dist/server/server.cjs',
  logLevel: 'info',
});
