'use strict';
/**
 * Trao đổi trên việc liên phòng = CHÍNH luồng trao đổi của Rooty Workspace (15/10/2026).
 *
 * Anh Hùng: "nhắn tin trong đổi trong mkt hub thì bên kia cũng y chang không khác".
 * Tài liệu: "API Rooty Workspace — tài liệu cho Marketing Hub" v1 15/10/2026 (anh Đạt, HCNS).
 *
 * KHÔNG chép qua chép lại. Một việc liên phòng (mã GV-…/CV-…) chỉ có MỘT luồng tin, nằm
 * bên Rooty Workspace:
 *   - mở tab Trao đổi → đọc thẳng GET /api/tasks/:id (comments cũ → mới);
 *   - gửi trong Hub    → POST /api/tasks/:id/comments, tin mang tên người gửi (X-User-Email),
 *     bên đó tự báo Lark cho người liên quan nên Hub không báo thêm.
 * Chép hai nơi thì sớm muộn hai bên lệch nhau; đọc một nguồn thì không lệch được.
 *
 * Mỗi lời gọi đi kèm email của người đang xem: bên kia xử lý y như chính người đó mở app
 * (thấy đúng quyền của họ, tin mang tên họ, người đã nghỉ thì bị từ chối).
 *
 * Mã khoá chỉ ở máy chủ: biến môi trường RW_KEY. Không có thì cả module im, Hub dùng
 * bảng Bình luận của phòng như trước. Tắt tay: RW_TAT=1.
 */
const GOC = (process.env.RW_URL || 'https://rooty-workspace.onrender.com').replace(/\/+$/, '');
/* Mã khoá: biến môi trường (Render), hoặc tệp rw.env cạnh tệp này khi chạy trên máy —
 * tệp đó bị .gitignore (*.env) chặn nên không bao giờ lên git. Dòng: RW_KEY=<mã>. */
let khoaTep = null;
function docTep() {
  if (process.env.RW_KHONG_TEP === '1') return '';
  if (khoaTep !== null) return khoaTep;
  khoaTep = '';
  try {
    const t = require('fs').readFileSync(require('path').join(__dirname, 'rw.env'), 'utf8');
    const m = t.match(/^\s*RW_(?:API_)?KEYS?\s*=\s*(\S+)/m);
    if (m) khoaTep = m[1];
  } catch (_) { /* không có tệp */ }
  return khoaTep;
}
const KHOA = () => process.env.RW_KEY || process.env.RW_API_KEYS || process.env.RW_API_KEY || docTep();
const bat = () => !!KHOA() && process.env.RW_TAT !== '1';
const HAN_MS = 15000;

/* Trần 120 lượt/phút cho mỗi mã khoá. Giữ dưới 100 (một lượt mỗi 600ms) để chừa chỗ:
 * tab Trao đổi nạp lại 15 giây một lần cho MỖI người đang mở, cộng dồn lại khá nhanh. */
const KHOANG = Number(process.env.RW_KHOANG_MS || 600);
let mocKe = 0;
async function xinLuot() {
  const now = Date.now();
  const moc = Math.max(now, mocKe);
  mocKe = moc + KHOANG;
  if (moc > now) await new Promise((r) => setTimeout(r, moc - now));
}

class LoiRW extends Error {
  constructor(msg, status, code) { super(msg); this.status = status; this.code = code; }
}

