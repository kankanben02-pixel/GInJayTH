const { getSession } = require('./_lib');

const MAX_ADMIN = 4 * 1024 * 1024; // แอดมิน/Head Admin 4MB
const MAX_USER = 2 * 1024 * 1024;  // สมาชิก 2MB

function detectType(b) {
  if (b.length < 12) return null;
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
  if (b.slice(0, 4).toString() === 'GIF8') return 'image/gif';
  if (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}
const fail = (res, code, message) => res.status(code).json({ error: { message } });

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');

    let sameSite = false;
    try { sameSite = new URL(req.headers.origin || '').host === req.headers.host; } catch (e) {}
    if (!sameSite) return fail(res, 403, 'Origin not allowed');

    if (!process.env.IMGBB_KEY) return fail(res, 500, 'IMGBB_KEY is not set on the server');

    const sess = getSession(req);
    if (!sess) return fail(res, 401, 'Please log in first'); // ต้องล็อกอินจริงเท่านั้น
    const isAdmin = sess.role === 'admin' || sess.role === 'head_admin';
    const limit = isAdmin ? MAX_ADMIN : MAX_USER;

    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > limit) return fail(res, 413, 'File too large (max ' + (limit / 1048576) + 'MB)');
      chunks.push(c);
    }
    const buf = Buffer.concat(chunks);

    const type = detectType(buf);
    if (!type) return fail(res, 415, 'Only JPG, PNG, WEBP, GIF allowed');

    const form = new FormData();
    form.append('image', new Blob([buf], { type }), 'upload');
    const r = await fetch('https://api.imgbb.com/1/upload?key=' + process.env.IMGBB_KEY, { method: 'POST', body: form });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data || !data.success)
      return fail(res, 502, (data && data.error && data.error.message) || 'ImgBB upload failed');

    return res.status(200).json({ success: true, data: { url: data.data.url } });
  } catch (e) {
    console.error(e);
    return fail(res, 500, 'Server error');
  }
};
