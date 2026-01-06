import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const serverPort = Number(process.env.VITE_SERVER_PORT) || 9090
const clientPort = Number(process.env.VITE_CLIENT_PORT) || 5173

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: clientPort,
    strictPort: false,
    proxy: {
      '/api': {
        target: `http://localhost:${serverPort}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `http://localhost:${serverPort}`,
        ws: true,
        changeOrigin: true,
      },
    },
  },
  define: {
    'import.meta.env.VITE_SERVER_PORT': JSON.stringify(serverPort.toString()),
  },
  build: {
    outDir: 'dist/client',
  },
})
