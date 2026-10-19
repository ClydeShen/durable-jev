import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const coordinatorUrl = process.env.COORDINATOR_URL ?? 'http://127.0.0.1:4100'
const launcherUrl = process.env.LAUNCHER_URL ?? 'http://127.0.0.1:4000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    proxy: {
      '/api': { target: coordinatorUrl, rewrite: (path) => path.replace(/^\/api/, '') },
      '/control': { target: launcherUrl, rewrite: (path) => path.replace(/^\/control/, '') },
    },
  },
})
