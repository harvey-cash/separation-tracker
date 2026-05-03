import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';

const rootPackageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    base: env.VITE_BRAVE_PAWS_PUBLIC_BASE_PATH || '/separation/',
    define: {
      __APP_VERSION__: JSON.stringify(rootPackageJson.version || 'dev'),
    },
  };
});
