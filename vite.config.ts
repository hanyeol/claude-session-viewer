import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const serverPort = Number(process.env.VITE_API_PORT) || 9090

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
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
    'import.meta.env.VITE_API_PORT': JSON.stringify(serverPort.toString()),
  },
  build: {
    outDir: 'dist/client',
  },
})
