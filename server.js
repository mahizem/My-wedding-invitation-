// Zero-dependency Node server (Node 22.5+). No `npm install` needed.
// Run:  ADMIN_PASSWORD=choose-a-password node server.js
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');   // put this on a persistent disk when deploying
const UPLOADS = path.join(DATA, 'uploads'); fs.mkdirSync(UPLOADS, { recursive: true });
const PUBLIC = path.join(__dirname, 'public');
const MAX_PHOTO = 5 * 1024 * 1024;           // 5 MB per photo (after phone-side compression)

const db = new DatabaseSync(path.join(DATA, 'wedding.db'));
db.exec(`
CREATE TABLE IF NOT EXISTS photos(id INTEGER PRIMARY KEY, file TEXT NOT NULL, guest_name TEXT, message TEXT, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS wishes(id INTEGER PRIMARY KEY, name TEXT NOT NULL, message TEXT NOT NULL, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS rsvps(id INTEGER PRIMARY KEY, name TEXT NOT NULL, guests INTEGER NOT NULL, attending INTEGER NOT NULL, message TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);

const MIME = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg','.ico':'image/x-icon' };
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

// Basic in-memory rate limit: max `n` POSTs per IP per 10 minutes
const hits = new Map();
function limited(ip, n = 40) { const now = Date.now(), a = (hits.get(ip) || []).filter(t => now - t < 6e5); a.push(now); hits.set(ip, a); return a.length > n; }

const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(obj)); };
const isAdmin = req => { if (!ADMIN_PASSWORD) return false; const a = Buffer.from(String(req.headers['x-admin-key'] || '')), b = Buffer.from(ADMIN_PASSWORD); return a.length === b.length && crypto.timingSafeEqual(a, b); };
function body(req, max) { return new Promise((ok, no) => { let n = 0; const c = []; req.on('data', d => { n += d.length; if (n > max) { no(new Error('too large')); req.destroy(); } else c.push(d); }); req.on('end', () => ok(Buffer.concat(c).toString())); req.on('error', no); }); }
const json = async (req, max = 20000) => { try { return JSON.parse(await body(req, max)); } catch { return null; } };

// Supabase is accessed only from this server, using the private key stored in Render.
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || '';
const hasSupabase = () => Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY);
async function supabaseRequest(table, method = 'GET', query = '', data = undefined) {
  if (!hasSupabase()) throw new Error('Supabase environment variables are missing');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query ? `?${query}` : ''}`, {
    method,
    headers: {
      apikey: SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) })
  });
  const resultText = await response.text();
  if (!response.ok) {
    console.error(`Supabase request failed (${table}, ${response.status}): ${resultText.slice(0, 300)}`);
    throw new Error(`Supabase request failed with status ${response.status}`);
  }
  return resultText ? JSON.parse(resultText) : null;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), p = url.pathname, ip = req.socket.remoteAddress;
  try {
    // ---------- PUBLIC API ----------
    if (p === '/api/photos' && req.method === 'GET') return send(res, 200, db.prepare("SELECT id,file,guest_name,message,created_at FROM photos WHERE status='approved' ORDER BY id DESC LIMIT 200").all().map(r => ({ ...r, url: '/uploads/' + r.file })));
    if (p === '/api/wishes' && req.method === 'GET') {
      if (!hasSupabase()) return send(res, 503, { error: 'Wishes storage is not configured yet' });
      return send(res, 200, await supabaseRequest('wishes', 'GET', 'select=id,name,message,created_at&status=eq.approved&order=id.desc&limit=200'));
    }
    if (req.method === 'POST' && p.startsWith('/api/') && !p.startsWith('/api/admin') && limited(ip)) return send(res, 429, { error: 'Too many requests. Please try again later.' });

    if (p === '/api/photos' && req.method === 'POST') {       // body: {image:"data:image/jpeg;base64,...", name, message}
      const d = await json(req, 8 * 1024 * 1024).catch(() => null); if (!d) return send(res, 400, { error: 'Invalid request' });
      const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(d.image || '')); if (!m) return send(res, 400, { error: 'Only JPEG images are accepted' });
      const buf = Buffer.from(m[1], 'base64');
      if (buf.length > MAX_PHOTO || buf.length < 1000) return send(res, 400, { error: 'Photo is too large or empty' });
      if (!(buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) || buf.at(-2) !== 0xFF || buf.at(-1) !== 0xD9) return send(res, 400, { error: 'Not a valid image' });
      const file = crypto.randomBytes(12).toString('hex') + '.jpg'; fs.writeFileSync(path.join(UPLOADS, file), buf);
      db.prepare('INSERT INTO photos(file,guest_name,message) VALUES(?,?,?)').run(file, clean(d.name, 60), clean(d.message, 300));
      return send(res, 201, { ok: true });
    }
    if (p === '/api/wishes' && req.method === 'POST') {
      if (!hasSupabase()) return send(res, 503, { error: 'Wishes storage is not configured yet' });
      const d = await json(req); const name = clean(d?.name, 60), msg = clean(d?.message, 500);
      if (!name || !msg) return send(res, 400, { error: 'Name and message are required' });
      await supabaseRequest('wishes', 'POST', '', { name, message: msg, status: 'pending' });
      return send(res, 201, { ok: true });
    }
    if (p === '/api/rsvp' && req.method === 'POST') {
      if (!hasSupabase()) return send(res, 503, { error: 'RSVP storage is not configured yet' });
      const d = await json(req); const name = clean(d?.name, 60), g = Math.floor(Number(d?.guests));
      if (!name || !(g >= 1 && g <= 20) || typeof d?.attending !== 'boolean') return send(res, 400, { error: 'Please complete the form' });
      await supabaseRequest('rsvps', 'POST', '', { name, guests: g, attending: d.attending ? 1 : 0, message: clean(d.message, 300) });
      return send(res, 201, { ok: true });
    }

    // ---------- ADMIN API (header x-admin-key) ----------
    if (p.startsWith('/api/admin') || (p.startsWith('/uploads/') && url.searchParams.get('admin'))) {
      if (!isAdmin(req)) return send(res, 401, { error: ADMIN_PASSWORD ? 'Wrong password' : 'Set ADMIN_PASSWORD to enable admin' });
    }
    if (p === '/api/admin/all') {
      if (!hasSupabase()) return send(res, 503, { error: 'Supabase storage is not configured yet' });
      const [wishes, rsvps] = await Promise.all([
        supabaseRequest('wishes', 'GET', 'select=*&order=id.desc'),
        supabaseRequest('rsvps', 'GET', 'select=*&order=id.desc')
      ]);
      const totals = {
        coming: rsvps.reduce((sum, r) => sum + (Number(r.attending) === 1 ? Number(r.guests) : 0), 0),
        yes: rsvps.filter(r => Number(r.attending) === 1).length,
        no: rsvps.filter(r => Number(r.attending) === 0).length
      };
      return send(res, 200, { photos: db.prepare('SELECT * FROM photos ORDER BY id DESC').all(), wishes, rsvps, totals });
    }
    if (p === '/api/admin/rsvps.csv') {
      if (!hasSupabase()) return send(res, 503, { error: 'Supabase storage is not configured yet' });
      const q = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
      const rows = await supabaseRequest('rsvps', 'GET', 'select=*&order=id.asc');
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename=rsvps.csv' });
      return res.end('\ufeffname,guests,attending,message,created_at\n' + rows.map(r => [q(r.name), r.guests, Number(r.attending) ? 'yes' : 'no', q(r.message), q(r.created_at)].join(',')).join('\n'));
    }
    let m = /^\/api\/admin\/(photos|wishes|rsvps)\/(\d+)\/(approve|reject|delete)$/.exec(p);
    if (m && req.method === 'POST') {
      const [, t, id, act] = m;
      if ((t === 'wishes' || t === 'rsvps') && !hasSupabase()) return send(res, 503, { error: 'Supabase storage is not configured yet' });
      if (t === 'photos') {
        if (act === 'delete') { const r = db.prepare('SELECT file FROM photos WHERE id=?').get(id); if (r) fs.rmSync(path.join(UPLOADS, r.file), { force: true }); db.prepare('DELETE FROM photos WHERE id=?').run(id); }
        else db.prepare('UPDATE photos SET status=? WHERE id=?').run(act === 'approve' ? 'approved' : 'rejected', id);
      } else if (act === 'delete') {
        await supabaseRequest(t, 'DELETE', `id=eq.${id}`);
      } else if (t === 'approve' || act === 'reject') {
        if (t === 'rsvps') return send(res, 400, { error: 'RSVPs cannot be approved or rejected' });
        await supabaseRequest(t, 'PATCH', `id=eq.${id}`, { status: act === 'approve' ? 'approved' : 'rejected' });
      }
      return send(res, 200, { ok: true });
    }

    // ---------- UPLOADED FILES (only approved photos are public) ----------
    if (p.startsWith('/uploads/')) {
      const f = path.basename(p); const r = db.prepare('SELECT status FROM photos WHERE file=?').get(f);
      if (!r || (r.status !== 'approved' && !isAdmin(req))) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
      return fs.createReadStream(path.join(UPLOADS, f)).pipe(res);
    }

    // ---------- STATIC FILES ----------
    let rel = p === '/' || p === '/photos' ? '/index.html' : p === '/admin' ? '/admin.html' : p;
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(file).pipe(res);
  } catch (e) { console.error(e); if (!res.headersSent) send(res, 500, { error: 'Server error' }); }
}).listen(PORT, () => console.log(`Wedding site: http://localhost:${PORT}  |  Admin: /admin ${ADMIN_PASSWORD ? '' : '(DISABLED: set ADMIN_PASSWORD)'}`));
