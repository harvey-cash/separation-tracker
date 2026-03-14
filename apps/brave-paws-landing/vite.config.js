import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const rootPackageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);

export default defineConfig({
  base: '/separation/',
  define: {
    __APP_VERSION__: JSON.stringify(rootPackageJson.version || 'dev'),
  },
});
