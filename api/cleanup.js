const { getCol, getSession } = require('./_lib');

const DAY = 24 * 3600 * 1000;
const SAFE_ID = /^[A-Za-z0-9_-]{1,60}$/;

module.exports = async (req, res) => {
  try {
    // อนุญาตเฉพาะ: ระบบตั้งเวลาของ Vercel (มี CRON_SECRET) หรือ Head Admin ที่ล็อกอินอยู่
    const auth = req.headers.authorization || '';
    const viaCron = !!process.env.CRON_SECRET && auth === 'Bearer ' + process.env.CRON_SECRET;
    const sess = getSession(req);
    const viaHead = !!sess && sess.role === 'head_admin';
    if (!viaCron && !viaHead) return res.status(401).json({ error: 'Unauthorized' });

    const dry = !!(req.query && req.query.dry === '1');
    const col = await getCol();
    const cutoffMs = Date.now() - 365 * DAY;
    const cutoff = new Date(cutoffMs).toISOString().slice(0, 10); // YYYY-MM-DD

    const arr = async (key) => {
      const d = await col.findOne({ _id: key });
      return Array.isArray(d && d.value) ? d.value : [];
    };

    // 1) งานที่จัดก่อนวันตัด (นับเฉพาะงานที่มีวันที่รูปแบบถูกต้อง)
    const events = await arr('EVENTS');
    const oldEvents = events.filter(e => e && /^\d{4}-\d{2}-\d{2}$/.test(e.d || '') && e.d < cutoff);
    const oldIds = oldEvents.map(e => e.id).filter(id => typeof id === 'string');

    // 2) ข้อมูลที่ผูกกับงานเหล่านั้น
    const tickets = await arr('TICKETS');
    const oldTickets = tickets.filter(t => t && t.evId && oldIds.includes(t.evId));
    const maps = await arr('SEATMAPS');
    const oldMaps = maps.filter(m => m && oldIds.includes(m.evId));
    const commu = await arr('COMMU');
    const oldCommu = commu.filter(c => {
      const m = /^cm_(\d{10,})$/.exec((c && c.id) || '');
      return !!m && Number(m[1]) < cutoffMs;
    });

    const report = {
      cutoff, dry,
      events: oldEvents.length,
      tickets: oldTickets.length,
      seatmaps: oldMaps.length,
      commu: oldCommu.length
    };

    if (!dry) {
      // ใช้คำสั่ง $pull (ลบเฉพาะรายการ) เพื่อไม่ไปทับข้อมูลที่แอดมินเพิ่งแก้
      if (oldEvents.length)
        await col.updateOne({ _id: 'EVENTS' }, { $pull: { value: { d: { $regex: '^\\d{4}-\\d{2}-\\d{2}$', $lt: cutoff } } } });
      if (oldTickets.length)
        await col.updateOne({ _id: 'TICKETS' }, { $pull: { value: { evId: { $in: oldIds } } } });
      if (oldMaps.length)
        await col.updateOne({ _id: 'SEATMAPS' }, { $pull: { value: { evId: { $in: oldIds } } } });
      if (oldCommu.length)
        await col.updateOne({ _id: 'COMMU' }, { $pull: { value: { id: { $in: oldCommu.map(c => c.id) } } } });

      // เอารหัสงานเก่าออกจากแพลนของสมาชิกด้วย
      const ids = oldIds.filter(id => SAFE_ID.test(id));
      if (ids.length) {
        const unset = {};
        ids.forEach(id => { unset['value.' + id] = ''; });
        await col.updateMany({ _id: { $regex: '^plan:' } }, { $unset: unset });
      }
    }
    return res.status(200).json(report);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
};
