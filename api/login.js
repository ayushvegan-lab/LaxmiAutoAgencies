// Sign in with username and password. Supabase needs an email, so the username is looked up here.
const sb = require('../lib/supabase');
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  if (!sb.configured()) return res.status(500).json({ error: 'The app is not connected to its database yet.' });
  try {
    const b = sb.body(req), wrong = 'Username or password is wrong.';
    const username = sb.cleanUsername(b.username), password = String(b.password || '');
    if (!username || !password) return res.status(401).json({ error: wrong });
    const p = await sb.call('/rest/v1/profiles?select=id,active&username=eq.' + encodeURIComponent(username));
    const row = p.ok && p.json && p.json[0];
    if (!row) return res.status(401).json({ error: wrong });
    if (!row.active) return res.status(403).json({ error: 'This login is switched off. Ask the admin.' });
    const u = await sb.call('/auth/v1/admin/users/' + row.id);
    if (!u.ok || !u.json || !u.json.email) return res.status(401).json({ error: wrong });
    const t = await sb.call('/auth/v1/token?grant_type=password', { method: 'POST', key: sb.PUB, body: { email: u.json.email, password: password } });
    if (!t.ok || !t.json || !t.json.access_token) return res.status(401).json({ error: wrong });
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ access_token: t.json.access_token, refresh_token: t.json.refresh_token, expires_in: t.json.expires_in, user: { id: row.id } });
  } catch (e) {
    res.status(500).json({ error: 'Could not sign in. Try again.' });
  }
};
