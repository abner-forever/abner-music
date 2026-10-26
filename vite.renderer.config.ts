import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig((environment) => ({
  base: './',
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 'forgeConfigSelf' in environment ? 5174 : 5173,
    strictPort: true,
  },
  build: { emptyOutDir: true },
}));
