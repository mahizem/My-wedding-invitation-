// Wedding invitation server. Requires Node.js 22.5+.
// Persistent guest data: Supabase (wishes, RSVPs, photo metadata) + Telegram (photo files).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID || '';
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOADS = path.join(DATA, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });
const PUBLIC = path.join(__dirname, 'public');
const MAX_PHOTO = 5 * 1024 * 1024;
const LEGACY_PHOTO_OFFSET = 9000000000000;

// SQLite is retained only to serve old photos uploaded before Telegram storage was enabled.
const db = new DatabaseSync(path.join(DATA, 'wedding.db'));
db.exec(`CREATE TABLE IF NOT EXISTS photos(id INTEGER PRIMARY KEY, file TEXT NOT NULL, guest_name TEXT, message TEXT, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);

const MIME = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg','.ico':'image/x-icon' };
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const hits = new Map();
function limited(ip, n = 40) { const now = Date.now(), a = (hits.get(ip) || []).filter(t => now - t < 600000); a.push(now); hits.set(ip, a); return a.length > n; }
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
const isAdmin = req => { if (!ADMIN_PASSWORD) return false; const a = Buffer.from(String(req.headers['x-admin-key'] || '')), b = Buffer.from(ADMIN_PASSWORD); return a.length === b.length && crypto.timingSafeEqual(a, b); };
function body(req, max) { return new Promise((ok, no) => { let n = 0; const chunks = []; req.on('data', d => { n += d.length; if (n > max) { no(new Error('too large')); req.destroy(); } else chunks.push(d); }); req.on('end', () => ok(Buffer.concat(chunks).toString())); req.on('error', no); }); }
const json = async (req, max = 20000) => { try { return JSON.parse(await body(req, max)); } catch { return null; } };

function requireSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Server storage is not configured. Check SUPABASE_URL and SUPABASE_SECRET_KEY in Render.');
}
async function supabaseRequest(table, method = 'GET', query = '', data = undefined, prefer = '') {
  requireSupabase();
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: 'application/json' };
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query ? `?${query}` : ''}`, {
    method, headers, ...(data !== undefined ? { body: JSON.stringify(data) } : {})
  });
  const text = await response.text();
  if (!response.ok) {
    console.error(`Supabase ${method} ${table} failed (${response.status}): ${text.slice(0, 500)}`);
    throw new Error(`Database request failed (${response.status}). Check the Supabase table and server environment settings.`);
  }
  return text ? JSON.parse(text) : null;
}
function telegramUrl(method) { if (!TELEGRAM_BOT_TOKEN) throw new Error('Telegram photo storage is not configured. Add TELEGRAM_BOT_TOKEN in Render.'); return `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`; }
async function telegramRequest(method, payload) {
  const r = await fetch(telegramUrl(method), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) { console.error(`Telegram ${method} failed: ${JSON.stringify(j).slice(0, 500)}`); throw new Error('Telegram could not process this photo. Check the bot token, channel ID, and bot channel permissions.'); }
  return j.result;
}
async function uploadPhotoToTelegram(buf, name, message) {
  if (!TELEGRAM_CHANNEL_ID) throw new Error('Telegram photo storage is not configured. Add TELEGRAM_CHANNEL_ID in Render.');
  const form = new FormData();
  form.append('chat_id', TELEGRAM_CHANNEL_ID);
  const caption = [name, message].filter(Boolean).join(' — ').slice(0, 1000);
  if (caption) form.append('caption', caption);
  form.append('photo', new Blob([buf], { type: 'image/jpeg' }), 'wedding-photo.jpg');
  const r = await fetch(telegramUrl('sendPhoto'), { method: 'POST', body: form });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok || !j.result?.photo?.length) {
    console.error(`Telegram sendPhoto failed (${r.status}): ${JSON.stringify(j).slice(0, 500)}`);
    throw new Error('Photo could not be sent to the private channel. Please try again later.');
  }
  const sizes = j.result.photo;
  return { fileId: sizes[sizes.length - 1].file_id, messageId: j.result.message_id };
}
async function getTelegramPhoto(fileId, res) {
  const meta = await telegramRequest('getFile', { file_id: fileId });
  if (!meta.file_path) throw new Error('Telegram did not return a file path.');
  const fileResponse = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${meta.file_path}`);
  if (!fileResponse.ok) throw new Error('Could not retrieve photo from Telegram.');
  const buffer = Buffer.from(await fileResponse.arrayBuffer());
  res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': buffer.length, 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
  res.end(buffer);
}
const photoFields = 'id,telegram_file_id,telegram_message_id,guest_name,message,status,created_at';
const legacyPhotos = () => db.prepare("SELECT id,file,guest_name,message,status,created_at FROM photos ORDER BY id DESC").all();
function legacyId(id) { return Number(id) >= LEGACY_PHOTO_OFFSET ? Number(id) - LEGACY_PHOTO_OFFSET : null; }

http.createServer(async (req, res) => {
  const ALLOWED_ORIGINS = [
  'https://my-wedding-invitation-site.onrender.com',
  'https://my-wedding-invitation-male-side-1.onrender.com'
];

const origin = req.headers.origin;

if (ALLOWED_ORIGINS.includes(origin)) {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key');
  res.setHeader('Access-Control-Max-Age', '86400');
}

if (req.method === 'OPTIONS') {
  if (!ALLOWED_ORIGINS.includes(origin)) {
    res.writeHead(403);
    return res.end();
  }
  res.writeHead(204);
  return res.end();
}
  const url = new URL(req.url, 'http://localhost'), p = url.pathname, ip = req.socket.remoteAddress || 'unknown';
  try {
    // Public approved photos: current Telegram/Supabase records plus older local photos.
    if (p === '/api/photos' && req.method === 'GET') {
      const rows = await supabaseRequest('photos', 'GET', `select=${photoFields}&status=eq.approved&order=id.desc&limit=200`);
      const current = (rows || []).map(r => ({ id: r.id, file: String(r.id), guest_name: r.guest_name, message: r.message, created_at: r.created_at, url: `/uploads/${r.id}` }));
      const old = db.prepare("SELECT id,file,guest_name,message,created_at FROM photos WHERE status='approved' ORDER BY id DESC LIMIT 200").all().map(r => ({ ...r, id: LEGACY_PHOTO_OFFSET + r.id, url: `/uploads/${encodeURIComponent(r.file)}` }));
      return send(res, 200, [...current, ...old].slice(0, 200));
    }
    if (p === '/api/wishes' && req.method === 'GET') {
      const rows = await supabaseRequest('wishes', 'GET', 'select=id,name,message,created_at&status=eq.approved&order=id.desc&limit=200');
      return send(res, 200, rows || []);
    }
    if (req.method === 'POST' && p.startsWith('/api/') && !p.startsWith('/api/admin') && limited(ip)) return send(res, 429, { error: 'Too many requests. Please try again later.' });

    if (p === '/api/photos' && req.method === 'POST') {
      const d = await json(req, 8 * 1024 * 1024); if (!d) return send(res, 400, { error: 'Invalid request' });
      const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(d.image || ''));
      if (!match) return send(res, 400, { error: 'Only JPEG images are accepted' });
      const buf = Buffer.from(match[1], 'base64');
      if (buf.length > MAX_PHOTO || buf.length < 1000) return send(res, 400, { error: 'Photo is too large or empty' });
      if (!(buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) || buf.at(-2) !== 0xFF || buf.at(-1) !== 0xD9) return send(res, 400, { error: 'Not a valid image' });
      const name = clean(d.name, 60), message = clean(d.message, 300);
      if (!name) return send(res, 400, { error: 'Please enter your name.' });
      const uploaded = await uploadPhotoToTelegram(buf, name, message);
      const inserted = await supabaseRequest('photos', 'POST', 'select=id', {
        telegram_file_id: uploaded.fileId,
        telegram_message_id: uploaded.messageId,
        guest_name: name,
        message: message || null,
        status: 'pending'
      }, 'return=representation');
      return send(res, 201, { ok: true, id: inserted?.[0]?.id ?? null });
    }
    if (p === '/api/wishes' && req.method === 'POST') {
      const d = await json(req); const name = clean(d?.name, 60), message = clean(d?.message, 500);
      if (!name || !message) return send(res, 400, { error: 'Name and message are required' });
      await supabaseRequest('wishes', 'POST', '', { name, message, status: 'pending' }, 'return=minimal');
      return send(res, 201, { ok: true });
    }
    if (p === '/api/rsvp' && req.method === 'POST') {
      const d = await json(req); const name = clean(d?.name, 60), guests = Math.floor(Number(d?.guests));
      if (!name || !(guests >= 1 && guests <= 20) || typeof d?.attending !== 'boolean') return send(res, 400, { error: 'Please complete the form' });
      await supabaseRequest('rsvps', 'POST', '', { name, guests, attending: d.attending ? 1 : 0, message: clean(d.message, 300) || null }, 'return=minimal');
      return send(res, 201, { ok: true });
    }

    // Admin endpoints require x-admin-key.
    if (p.startsWith('/api/admin') || (p.startsWith('/uploads/') && url.searchParams.get('admin'))) {
      if (!isAdmin(req)) return send(res, 401, { error: ADMIN_PASSWORD ? 'Wrong password' : 'Set ADMIN_PASSWORD to enable admin' });
    }
    if (p === '/api/admin/all' && req.method === 'GET') {
      const [photos, wishes, rsvps] = await Promise.all([
        supabaseRequest('photos', 'GET', `select=${photoFields}&order=id.desc&limit=500`),
        supabaseRequest('wishes', 'GET', 'select=*&order=id.desc&limit=1000'),
        supabaseRequest('rsvps', 'GET', 'select=*&order=id.desc&limit=1000')
      ]);
      const current = (photos || []).map(r => ({ ...r, file: String(r.id) }));
      const old = legacyPhotos().map(r => ({ ...r, id: LEGACY_PHOTO_OFFSET + r.id, file: r.file, legacy: true }));
      const allRsvps = rsvps || [];
      const totals = allRsvps.reduce((a, r) => { const yes = Number(r.attending) === 1 || r.attending === true; if (yes) { a.yes++; a.coming += Number(r.guests) || 0; } else a.no++; return a; }, { coming: 0, yes: 0, no: 0 });
      return send(res, 200, { photos: [...current, ...old].sort((a,b) => String(b.created_at).localeCompare(String(a.created_at))), wishes: wishes || [], rsvps: allRsvps, totals });
    }
    if (p === '/api/admin/rsvps.csv' && req.method === 'GET') {
      const rows = await supabaseRequest('rsvps', 'GET', 'select=*&order=id.asc&limit=10000');
      const q = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename=rsvps.csv', 'X-Content-Type-Options': 'nosniff' });
      return res.end('\ufeffname,guests,attending,message,created_at\n' + (rows || []).map(r => [q(r.name), Number(r.guests) || 0, (Number(r.attending) === 1 || r.attending === true) ? 'yes' : 'no', q(r.message), q(r.created_at)].join(',')).join('\n'));
    }
    const route = /^\/api\/admin\/(photos|wishes|rsvps)\/(\d+)\/(approve|reject|delete)$/.exec(p);
    if (route && req.method === 'POST') {
      const [, table, rawId, action] = route; const id = Number(rawId);
      if (table === 'photos' && id >= LEGACY_PHOTO_OFFSET) {
        const oldId = id - LEGACY_PHOTO_OFFSET;
        if (action === 'delete') { const r = db.prepare('SELECT file FROM photos WHERE id=?').get(oldId); if (r) fs.rmSync(path.join(UPLOADS, r.file), { force: true }); db.prepare('DELETE FROM photos WHERE id=?').run(oldId); }
        else db.prepare('UPDATE photos SET status=? WHERE id=?').run(action === 'approve' ? 'approved' : 'rejected', oldId);
        return send(res, 200, { ok: true });
      }
      if (action === 'delete') {
        if (table === 'photos') {
          const rows = await supabaseRequest('photos', 'GET', `select=telegram_message_id&id=eq.${id}&limit=1`);
          if (rows?.[0]?.telegram_message_id && TELEGRAM_BOT_TOKEN && TELEGRAM_CHANNEL_ID) {
            try { await telegramRequest('deleteMessage', { chat_id: TELEGRAM_CHANNEL_ID, message_id: rows[0].telegram_message_id }); }
            catch (e) { console.error('Telegram message could not be deleted; removing database record anyway.'); }
          }
        }
        await supabaseRequest(table, 'DELETE', `id=eq.${id}`, undefined, 'return=minimal');
      } else if (table !== 'rsvps') {
        await supabaseRequest(table, 'PATCH', `id=eq.${id}`, { status: action === 'approve' ? 'approved' : 'rejected' }, 'return=minimal');
      }
      return send(res, 200, { ok: true });
    }

    // Image proxy: numeric IDs are Telegram/Supabase photos; filenames are old local photos.
    if (p.startsWith('/uploads/')) {
      const fileKey = decodeURIComponent(p.slice('/uploads/'.length));
      if (/^\d+$/.test(fileKey)) {
        const id = Number(fileKey);
        if (id >= LEGACY_PHOTO_OFFSET) {
          const oldId = id - LEGACY_PHOTO_OFFSET;
          const old = db.prepare('SELECT file,status FROM photos WHERE id=?').get(oldId);
          if (!old || (old.status !== 'approved' && !isAdmin(req))) { res.writeHead(404); return res.end(); }
          res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' });
          return fs.createReadStream(path.join(UPLOADS, old.file)).pipe(res);
        }
        const rows = await supabaseRequest('photos', 'GET', `select=telegram_file_id,status&id=eq.${id}&limit=1`);
        const row = rows?.[0];
        if (!row || (row.status !== 'approved' && !isAdmin(req))) { res.writeHead(404); return res.end(); }
        return await getTelegramPhoto(row.telegram_file_id, res);
      }
      const safeFile = path.basename(fileKey);
      const old = db.prepare('SELECT status FROM photos WHERE file=?').get(safeFile);
      if (!old || (old.status !== 'approved' && !isAdmin(req))) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' });
      return fs.createReadStream(path.join(UPLOADS, safeFile)).pipe(res);
    }

    // Static files
    const rel = p === '/' || p === '/photos' ? '/index.html' : p === '/admin' ? '/admin.html' : p;
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: e.message && /storage is not configured|not configured/i.test(e.message) ? e.message : 'Something went wrong on the server. Please try again later.' });
    else res.end();
  }
}).listen(PORT, () => console.log(`Wedding site listening on port ${PORT}; admin ${ADMIN_PASSWORD ? 'enabled' : 'DISABLED (set ADMIN_PASSWORD)'}`));
