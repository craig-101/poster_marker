// DAS 2026 Poster Scorer: serves index.html and keeps one shared sheet (session
// setup + scores) so every device shows the same thing. No dependencies.
//
//   GET  /api/state  → { version, cfg, scores, updatedAt }  (version 0 = empty)
//   PUT  /api/state  ← { cfg, scores }  → { version }        (last write wins)
//
// Env (all optional): PORT (Render sets it), DATA_DIR (default ./data; on Render
// a disk such as /var/data).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const MAX_BODY = 256 * 1024;

fs.mkdirSync(DATA_DIR, { recursive: true });

let state = { version: 0, cfg: null, scores: null, updatedAt: null };
try {
  state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
} catch (err) {
  if (err.code !== 'ENOENT') console.error('Could not read saved state, starting empty:', err.message);
}

function persist() {
  // Write then rename, so a crash mid-write never leaves a half-written file.
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, STATE_FILE);
}

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function validate(body) {
  if (!isObj(body) || !isObj(body.cfg) || !isObj(body.scores)) return 'Expected { cfg, scores }.';
  if (!Array.isArray(body.cfg.posters)) return 'cfg.posters must be a list.';
  return null;
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

const indexHtml = () => fs.readFileSync(path.join(ROOT, 'index.html'));

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://x');

  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    return send(res, 200, indexHtml(), 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && pathname === '/healthz') return send(res, 200, { ok: true });

  if (pathname === '/api/state') {
    if (req.method === 'GET') return send(res, 200, state);
    if (req.method === 'PUT') {
      let size = 0;
      const chunks = [];
      req.on('data', c => {
        size += c.length;
        if (size > MAX_BODY) { send(res, 413, { error: 'Too large.' }); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        if (res.writableEnded) return;
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { return send(res, 400, { error: 'Invalid JSON.' }); }
        const problem = validate(body);
        if (problem) return send(res, 400, { error: problem });
        state = { version: state.version + 1, cfg: body.cfg, scores: body.scores, updatedAt: new Date().toISOString() };
        try { persist(); } catch (err) {
          console.error('Save failed:', err);
          return send(res, 500, { error: 'Could not save.' });
        }
        send(res, 200, { version: state.version });
      });
      return;
    }
    return send(res, 405, { error: 'Method not allowed.' });
  }

  send(res, 404, 'Not found', 'text/plain; charset=utf-8');
});

server.listen(PORT, () => console.log(`Poster scorer on http://localhost:${PORT}`));
