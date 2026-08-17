import { defineConfig } from 'vite'
import glsl from 'vite-plugin-glsl'

export default defineConfig({
  plugins: [glsl()],
  // .mp3/.wav/.ogg/.m4a are recognized as assets by Vite out of the box;
  // .aif/.aiff aren't, so sound effects exported in that format need this.
  assetsInclude: ['**/*.aif', '**/*.aiff'],
  server: {
    port: 5173,
    host: true,   // expose on local network for mobile access
    open: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 600,   // Three.js is ~526 kB minified — expected
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          postprocessing: ['postprocessing']
        }
      }
    }
  }
})
