import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// objects.json lives only in backend/app/data (single source of truth).
// The "@data" alias lets the page import that same file instead of a copy.
const dataDir = fileURLToPath(new URL('../backend/app/data', import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@data': dataDir } },
  server: { fs: { allow: ['..'] } },
})
