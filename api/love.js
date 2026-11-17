const { getCol } = require('./_lib');

const CAP = 600; // กันการยิงรัว: รับไม่เกิน 600 หัวใจต่อนาที ต่อหนึ่งตัวนับ
const IDS = { all: 'LOVE', ginny: 'LOVE_GINNY', jayna: 'LOVE_JAYNA' };
const pickKey = (v) => (IDS[v] ? v : 'all');

module.exports = async (req, res) => {
  try {
    const col = await getCol();

    if (req.method === 'GET') {
      const k = pickKey(req.query && req.query.k);
      const d = await col.findOne({ _id: IDS[k] });
      res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
      return res.status(200).json({ total: (d && d.total) || 0 });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    let ok = req.headers['sec-fetch-site'] === 'same-origin';
    if (!ok) { try { ok = new URL(req.headers.origin || '').host === req.headers.host; } catch (e) {} }
    if (!ok) return res.status(403).json({ error: 'Origin not allowed' });

    const k = pickKey(req.body && req.body.k);
    const n = Math.min(30, Math.floor(Number(req.body && req.body.n)));
    if (!(n >= 1)) return res.status(400).json({ error: 'Bad request' });

    const now = Date.now();
    const doc = await col.findOneAndUpdate(
      { _id: IDS[k] },
      [
        { $set: {
            c: { $cond: [ { $gt: [ { $subtract: [ now, { $ifNull: ['$w', 0] } ] }, 60000 ] }, 0, { $ifNull: ['$c', 0] } ] },
            w: { $cond: [ { $gt: [ { $subtract: [ now, { $ifNull: ['$w', 0] } ] }, 60000 ] }, now, '$w' ] }
        } },
        { $set: { add: { $min: [ n, { $max: [ 0, { $subtract: [ CAP, '$c' ] } ] } ] } } },
        { $set: { total: { $add: [ { $ifNull: ['$total', 0] }, '$add' ] }, c: { $add: ['$c', '$add'] } } },
        { $unset: 'add' }
      ],
      { upsert: true, returnDocument: 'after' }
    );
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ total: (doc && doc.total) || 0 });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
};
