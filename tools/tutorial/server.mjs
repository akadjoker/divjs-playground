// A static file server for the repository, for the recorder (with the
// image types the Blocks editor needs).

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { ROOT } from '../game-shots.mjs';

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.div': 'text/plain', '.md': 'text/markdown', '.svg': 'image/svg+xml', '.png': 'image/png', '.gif': 'image/gif',
  '.cur': 'image/x-icon', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.woff2': 'font/woff2'
};

export function startServer()
{
  const server = http.createServer(async (req, res) =>
  {
    try
    {
      let file = normalize(join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
      if (!file.startsWith(ROOT))
      {
        res.writeHead(403).end();
        return;
      }
      if ((await stat(file)).isDirectory())
      {
        file = join(file, 'index.html');
      }
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(await readFile(file));
    }
    catch
    {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}
