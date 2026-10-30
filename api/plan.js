const { getCol, getSession } = require('./_lib');

module.exports = async (req, res) => {
  try {
    const sess = getSession(req);
    if (!sess || !sess.sub) return res.status(401).json({ error: 'Login required' });
    const col = await getCol();
    const _id = 'plan:' + sess.sub;

    if (req.method === 'GET') {
      const d = await col.findOne({ _id });
      return res.status(200).json({ plan: (d && d.value) || {} });
    }
    if (req.method === 'POST') {
      const inc = req.body && req.body.plan;
      if (!inc || typeof inc !== 'object' || Array.isArray(inc)) return res.status(400).json({ error: 'Bad request' });
      const out = {};
      for (const k of Object.keys(inc).slice(0, 300))
        if (/^[A-Za-z0-9_-]{1,40}$/.test(k) && inc[k]) out[k] = 1;
      await col.updateOne({ _id }, { $set: { value: out } }, { upsert: true });
      return res.status(200).json({ plan: out });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
};
