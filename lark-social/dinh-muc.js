'use strict';
/**
 * ĐỊNH MỨC BÀI/THÁNG theo kênh — tiến độ "đã đăng bao nhiêu trên mức tối thiểu".
 *
 * Bảng định mức nằm ở một Base RIÊNG do anh Hùng tự giữ (xem cfg.dinhMuc). App
 * chỉ đọc. Hai cột đều là ô chữ:
 *   - Kênh: gõ tay kiểu "FB Tour đảo", "Tiktok Vi vu" — KHÔNG có ID kênh.
 *   - Số lượng bài/tháng: "120", hoặc câu như "Không thể đảm bảo số lượng".
 *
 * Số đã đăng đếm từ bảng Bài đăng của Social (mọi loại: video, reels, ảnh, bài
 * viết), theo NGÀY ĐĂNG trong tháng dương lịch — không lấy cột Bài của bảng số
 * liệu ngày, vì Facebook không trả số bài theo ngày.
 */
const cfg = require('./config');
const lark = require('./lark');
const store = require('./store');

/* ---------------- ghép tên gõ tay → kênh thật ---------------- */

const boDau = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

const tu = (s) => boDau(s).split(/[^a-z0-9]+/).filter(Boolean);

/* Chữ chỉ nền tảng ở đầu tên. Bỏ khỏi phần so tên, chỉ dùng để chọn nền tảng. */
const NEN_TANG = [
  [/^(fb|facebook|face)$/, 'Facebook'],
  [/^(tiktok|tt|tik)$/, 'TikTok'],
  [/^(instagram|insta|ig)$/, 'Instagram'],
  [/^(zalo|oa)$/, 'Zalo OA'],
  [/^(youtube|yt)$/, 'YouTube'],
];

function tachTen(ten) {
  let nenTang = '';
  const con = [];
  tu(ten).forEach((w) => {
    const m = NEN_TANG.find(([re]) => re.test(w));
    if (m) { if (!nenTang) nenTang = m[1]; } else con.push(w);
  });
  return { nenTang, tu: con };
}

/**
 * Chọn kênh khớp nhất với một tên gõ tay.
 *
 * Điểm = số chữ của tên gõ tay có trong tên/handle kênh. Hoà điểm thì lấy kênh
 * THỪA ÍT chữ nhất: "Tiktok Rooty Trip" phải về "Rooty Trip Phú Quốc", không về
 * "Rooty Trip Phú Quốc 2" — cả hai đều chứa "rooty trip". Nền tảng chỉ có một
 * kênh (Instagram) thì tên trơn "Instagram" cũng ghép được.
 *
 * Trả null khi không chắc: thà hiện "chưa ghép được kênh" còn hơn đếm nhầm bài
 * của kênh khác vào định mức.
 */
function ghepKenh(ten, channels) {
  const { nenTang, tu: chu } = tachTen(ten);
  const ung = channels.filter((c) => !nenTang || c.platform === nenTang);
  if (!ung.length) return null;
  if (!chu.length) return ung.length === 1 ? ung[0] : null;

  let tot = null;
  ung.forEach((c) => {
    const cuaKenh = new Set([...tu(c.name), ...tu(c.handle)]);
    const tenKenh = tu(c.name);
    const diem = chu.filter((w) => cuaKenh.has(w)).length;
    if (!diem) return;
    const thua = tenKenh.filter((w) => !chu.includes(w)).length;
    if (!tot || diem > tot.diem || (diem === tot.diem && thua < tot.thua)) {
      tot = { c, diem, thua, hoa: false };
    } else if (diem === tot.diem && thua === tot.thua) {
      tot.hoa = true;
    }
  });
  if (!tot || tot.hoa) return null;
  /* Khớp dưới nửa số chữ là đoán mò ("Tiktok Phú Quốc mới" khớp mọi kênh có
   * "phu quoc"). */
  if (tot.diem * 2 < chu.length) return null;
  return tot.c;
}

/* ---------------- đọc bảng định mức ---------------- */

/** "120" → 120 · "1.200" → 1200 · câu chữ → null (giữ câu làm ghi chú). */
function docSo(v) {
  const s = store.clean(v);
  if (!s) return { so: null, ghiChu: '' };
  if (/^\d[\d.,\s]*$/.test(s)) {
    const n = Number(s.replace(/[.,\s]/g, ''));
    if (Number.isFinite(n) && n > 0) return { so: n, ghiChu: '' };
  }
  return { so: null, ghiChu: s };
}

