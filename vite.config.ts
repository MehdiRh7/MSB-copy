import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, type Plugin} from 'vite';
import {createAiMiddleware} from './server/aiProxy';

/**
 * پراکسی هوش مصنوعی (DeepSeek / Gemini / Grok) روی همان سرور Vite.
 * کلیدها از .env.local / متغیرهای محیطی خوانده می‌شوند و هرگز در Bundle
 * کلاینت قرار نمی‌گیرند (پیشوند VITE_ ندارند).
 */
const aiProxyPlugin = (env: Record<string, string | undefined>): Plugin => ({
  name: 'msb-ai-proxy',
  configureServer(server) {
    server.middlewares.use(createAiMiddleware(env));
  },
  configurePreviewServer(server) {
    server.middlewares.use(createAiMiddleware(env));
  },
});

export default defineConfig(({mode}) => {
  const env = {...process.env, ...loadEnv(mode, process.cwd(), '')};
  return {
    plugins: [react(), tailwindcss(), aiProxyPlugin(env)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify; file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
