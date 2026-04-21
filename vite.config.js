import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/doorworld-admin/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      stream: 'stream-browserify',
    },
  },
  optimizeDeps: {
    include: ['exceljs'],
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      plugins: [],
    },
  },
})
