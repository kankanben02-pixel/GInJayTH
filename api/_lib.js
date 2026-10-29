const { MongoClient } = require('mongodb');
const crypto = require('crypto');

let clientPromise = null;
async function getCol() {
  if (!clientPromise) {
    clientPromise = new MongoClient(process.env.MONGODB_URI).connect();
    clientPromise.catch(() => { clientPromise = null; });
  }
  const client = await clientPromise;
  return client.db('ginjay').collection('store');
}

const mac = (body) =>
  crypto.createHmac('sha256', process.env.SESSION_SECRET).update(body).digest('base64url');

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return body + '.' + mac(body);
}

function getSession(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const a = Buffer.from(sig), b = Buffer.from(mac(body));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}

function safeEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

module.exports = { getCol, sign, getSession, safeEq };
