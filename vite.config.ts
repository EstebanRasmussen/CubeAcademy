import { defineConfig } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';

/** Security headers for production hosting, kept in one place (see PUBLISHING.md). */
const headers: Record<string, string> = JSON.parse(readFileSync(new URL('./security-headers.json', import.meta.url), 'utf8'));

export default defineConfig({
  // relative paths: the build works at a domain root and in a subfolder (GitHub Pages)
  base: './',
  server: { port: 5173, strictPort: true },
  // `npm run preview` serves the build with the production headers, to test them locally
  preview: { port: 4173, headers },
  worker: { format: 'es' },
  optimizeDeps: { include: ['cubejs'] },
  plugins: [
    {
      name: 'security-headers-file',
      apply: 'build',
      // _headers: read by Cloudflare Pages and Netlify
      closeBundle() {
        const body = '/*\n' + Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`).join('\n') + '\n';
        writeFileSync(new URL('./dist/_headers', import.meta.url), body);
      },
    },
  ],
});
