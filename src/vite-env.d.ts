/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CIVITAS_URL?: string
  readonly VITE_SENTINEL_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
