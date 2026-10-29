/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CIVITAS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