let cache = null;
const TTL = 5 * 60 * 1000;

async function docBang() {
  if (cache && Date.now() - cache.luc < TTL) return cache.ds;
  const D = cfg.dinhMuc;
  const rows = await lark.listAll(D.tableId, D.baseToken);
  const ds = rows.map((r) => ({ id: r.id, ten: store.clean(r.c[D.f.kenh]), ...docSo(r.c[D.f.so]) }))
    .filter((x) => x.ten);
  cache = { luc: Date.now(), ds };
  return ds;
}

/* ---------------- tính tiến độ ---------------- */

const soNgayThang = (thang) => {
  const [y, m] = thang.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/**
 * Tiến độ của một tháng. Hàm thuần — test được không cần Base.
 *
 * `canDat` = số bài lẽ ra phải có TÍNH TỚI HÔM NAY nếu rải đều cả tháng. Tháng
 * đã qua thì bằng cả định mức; tháng chưa tới thì 0.
 *
 * Trạng thái: 'dat' đủ định mức · 'kip' đang theo kịp nhịp · 'cham' tụt sau nhịp
 * · 'thieu' tháng đã hết mà chưa đủ · 'khong-so' dòng không có con số.
 */
function tinh({ bang, channels, posts, thang, homNay }) {
  const soNgay = soNgayThang(thang);
  const thangNay = homNay.slice(0, 7);
  const ngayQua = thang < thangNay ? soNgay : (thang > thangNay ? 0 : Number(homNay.slice(8, 10)));
  const daHet = thang < thangNay;

  const dem = new Map();
  posts.forEach((p) => {
    if (!p.date || p.date.slice(0, 7) !== thang) return;
    const k = p.channelExtId;
    if (k) dem.set(k, (dem.get(k) || 0) + 1);
  });

  const dong = bang.map((x) => {
    const c = ghepKenh(x.ten, channels);
    const da = c ? (dem.get(c.extId) || 0) : 0;
    const out = {
      ten: x.ten,
      kenh: c ? { name: c.name, platform: c.platform, extId: c.extId, url: c.url } : null,
      dinhMuc: x.so,
      ghiChu: x.ghiChu,
      da,
    };
    if (!x.so) return { ...out, trangThai: 'khong-so' };
    const canDat = Math.round((x.so * ngayQua) / soNgay);
    const conThieu = Math.max(0, x.so - da);
    const ngayCon = soNgay - ngayQua;
    let trangThai;
    if (da >= x.so) trangThai = 'dat';
    else if (daHet) trangThai = 'thieu';
    else if (da >= canDat) trangThai = 'kip';
    else trangThai = 'cham';
    return {
      ...out,
      canDat,
      tyLe: da / x.so,
      conThieu,
      /* Mỗi ngày còn lại phải đăng bao nhiêu để kịp — câu hỏi thật của người làm. */
      moiNgay: ngayCon > 0 ? conThieu / ngayCon : 0,
      trangThai,
    };
  });

  return { thang, soNgay, ngayQua, daHet, dong };
}

/**
 * Tiến độ cho giao diện. `channels` (danh sách extId/tên được xem) và
 * `platforms` lọc giống mọi số khác của app — người chỉ được xem hai kênh thì
 * chỉ thấy định mức của hai kênh đó; dòng chưa ghép được kênh chỉ quản lý thấy.
 */
async function tienDo({ thang, platforms, channels, laQuanLy }) {
  const d = await store.tai();
  const homNay = store.homNay();
  const th = /^\d{4}-\d{2}$/.test(thang || '') ? thang : homNay.slice(0, 7);
  let bang;
  try {
    bang = await docBang();
  } catch (e) {
    return { thang: th, loi: 'Chưa đọc được bảng định mức: ' + e.message, dong: [], url: cfg.dinhMuc.url };
  }
  const kq = tinh({ bang, channels: d.channels, posts: d.posts, thang: th, homNay });
  const pset = platforms && platforms.length ? new Set(platforms) : null;
  const cset = channels && channels.length ? new Set(channels) : null;
  kq.dong = kq.dong.filter((x) => {
    if (!x.kenh) return !!laQuanLy && !pset && !cset;
    if (pset && !pset.has(x.kenh.platform)) return false;
    if (cset && !cset.has(x.kenh.extId) && !cset.has(x.kenh.name)) return false;
    return true;
  });
  kq.url = laQuanLy ? cfg.dinhMuc.url : '';
  return kq;
}

module.exports = { ghepKenh, docSo, tinh, tienDo, soNgayThang };
