// Shared helpers for the server functions. The secret key never leaves the server.
const BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const PUB = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const SECRET = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function call(path, opts) {
  const o = opts || {};
  const key = o.key || SECRET;
  const res = await fetch(BASE + path, {
    method: o.method || 'GET',
    headers: { apikey: key, Authorization: 'Bearer ' + (o.bearer || key), 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: o.body ? JSON.stringify(o.body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
  return { ok: res.ok, status: res.status, json: json };
}
function errText(r, fallback) {
  const j = r.json || {};
  return j.msg || j.message || j.error_description || j.error || fallback;
}
function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch (e) { return {}; }
}
function configured() { return !!(BASE && PUB && SECRET); }

// Role of the person calling, from their session token. Null if not signed in or switched off.
async function callerRole(req) {
  const h = req.headers.authorization || '';
  const jwt = h.indexOf('Bearer ') === 0 ? h.slice(7) : '';
  if (!jwt) return null;
  const u = await call('/auth/v1/user', { key: PUB, bearer: jwt });
  if (!u.ok || !u.json || !u.json.id) return null;
  const p = await call('/rest/v1/profiles?select=role,active&id=eq.' + encodeURIComponent(u.json.id));
  const row = p.ok && p.json && p.json[0];
  return row && row.active ? row.role : null;
}
async function adminExists() {
  const r = await call('/rest/v1/profiles?select=id&role=eq.admin&active=is.true&limit=1');
  if (!r.ok) throw new Error(errText(r, 'Database is not reachable'));
  return r.json.length > 0;
}
function cleanUsername(v) {
  const u = String(v || '').trim().toLowerCase();
  return /^[a-z0-9._-]{3,30}$/.test(u) ? u : '';
}

module.exports = { BASE, PUB, SECRET, call, errText, body, configured, callerRole, adminExists, cleanUsername };
