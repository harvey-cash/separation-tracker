/// <reference types="vite/client" />

/** Build-time constant injected by Vite from package.json `version` field. */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_BRAVE_PAWS_PUBLIC_BASE_URL?: string;
  readonly VITE_BRAVE_PAWS_PUBLIC_BASE_PATH?: string;
  readonly VITE_BRAVE_PAWS_APP_URL?: string;
  readonly VITE_BRAVE_PAWS_APP_BASE_PATH?: string;
  readonly VITE_BRAVE_PAWS_API_BASE_URL?: string;
  readonly VITE_BRAVE_PAWS_DEFAULT_CAMERA_URL?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
