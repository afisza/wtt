/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import fs from 'node:fs';

/*
 * Stempel wersji wchodzi do paczki jako LITERAŁ (`define`). Gotowa paczka niesie więc build,
 * z którym powstała, a `version.json` obok `index.html` mówi, co serwer wydaje TERAZ.
 * Różnica = otwarta karta ma starą aplikację → okno „Nowa wersja dostępna” (UpdateBanner).
 * Kolejność w CI jest istotna: najpierw stemplujemy `version.json`, potem `npm run build`.
 */
const versionInfo = JSON.parse(fs.readFileSync('./version.json', 'utf-8')) as {
  version: string;
  build: string;
};

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  base: '/',
  define: {
    __APP_VERSION__: JSON.stringify(versionInfo.version),
    __APP_BUILD__: JSON.stringify(versionInfo.build),
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:80',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/wtt/api'),
      },
    },
  },
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Testy tylko z frontendu — api/vendor (pakiety Composera) zawiera cudze pliki *.test.ts
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
