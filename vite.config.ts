import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          'pdf-vendor': ['pdfjs-dist'],
          'charts-vendor': ['recharts'],
          'motion-vendor': ['framer-motion'],
          'pdf-gen': ['jspdf', 'jspdf-autotable', 'jszip'],
        },
      },
    },
  },
});
