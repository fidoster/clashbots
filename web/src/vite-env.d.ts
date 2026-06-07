/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend API origin in production (e.g. https://clashbots-api.onrender.com).
   *  Empty in dev, where Vite proxies /api to the local backend. */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
