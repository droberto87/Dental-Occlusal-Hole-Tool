import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/tools/occlusal-hole-tool/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    minify: 'terser',
    terserOptions: {
      compress: { drop_console: true },
      mangle: { toplevel: true }
    }
  }
})
