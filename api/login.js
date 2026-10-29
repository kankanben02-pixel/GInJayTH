const { getCol, sign, safeEq } = require('./_lib');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { u, p } = req.body || {};
    if (typeof u !== 'string' || typeof p !== 'string') return res.status(400).json({ error: 'Bad request' });

    let role = null;
    if (safeEq(u, process.env.HEAD_ADMIN_USER) && safeEq(p, process.env.HEAD_ADMIN_PASS)) {
      role = 'head_admin';
    } else {
      const col = await getCol();
      const doc = await col.findOne({ _id: 'CUSTOM_ADMINS' });
      const list = (doc && Array.isArray(doc.value)) ? doc.value : [];
      if (list.some(a => safeEq(a.u, u) && safeEq(a.p, p))) role = 'admin';
    }
    if (!role) {
      await new Promise(r => setTimeout(r, 700));
      return res.status(401).json({ error: 'Wrong credentials' });
    }
    const token = sign({ role, u, exp: Date.now() + 12 * 3600 * 1000 });
    return res.status(200).json({ role, token });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
};
