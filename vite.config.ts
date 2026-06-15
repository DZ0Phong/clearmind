import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// Split node_modules into stable vendor chunks so cache survives app-code
// edits. Without this every minor app change re-busts the entire
// node_modules dependency tree — common offenders (react-dom, radix,
// fullcalendar) hash-rotate together with the app code each build.
export default defineConfig({
  plugins: [
    tailwindcss(),
    react()
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        manualChunks: (id: string) => {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('react-dom')) return 'vendor-react-dom'
          if (id.includes('react-router')) return 'vendor-router'
          if (id.includes('radix-ui')) return 'vendor-radix'
          if (id.includes('lucide')) return 'vendor-icons'
          if (id.includes('@fullcalendar')) return 'vendor-fullcalendar'
          if (id.includes('linkedom')) return 'vendor-linkedom'
          return 'vendor'
        },
      },
    },
  },
})
