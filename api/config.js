// Public connection details for the page. The publishable key is safe to show: the database rules decide access.
const sb = require('../lib/supabase');
module.exports = function handler(req, res) {
  if (!sb.configured()) return res.status(500).json({ error: 'Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY in Vercel, then redeploy.' });
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ url: sb.BASE, key: sb.PUB });
};
