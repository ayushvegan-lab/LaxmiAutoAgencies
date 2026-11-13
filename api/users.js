// Create and edit logins. Only the admin may call this, except for creating the very first admin.
const sb = require('../lib/supabase');
const ROLES = ['sales', 'billing', 'admin'];

module.exports = async function handler(req, res) {
  if (!sb.configured()) return res.status(500).json({ error: 'The app is not connected to its database yet.' });
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') return res.status(200).json({ hasAdmin: await sb.adminExists() });
    const b = sb.body(req);

    if (req.method === 'POST') {
      const first = !(await sb.adminExists());
      if (!first && (await sb.callerRole(req)) !== 'admin') return res.status(403).json({ error: 'Only the admin can add users.' });
      const name = String(b.name || '').trim(), username = sb.cleanUsername(b.username), password = String(b.password || '');
      const role = first ? 'admin' : String(b.role || '');
      if (!name) return res.status(400).json({ error: 'Enter the name.' });
      if (!username) return res.status(400).json({ error: 'Username must be 3 to 30 letters, digits, dots, dashes or underscores.' });
      if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
      if (ROLES.indexOf(role) < 0) return res.status(400).json({ error: 'Choose the user type.' });
      const dup = await sb.call('/rest/v1/profiles?select=id&username=eq.' + encodeURIComponent(username));
      if (dup.ok && dup.json.length) return res.status(400).json({ error: 'That username is already used. Choose another.' });
      const domain = process.env.LOGIN_DOMAIN || String(req.headers.host || 'localhost').split(':')[0];
      const made = await sb.call('/auth/v1/admin/users', { method: 'POST', body: { email: username + '@' + domain, password: password, email_confirm: true } });
      if (!made.ok || !made.json || !made.json.id) return res.status(400).json({ error: sb.errText(made, 'Could not create the login.') });
      const prof = await sb.call('/rest/v1/profiles', { method: 'POST', body: { id: made.json.id, name: name, username: username, role: role } });
      if (!prof.ok) {
        await sb.call('/auth/v1/admin/users/' + made.json.id, { method: 'DELETE' });
        return res.status(400).json({ error: sb.errText(prof, 'Could not save the user.') });
      }
      return res.status(200).json({ id: made.json.id, name: name, username: username, role: role, active: true });
    }

    if (req.method === 'PATCH') {
      if ((await sb.callerRole(req)) !== 'admin') return res.status(403).json({ error: 'Only the admin can edit users.' });
      const id = String(b.id || '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Unknown user.' });
      const patch = {};
      if (b.name != null) { patch.name = String(b.name).trim(); if (!patch.name) return res.status(400).json({ error: 'Enter the name.' }); }
      if (b.username != null) {
        patch.username = sb.cleanUsername(b.username);
        if (!patch.username) return res.status(400).json({ error: 'Username must be 3 to 30 letters, digits, dots, dashes or underscores.' });
        const dup = await sb.call('/rest/v1/profiles?select=id&username=eq.' + encodeURIComponent(patch.username) + '&id=neq.' + id);
        if (dup.ok && dup.json.length) return res.status(400).json({ error: 'That username is already used. Choose another.' });
      }
      if (b.password) {
        if (String(b.password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        const pw = await sb.call('/auth/v1/admin/users/' + id, { method: 'PUT', body: { password: String(b.password) } });
        if (!pw.ok) return res.status(400).json({ error: sb.errText(pw, 'Could not change the password.') });
      }
      if (Object.keys(patch).length) {
        const up = await sb.call('/rest/v1/profiles?id=eq.' + id, { method: 'PATCH', body: patch });
        if (!up.ok || !up.json.length) return res.status(400).json({ error: sb.errText(up, 'Could not save the user.') });
      }
      return res.status(200).json(Object.assign({ id: id }, patch));
    }
    res.status(405).json({ error: 'Method not allowed.' });
  } catch (e) {
    res.status(500).json({ error: 'Something went wrong. Try again.' });
  }
};
