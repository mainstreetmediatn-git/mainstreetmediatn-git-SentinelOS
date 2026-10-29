import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/civitas': {
        target: process.env.CIVITAS_URL ?? 'http://127.0.0.1:8788',
        rewrite: (path) => path.replace(/^\\/api\\/civitas/, ''),
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (request) => {
            if (process.env.CIVITAS_API_TOKEN) {
              request.setHeader('authorization', 'Bearer ' + process.env.CIVITAS_API_TOKEN)
            }
          })
        },
      },
    },
  },
})
