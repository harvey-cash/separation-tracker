import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';

const rootPackageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const normalizeBasePath = (value) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return '/separation/';
    }

    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
  };
  const deriveBasePath = () => {
    if (env.VITE_BRAVE_PAWS_PUBLIC_BASE_PATH) {
      return normalizeBasePath(env.VITE_BRAVE_PAWS_PUBLIC_BASE_PATH);
    }

    if (env.VITE_BRAVE_PAWS_PUBLIC_BASE_URL) {
      try {
        return normalizeBasePath(new URL(env.VITE_BRAVE_PAWS_PUBLIC_BASE_URL).pathname);
      } catch {
        return '/separation/';
      }
    }

    return '/separation/';
  };

  return {
    base: deriveBasePath(),
    define: {
      __APP_VERSION__: JSON.stringify(rootPackageJson.version || 'dev'),
    },
  };
});