async function goi(duong, email, { method = 'GET', body } = {}) {
  if (!bat()) throw new LoiRW('Chưa nối Rooty Workspace (thiếu RW_KEY).', 0, 'tat');
  if (!email) throw new LoiRW('Không biết email Lark của bạn nên Rooty Workspace không nhận. Đăng nhập lại Marketing Hub rồi thử lại.', 0, 'khong_email');
  await xinLuot();
  let r;
  try {
    r = await fetch(GOC + duong, {
      method,
      headers: Object.assign({ 'X-Api-Key': KHOA(), 'X-User-Email': email, Accept: 'application/json' },
        body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(HAN_MS),
    });
  } catch (e) {
    throw new LoiRW('Không nối được Rooty Workspace (' + (e && e.name === 'TimeoutError' ? 'hết giờ chờ' : 'mạng') + '). Thử lại sau ít phút.', 0, 'mang');
  }
  let j = null;
  try { j = await r.json(); } catch (_) { /* thân rỗng */ }
  if (!r.ok) {
    /* Bên kia trả câu giải thích tiếng Việt sẵn — đưa nguyên cho người dùng đọc. */
    throw new LoiRW((j && j.error) || ('Rooty Workspace trả lỗi ' + r.status), r.status, j && j.code);
  }
  return j || {};
}

/* Mã GV → id số của bên kia. Mã không đổi nên nhớ lâu. Nhớ theo mã, không theo người:
 * quyền xem vẫn được kiểm ở lời gọi đọc/gửi tin, đi kèm email của từng người. */
const idTheoMa = new Map();
async function timId(ma, email) {
  const c = idTheoMa.get(ma);
  if (c) return c;
  const j = await goi('/api/v1/tasks/by-code/' + encodeURIComponent(ma), email);
  if (!j.id) throw new LoiRW('Rooty Workspace không có việc ' + ma + '.', 404, 'khong_co');
  idTheoMa.set(ma, j.id);
  return j.id;
}

/* Đệm 8 giây theo (việc, người): mở nhiều thẻ, hay hai lần nạp sát nhau, chỉ tốn một lượt. */
const dem = new Map();
const DEM_MS = 8000;

function tep(f) {
  if (!f) return [];
  try { const a = typeof f === 'string' ? JSON.parse(f) : f; return Array.isArray(a) ? a : []; } catch (_) { return []; }
}

/**
 * Luồng trao đổi của việc `ma`, đổi sang đúng khuôn bình luận của Bảng công việc.
 * `toi` = { id, name, email } người đang xem — để tin của chính họ nằm bên phải.
 */
async function traoDoi(ma, toi, { moi = false } = {}) {
  const khoa = ma + '|' + toi.email;
  const c = dem.get(khoa);
  if (!moi && c && Date.now() - c.luc < DEM_MS) return c.ds;
  const id = await timId(ma, toi.email);
  const j = await goi('/api/tasks/' + id, toi.email);
  const ten = chuan(toi.name);
  const ds = (j.comments || []).map((x) => {
    const files = tep(x.files);
    const cuaToi = !!ten && chuan(x.author_name) === ten;
    return {
      id: 'rw-' + x.id,
      nguon: 'rw',
      content: String(x.body || '') +
        /* API chưa cho tải tệp qua Hub: nói tên tệp và chỗ mở, đừng để tin như thiếu chữ. */
        (files.length ? '\n📎 ' + files.map((f) => f.name).filter(Boolean).join(', ') + ' (mở trên Rooty Workspace)' : ''),
      /* Tin của chính người xem mang id của họ để giao diện xếp bên phải như tin Hub. */
      author: [{ id: cuaToi ? toi.id : 'rw:' + x.author_id, name: x.author_name || 'Không rõ' }],
      at: Number(x.created_at) || null,
    };
  });
  dem.set(khoa, { luc: Date.now(), ds });
  if (dem.size > 500) dem.delete(dem.keys().next().value);
  return ds;
}

/** Gửi một tin vào luồng của việc `ma`, mang tên người có email `email`. */
async function gui(ma, email, noiDung) {
  const id = await timId(ma, email);
  await goi('/api/tasks/' + id + '/comments', email, { method: 'POST', body: { body: noiDung } });
  for (const k of dem.keys()) if (k.startsWith(ma + '|')) dem.delete(k);
  return { ok: true, id };
}

function chuan(s) { return String(s || '').normalize('NFC').trim().toLowerCase(); }

/* Chỉ dùng trong kiểm thử. */
function _datLai() { idTheoMa.clear(); dem.clear(); mocKe = 0; }

module.exports = { bat, traoDoi, gui, LoiRW, GOC, _datLai };
