import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.js'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  external: ['express', 'tsx'],
  shims: true,
  esbuildOptions(options) {
    options.banner = {
      js: '// @thizjs/express - File-based routing for Express\n// https://github.com/santhosh-2504/thizjs-express',
    };
  },
});