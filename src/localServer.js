const http = require('http');

const PORT = 27836;

class LocalServer {
  /**
   * @param {(cookie: string) => Promise<void>} onCookieReceived
   */
  constructor(onCookieReceived) {
    this._onCookieReceived = onCookieReceived;
    this._server = null;
  }

  /** Start listening on loopback only. Resolves with actual port. */
  start() {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        // Only accept loopback connections
        const remote = req.socket.remoteAddress;
        if (remote !== '127.0.0.1' && remote !== '::1' && remote !== '::ffff:127.0.0.1') {
          res.writeHead(403);
          res.end();
          return;
        }

        // CORS – allow chrome-extension:// origins
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        if (req.method === 'POST' && req.url === '/jira-cookie') {
          let body = '';
          req.on('data', chunk => { body += chunk.toString(); });
          req.on('end', async () => {
            try {
              const payload = JSON.parse(body);
              if (typeof payload.cookie !== 'string' || !payload.cookie.trim()) {
                throw new Error('Missing or empty cookie value');
              }
              await this._onCookieReceived(payload.cookie.trim());
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true }));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: err.message }));
            }
          });
          return;
        }

        res.writeHead(404);
        res.end();
      });

      server.on('error', reject);
      server.listen(PORT, '127.0.0.1', () => {
        this._server = server;
        resolve(PORT);
      });
    });
  }

  stop() {
    return new Promise(resolve => {
      if (this._server) {
        this._server.close(() => resolve());
        this._server = null;
      } else {
        resolve();
      }
    });
  }
}

module.exports = { LocalServer };
