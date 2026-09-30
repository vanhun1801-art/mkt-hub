'use strict';
/**
 * Lịch làm việc từng người — lấy từ Base "Lịch làm việc MKT" của app
 * lark-lich-lam-viec (bảng Đăng ký tháng: mỗi người một dòng mỗi tháng, 31 cột
 * "Ngày 01…31" giữ mã công).
 *
 * Anh Hùng (30/09/2026): "báo cáo ngày các ngày có lịch làm việc; kết nối với
 * base lịch làm việc để biết" — "đi làm bao nhiêu ngày thì bấy nhiêu báo cáo".
 * Trước đây "ngày thiếu" tính cứng Thứ 2 → Thứ 7, nên người nghỉ phép, nghỉ lễ,
 * đổi OFF sang ngày thường vẫn bị báo thiếu oan.
 *
 * Mã công đang dùng (đếm trên Base 30/09): x · x/2 · OFF · NL (nghỉ lễ) ·
 * NP (nghỉ phép) · KL (không lương) · ô trống.
 *   x, x/2      → ngày ĐI LÀM, phải có báo cáo ngày (nửa ca vẫn báo)
 *   OFF/NL/NP/KL → ngày nghỉ, KHÔNG đòi báo cáo
 *   ô trống / chưa đăng ký tháng đó → KHÔNG BIẾT → lùi về luật cũ (T2–T7)
 */
const cfg = require('./config');
const lark = cfg.mode === 'api' ? require('./larkapi') : require('./lark');

const L = cfg.lichLam;
const LAM = ['x', 'x/2'];
const NGHI = ['OFF', 'NL', 'NP', 'KL'];

const txt = (v) => {
  if (v == null) return '';
  if (Array.isArray(v)) return txt(v[0]);
  if (typeof v === 'object') return v.text || v.name || '';
  return String(v);
};
const boDau = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ').trim();

let dem = { luc: 0, ds: null };

/** [{ thang: 'YYYY-MM', ten, email, ngay: { 1: 'x', 2: 'OFF', … } }] */
async function docHet() {
  if (dem.ds && Date.now() - dem.luc < 10 * 60000) return dem.ds;
  try {
    const rows = await lark.listAllRecords(L.table, L.base);
    const ds = rows.map((r) => {
      const c = r.cells;
      const ngay = {};
      for (const [d, id] of Object.entries(L.ngay)) {
        const v = txt(c[id]).trim();
        if (v) ngay[d] = v;
      }
      return { thang: txt(c[L.f.thang]).trim(), ten: txt(c[L.f.hoTen]).trim(),
        email: txt(c[L.f.email]).trim().toLowerCase(), ngay };
    }).filter((x) => /^\d{4}-\d{2}$/.test(x.thang));
    dem = { luc: Date.now(), ds };
    return ds;
  } catch (e) {
    /* Lịch hỏng thì báo cáo vẫn chạy bằng luật cũ — không để một Base khác làm
     * sập màn Theo dõi. */
    console.error('[lịch làm việc] đọc hỏng: ' + e.message);
    return dem.ds || [];
  }
}

/** 'YYYY-MM' và ngày trong tháng của một mốc ms, giờ Việt Nam. */
function thangNgay(ms) {
  const d = new Date(Number(ms) + 7 * 3600000);
  return { thang: d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'), ngay: d.getUTCDate() };
}

/**
 * Hàm tra lịch của MỘT người: (ms) → true (đi làm) · false (nghỉ) · null (không biết).
 * Khớp email trước, rồi tên bỏ dấu — tháng 9 chép từ sheet HCNS không có email.
 */
function lichCua(ds, nguoi) {
  const email = String((nguoi && nguoi.email) || '').toLowerCase();
  const ten = boDau(nguoi && (nguoi.ten || nguoi.tenNguoi));
  const cua = ds.filter((x) => (email && x.email === email) || (ten && boDau(x.ten) === ten) ||
    /* "Nguyễn Long Khánh (Pinky)" trong báo cáo ↔ "Nguyễn Long Khánh" trong lịch */
    (ten && boDau(x.ten) && ten.startsWith(boDau(x.ten) + ' (')));
  const theoThang = new Map(cua.map((x) => [x.thang, x]));
  return (ms) => {
    const t = thangNgay(ms);
    const x = theoThang.get(t.thang);
    if (!x) return null;
    const ma = x.ngay[t.ngay];
    if (!ma) return null;
    if (LAM.includes(ma)) return true;
    if (NGHI.includes(ma)) return false;
    return null;
  };
}

/** Mã công của một người một ngày ('x', 'OFF'…) hoặc '' — để hiện lên màn. */
function maCong(ds, nguoi, ms) {
  const email = String((nguoi && nguoi.email) || '').toLowerCase();
  const ten = boDau(nguoi && (nguoi.ten || nguoi.tenNguoi));
  const t = thangNgay(ms);
  const x = ds.find((y) => y.thang === t.thang && ((email && y.email === email) || (ten && boDau(y.ten) === ten) ||
    (ten && boDau(y.ten) && ten.startsWith(boDau(y.ten) + ' ('))));
  return (x && x.ngay[t.ngay]) || '';
}

/** Những người có lịch ĐI LÀM ít nhất một ngày trong [tu, den] — kể cả người chưa nộp phiếu nào. */
function coLich(ds, tu, den) {
  const ra = new Map();
  for (let d = tu; d <= den; d += 86400000) {
    const t = thangNgay(d);
    for (const x of ds) {
      if (x.thang === t.thang && LAM.includes(x.ngay[t.ngay])) {
        const k = x.email || boDau(x.ten);
        if (!ra.has(k)) ra.set(k, { ten: x.ten, email: x.email });
      }
    }
  }
  return [...ra.values()];
}

module.exports = { docHet, lichCua, maCong, coLich, thangNgay, boDau, LAM, NGHI };
