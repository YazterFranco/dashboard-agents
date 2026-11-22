// Servidor estático con la misma regla que Capacitor en Android (html5mode): una ruta sin extensión
// devuelve index.html. Sirve el paquete de la app (dist-app) SIN servidor de Lucca: todo corre en el navegador.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

function serveStatic(root) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://x');
      let file = path.join(root, decodeURIComponent(url.pathname));
      if (!file.startsWith(root)) return res.writeHead(403).end();
      const last = url.pathname.split('/').pop();
      if (url.pathname === '/' || !last.includes('.')) file = path.join(root, 'index.html');
      fs.readFile(file, (err, data) => {
        if (err) return res.writeHead(404).end('not found');
        res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, stop: () => new Promise((r) => server.close(r)) }));
  });
}
module.exports = { serveStatic };
