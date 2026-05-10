import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const normalizeBasePath = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return '/separation/app/';
    }

    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
  };
  const deriveBasePath = () => {
    if (env.VITE_BRAVE_PAWS_APP_BASE_PATH) {
      return normalizeBasePath(env.VITE_BRAVE_PAWS_APP_BASE_PATH);
    }

    if (env.VITE_BRAVE_PAWS_APP_URL) {
      try {
        return normalizeBasePath(new URL(env.VITE_BRAVE_PAWS_APP_URL).pathname);
      } catch {
        return '/separation/app/';
      }
    }

    return '/separation/app/';
  };

  return {
    base: deriveBasePath(),
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    define: {
      '__APP_VERSION__': JSON.stringify(version),
    },
  };
});
