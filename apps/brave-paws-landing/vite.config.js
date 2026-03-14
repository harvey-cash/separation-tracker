import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

const rootPackageJson = JSON.parse(
  readFileSync(path.resolve(__dirname, '..', '..', 'package.json'), 'utf8'),
);

export default defineConfig({
  base: '/separation/',
  define: {
    __APP_VERSION__: JSON.stringify(rootPackageJson.version || '0.0.0'),
  },
});
