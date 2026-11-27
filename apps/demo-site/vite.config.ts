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
        register: page('register.html'),
        shop: page('shop.html'),
        payroll: page('payroll.html'),
        list: page('list.html'),
        import: page('import.html'),
        grid: page('grid.html'),
        promo: page('promo.html'),
        chat: page('chat.html'),
        audit: page('audit.html'),
        print: page('print.html'),
        shadow: page('shadow.html'),
        crawlStart: page('crawl-start.html'),
        crawlBad: page('crawl-bad.html'),
        serverForm: page('server-form.html'),
        controls: page('controls.html'),
        portal: page('portal.html'),
        portalFn: page('portal-fn.html'),
      },
    },
  },
});
