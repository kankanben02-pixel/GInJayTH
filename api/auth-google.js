const { OAuth2Client } = require('google-auth-library');
const { sign } = require('./_lib');

const client = new OAuth2Client();
const clean = (s) => String(s).slice(0, 40)
  .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!process.env.GOOGLE_CLIENT_ID) return res.status(500).json({ error: 'GOOGLE_CLIENT_ID is not set' });

    const { credential } = req.body || {};
    if (typeof credential !== 'string' || credential.length > 4000) return res.status(400).json({ error: 'Bad request' });

    // ให้ Google ยืนยันว่าตั๋วนี้ออกให้เว็บเราจริง และยังไม่หมดอายุ
    const ticket = await client.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    const p = ticket.getPayload();
    if (!p || !p.sub || p.email_verified !== true) return res.status(401).json({ error: 'Unverified account' });

    const name = clean(p.name || p.given_name || (p.email || 'member').split('@')[0]);
    const exp = Date.now() + 7 * 24 * 3600 * 1000; // สมาชิกล็อกอินค้างได้ 7 วัน
    const token = sign({ role: 'user', u: name, sub: p.sub, exp });
    return res.status(200).json({ role: 'user', name, token, exp });
  } catch (e) {
    console.error(e);
    return res.status(401).json({ error: 'Google login failed' });
  }
};
