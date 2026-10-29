const { getCol, getSession } = require('./_lib');

const ADMIN_KEYS = ['TICKETS', 'SERIES', 'MERCH', 'TRAVEL', 'BW_ORD', 'CUSTOM_TPL'];
const HEAD_KEYS  = ['ABOUT', 'CUSTOM_ADMINS', 'BW_GIFTS'];
const OPEN_KEYS  = ['EVENTS', 'COMMU', 'BW_WISH', 'SEATMAPS'];
const OBJ_KEYS   = ['CUSTOM_TPL'];
const KNOWN = [...ADMIN_KEYS, ...HEAD_KEYS, ...OPEN_KEYS];

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const URLRE = /^https?:\/\/[^\s"'<>]{1,500}$/;
const str = (v, n) => typeof v === 'string'
  ? v.slice(0, n).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '';

const clean = {
  EVENTS(it) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(it.d || '')) return null;
    const o = { id: it.id, d: it.d, artist: ['duo', 'ginny', 'jayna'].includes(it.artist) ? it.artist : 'duo' };
    for (const k of ['time', 'th_t', 'en_t', 'th_c', 'en_c', 'th_v', 'en_v'])
      if (typeof it[k] === 'string') o[k] = str(it[k], 200);
    if (URLRE.test(it.img || '')) o.img = it.img;
    return o.th_t ? o : null;
  },
  COMMU(it) {
    const o = { id: it.id, type: it.type === 'ride' ? 'ride' : 'ticket' };
    for (const k of ['th_b', 'en_b', 'th_t', 'en_t', 'th_d', 'en_d'])
      if (typeof it[k] === 'string') o[k] = str(it[k], 300);
    return (o.th_t && o.th_d) ? o : null;
  },
  BW_WISH(it) {
    const name = str(it.name, 60), text = str(it.text, 1000);
    if (!name || !text) return null;
    return {
      id: it.id, name, text,
      gift: ID.test(String(it.gift)) ? it.gift : 'sunflower',
      to: ['ginny', 'jayna', 'ginjay'].includes(it.to) ? it.to : 'ginjay',
      at: Number.isFinite(it.at) ? it.at : Date.now()
    };
  }
};

// คนทั่วไปจองที่นั่งได้อย่างเดียว แก้/แย่งที่นั่งคนอื่นไม่ได้
function mergeSeats(old, inc) {
  return old.map(om => {
    const nm = inc.find(m => m && m.evId === om.evId);
    if (!nm || !nm.seats || typeof nm.seats !== 'object') return om;
    const seats = { ...(om.seats || {}) };
    let n = 0;
    for (const [k, v] of Object.entries(nm.seats)) {
      if (n >= 3) break;
      if (k in seats || !ID.test(k) || !v || typeof v !== 'object') continue;
      seats[k] = { user: str(v.user, 40), flag: str(v.flag, 8), msg: str(v.msg, 60) };
      n++;
    }
    return { ...om, seats };
  });
}

// กฎของคนที่ไม่ใช่แอดมิน: เพิ่มได้อย่างเดียว ลบ/แก้ของเดิมไม่ได้
function mergeOpen(key, old, inc) {
  if (!Array.isArray(inc)) return null;
  if (key === 'SEATMAPS') return Array.isArray(old) ? mergeSeats(old, inc) : null;

  const base = Array.isArray(old) ? old : [];
  if (base.length >= 500) return null;
  const have = new Set(base.map(x => x && x.id));
  const fresh = [];
  for (const it of inc) {
    if (fresh.length >= 5) break;
    if (!it || typeof it !== 'object' || !ID.test(String(it.id)) || have.has(it.id)) continue;
    const c = clean[key](it);
    if (c) { fresh.push(c); have.add(c.id); }
  }
  return key === 'COMMU' ? [...fresh, ...base] : [...base, ...fresh];
}

module.exports = async (req, res) => {
  try {
    const col = await getCol();
    const sess = getSession(req);
    const role = sess ? sess.role : 'guest';
    const isHead = role === 'head_admin';
    const isAdmin = isHead || role === 'admin';

    if (req.method === 'GET') {
      const docs = await col.find({}).toArray();
      const out = {};
      for (const d of docs) {
        if (d._id === 'CUSTOM_ADMINS' && !isHead) continue; // รหัสแอดมินเสริม เห็นเฉพาะ Head Admin
        out[d._id] = d.value;
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(out);
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'Bad request' });

    const saved = [], denied = [];
    for (const key of Object.keys(body)) {
      const inc = body[key];
      if (!KNOWN.includes(key)) { denied.push(key); continue; }

      const okType = OBJ_KEYS.includes(key)
        ? (inc && typeof inc === 'object' && !Array.isArray(inc))
        : Array.isArray(inc);
      if (!okType || JSON.stringify(inc).length > (isAdmin ? 4000000 : 1500000)) { denied.push(key); continue; }

      const doc = await col.findOne({ _id: key });
      const old = doc ? doc.value : undefined;
      if (JSON.stringify(old) === JSON.stringify(inc)) continue;

      let value;
      if (HEAD_KEYS.includes(key)) {
        if (!isHead) { denied.push(key); continue; }
        value = inc;
      } else if (ADMIN_KEYS.includes(key)) {
        if (!isAdmin) { denied.push(key); continue; }
        value = inc;
      } else {
        value = isAdmin ? inc : mergeOpen(key, old, inc);
        if (value === null) { denied.push(key); continue; }
      }
      if (JSON.stringify(old) === JSON.stringify(value)) continue;

      await col.updateOne({ _id: key }, { $set: { value } }, { upsert: true });
      saved.push(key);
    }

    if (denied.length && !saved.length) return res.status(403).json({ error: 'Forbidden', denied });
    return res.status(200).json({ saved, denied });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
};
