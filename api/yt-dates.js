const { getSession } = require('./_lib');

module.exports = async (req, res) => {
  try {
    const sess = getSession(req);
    if (!sess || !(sess.role === 'admin' || sess.role === 'head_admin'))
      return res.status(401).json({ error: 'เฉพาะ Admin / Head Admin' });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const key = (process.env.YOUTUBE_API_KEY || '').trim();
    if (!key) return res.status(500).json({ error: 'YOUTUBE_API_KEY ยังไม่ได้ตั้งค่าใน Vercel (ตั้งแล้วต้อง Redeploy)' });

    const ids = Array.isArray(req.body && req.body.ids)
      ? req.body.ids.filter(x => /^[A-Za-z0-9_-]{11}$/.test(x)).slice(0, 200)
      : [];
    const dates = {};
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const url = 'https://www.googleapis.com/youtube/v3/videos?part=snippet&id=' + chunk.join(',') + '&key=' + encodeURIComponent(key);
      const r = await fetch(url);
      const d = await r.json().catch(() => null);
      if (!r.ok || !d) return res.status(502).json({ error: (d && d.error && d.error.message) || 'YouTube API error' });
      (d.items || []).forEach(it => {
        if (it.id && it.snippet && it.snippet.publishedAt) dates[it.id] = it.snippet.publishedAt;
      });
    }
    return res.status(200).json({ dates });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
};
