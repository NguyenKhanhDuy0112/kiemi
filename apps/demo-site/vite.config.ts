import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { demoApi } from './server/plugin';

const page = (name: string) => resolve(__dirname, name);

export default defineConfig({
  plugins: [demoApi()],
  server: { port: 5180, strictPort: true },
  preview: { port: 5180, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        index: page('index.html'),
        login: page('login.html'),
        form: page('form.html'),
        requests: page('requests.html'),
        table: page('table.html'),
        iframe: page('iframe.html'),
        inner: page('frames/inner.html'),
        nested: page('frames/nested.html'),
        dialogs: page('dialogs.html'),
        popup: page('popup.html'),
        fixes: page('fixes.html'),
      },
    },
  },
});
