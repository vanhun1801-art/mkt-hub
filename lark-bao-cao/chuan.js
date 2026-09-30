'use strict';
/**
 * Chuẩn làm việc theo VỊ TRÍ — chấm một phiếu ngày có "phân bổ" đúng và "sản
 * lượng" đủ hay không.
 *
 * Số mặc định do anh Hùng chốt 30/09/2026, sau khi đọc 184 bảng báo cáo ảnh chụp
 * trong nhóm Phòng MKT (tháng 5 + nửa cuối tháng 9):
 *   - chung mọi vị trí: ≥ 80% thời gian cho việc chính, ≤ 20% việc phụ
 *   - Editor 2,5 video · Content 3 kịch bản + 4 bài đăng + 2 clip ·
 *     Designer 2 thiết kế + tối thiểu 500 ảnh hậu kỳ · Website 5 đầu việc
 * Quản lý chỉnh được hết ở tab Thiết lập; bản chỉnh lưu ở bảng "Thiết lập" trên
 * Base (ổ Render mất sau mỗi deploy).
 *
 * Hai quyết định định hình file này:
 *   1. "Lỗi máy / mất điện" KHÔNG tính vào mẫu số. Đọc ảnh chụp thấy Pinky ngày
 *      nào cũng mất 30–150 phút vì Capcut, Ngọc/Hằng mất cả buổi vì cúp điện —
 *      chấm thời gian đó là "phân bổ kém" là phạt người vì máy hỏng.
 *   2. Sản lượng đếm theo PHẦN TIẾN ĐỘ TĂNG TRONG NGÀY, không đếm dòng. Editor
 *      dựng kiểu gối đầu: hôm nay clip A 50%, mai "dựng tiếp" lên 100%. Đếm dòng
 *      thì clip A được tính hai lần; đếm phần tăng thì mỗi ngày được 0,5.
 */
const cfg = require('./config');
const lark = cfg.mode === 'api' ? require('./larkapi') : require('./lark');

const KHOA = 'chuan-vi-tri';
const NHOM_BO = ['Lỗi máy / mất điện'];

const MAC_DINH = {
  chinhToiThieu: 80,
  phuToiDa: 20,
  /* Lệch chuẩn trong biên này là "Lưu ý", quá biên là "Lệch". */
  bien: 10,
  nhomPhu: ['Họp', 'Báo cáo', 'Khác'],
  hienTrongThe: true,
  /* Lời nhắn ở dòng cuối thẻ gửi nhóm — anh Hùng 30/09: "đơn giản thôi". Con số
   * chi tiết không lên thẻ (vẫn xem được khi Chấm thử trong tab Thiết lập).
   * {phut} trong câu lỗi máy được thay bằng số phút. */
  /* Ba lần chỉnh 30/09: bản 1 cụt ("Duy trì và phát triển"), bản 2 anh Hùng
   * chê "tình cảm quá". Bản này ở giữa: ngắn, thẳng, có "nhé" cho mềm. */
  loiNhan: {
    tot: 'Duy trì phong độ và tiếp tục phát triển nhé',
    luuY: 'Chú ý hiệu suất công việc và cải thiện thêm nhé',
    lech: 'Tập trung hơn vào việc chính để cải thiện hiệu suất nhé',
    tre: 'Chú ý sắp xếp thời gian để gửi báo cáo đúng hạn nhé',
    loiMay: 'Có {phut} phút lỗi máy / mất điện — cân đối lại công việc nhé',
  },
  viTri: {
    Editor: {
      nhomChinh: ['Edit video', 'Chỉnh ảnh', 'TikTok', 'Livestream', 'Chụp/Quay'],
      sanLuong: [{ ten: 'video', nhom: ['Edit video'], toiThieu: 2.5 }],
      cheDo: 'tat-ca',
    },
    Content: {
      nhomChinh: ['Kịch bản', 'Page', 'TikTok', 'Edit video', 'Chụp/Quay', 'Livestream'],
      sanLuong: [
        { ten: 'kịch bản', nhom: ['Kịch bản'], toiThieu: 3 },
        { ten: 'bài đăng', nhom: ['Page', 'TikTok'], toiThieu: 4 },
        { ten: 'clip', nhom: ['Edit video'], toiThieu: 2 },
      ],
      cheDo: 'tat-ca',
    },
    Designer: {
      nhomChinh: ['Thiết kế', 'Chỉnh ảnh', 'Edit video', 'Chụp/Quay'],
      sanLuong: [
        { ten: 'thiết kế', nhom: ['Thiết kế'], toiThieu: 2 },
        { ten: 'ảnh hậu kỳ', nhom: ['Chỉnh ảnh'], toiThieu: 500, nguon: 'chinh-anh-anh' },
      ],
      cheDo: 'tat-ca',
    },
    Website: {
      nhomChinh: ['Website/SEO', 'OTA', 'Chạy quảng cáo', 'Chatbot'],
      /* "Đầu việc" là số DÒNG việc, không phải số sản phẩm — sửa 30 lỗi technical
       * vẫn là một đầu việc. */
      sanLuong: [{ ten: 'đầu việc', nhom: ['*'], toiThieu: 5, dem: 'dong' }],
      cheDo: 'tat-ca',
    },
    Media: {
      nhomChinh: ['Chụp/Quay', 'Edit video', 'Chỉnh ảnh', 'Livestream'],
      sanLuong: [],
      cheDo: 'tat-ca',
    },
    Ads: {
      nhomChinh: ['Chạy quảng cáo'],
      sanLuong: [],
      cheDo: 'tat-ca',
    },
  },
};

/* Nguồn đếm của một chỉ tiêu. 'chinh-anh-*' lấy thêm số từ app Chỉnh ảnh và
 * lấy SỐ LỚN HƠN giữa hai nguồn — người quên báo bên này vẫn không bị đếm thiếu. */
const NGUON = ['bao-cao', 'chinh-anh-anh', 'chinh-anh-video'];

const so = (v, md) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : md);
const ds = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);

/** Làm sạch một bộ chuẩn — không tin client, và không tin Base (ai cũng sửa tay được). */
function chuanHoa(c) {
  const g = c && typeof c === 'object' ? c : {};
  const out = {
    chinhToiThieu: Math.max(0, Math.min(100, so(g.chinhToiThieu, MAC_DINH.chinhToiThieu))),
    phuToiDa: Math.max(0, Math.min(100, so(g.phuToiDa, MAC_DINH.phuToiDa))),
    bien: Math.max(0, Math.min(50, so(g.bien, MAC_DINH.bien))),
    nhomPhu: g.nhomPhu ? ds(g.nhomPhu) : MAC_DINH.nhomPhu.slice(),
    hienTrongThe: g.hienTrongThe === undefined ? MAC_DINH.hienTrongThe : g.hienTrongThe !== false,
    loiNhan: {},
    viTri: {},
  };
  const ln = g.loiNhan && typeof g.loiNhan === 'object' ? g.loiNhan : {};
  for (const k of Object.keys(MAC_DINH.loiNhan)) {
    const v = typeof ln[k] === 'string' ? ln[k].trim().slice(0, 160) : '';
    out.loiNhan[k] = v || MAC_DINH.loiNhan[k];
  }
  const nguon = g.viTri && typeof g.viTri === 'object' ? g.viTri : MAC_DINH.viTri;
  for (const [ten, v] of Object.entries(nguon)) {
    const k = String(ten).trim().slice(0, 40);
    if (!k || !v || typeof v !== 'object') continue;
    out.viTri[k] = {
      nhomChinh: ds(v.nhomChinh),
      sanLuong: (Array.isArray(v.sanLuong) ? v.sanLuong : []).map((s) => ({
        ten: String((s && s.ten) || '').trim().slice(0, 40),
        nhom: ds(s && s.nhom),
        toiThieu: Math.max(0, so(s && s.toiThieu, 0)),
        dem: s && s.dem === 'dong' ? 'dong' : 'san-pham',
        nguon: NGUON.includes(s && s.nguon) ? s.nguon : 'bao-cao',
      })).filter((s) => s.ten && s.nhom.length && s.toiThieu > 0),
      cheDo: v.cheDo === 'mot-trong' ? 'mot-trong' : 'tat-ca',
    };
  }
  return out;
}

/* ---------------- đọc / lưu ---------------- */

const F = cfg.fields.thietLap;
/* Bảng "Thiết lập" giữ nhiều KHOÁ, mỗi khoá một dòng JSON: 'chuan-vi-tri' (chuẩn)
 * và 'tin-nhom' (cách gửi thẻ báo cáo). Đọc chung một lượt, đệm 60 giây. */
let demTL = { luc: 0, rows: null };

async function docDong(force) {
  if (!force && demTL.rows && Date.now() - demTL.luc < 60000) return demTL.rows;
  const rows = await lark.listAllRecords(cfg.thietLapTableId);
  demTL = { luc: Date.now(), rows };
  return rows;
}

/** Giá trị JSON của một khoá, đã qua `lam` (hàm làm sạch). Base lỗi → mặc định. */
async function docKhoa(khoa, lam, force) {
  try {
    const r = (await docDong(force)).find((x) => String(txt(x.cells[F.khoa.id])).trim() === khoa);
    if (r) { try { return lam(JSON.parse(txt(r.cells[F.giaTri.id]))); } catch (_) { /* hỏng → mặc định */ } }
  } catch (e) {
    console.error('[thiết lập] đọc ' + khoa + ' hỏng: ' + e.message);
  }
  return lam(null);
}

async function luuKhoa(khoa, giaTri, nguoi) {
  const rows = await docDong(true);
  const r = rows.find((x) => String(txt(x.cells[F.khoa.id])).trim() === khoa);
  const cells = {
    [F.khoa.id]: khoa,
    [F.giaTri.id]: JSON.stringify(giaTri),
    [F.suaBoi.id]: (nguoi && (nguoi.ten || nguoi.email)) || '',
    [F.suaLuc.id]: Date.now(),
  };
  if (r) await lark.updateRecord(r.record_id, cells, cfg.thietLapTableId);
  else await lark.createRecord(cells, cfg.thietLapTableId);
  demTL = { luc: 0, rows: null };
  return giaTri;
}

const doc = (force) => docKhoa(KHOA, (x) => chuanHoa(x || MAC_DINH), force);
const luu = (c, nguoi) => luuKhoa(KHOA, chuanHoa(c), nguoi);

/** Ô Base có thể là chuỗi, mảng đoạn chữ, hoặc số — gom về chuỗi. */
function txt(v) {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map((x) => (x && (x.text || x.name)) || (typeof x === 'string' ? x : '')).join('');
  return v.text || v.name || '';
}

/* ---------------- vị trí từng người ---------------- */

let demVT = { luc: 0, ds: null };

/**
 * [{ ten, email, openId, viTri }] từ bảng Phân quyền của hub. Đọc theo TÊN cột
 * rồi tra id, vì app này không giữ field id của Base khác.
 */
async function dsViTri() {
  if (demVT.ds && Date.now() - demVT.luc < 10 * 60000) return demVT.ds;
  const { base, table } = cfg.phanQuyen;
  try {
    const f = await lark.listFields(table, base);
    const id = (ten) => { const x = f.find((y) => (y.field_name || y.name) === ten); return x && (x.field_id || x.id); };
    const iTen = id('Người'), iEmail = id('Email'), iOpen = id('open_id'), iVT = id('Vị trí');
    const rows = await lark.listAllRecords(table, base);
    const out = rows.map((r) => ({
      ten: txt(r.cells[iTen]).trim(),
      email: txt(r.cells[iEmail]).trim().toLowerCase(),
      openId: txt(r.cells[iOpen]).trim(),
      viTri: txt(Array.isArray(r.cells[iVT]) ? r.cells[iVT][0] : r.cells[iVT]).trim(),
    })).filter((x) => x.ten || x.email);
    demVT = { luc: Date.now(), ds: out };
    return out;
  } catch (e) {
    console.error('[chuẩn] đọc Phân quyền hỏng: ' + e.message);
    return demVT.ds || [];
  }
}

const boDau = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ').trim();

/** Vị trí của một người: khớp email, rồi open_id, rồi tên. Không thấy thì ''. */
function viTriCua(bang, nguoi) {
  const e = String((nguoi && nguoi.email) || '').toLowerCase();
  const x = (e && bang.find((y) => y.email === e)) ||
    (nguoi && nguoi.id && bang.find((y) => y.openId === nguoi.id)) ||
    (nguoi && (nguoi.ten || nguoi.tenNguoi) && bang.find((y) => boDau(y.ten) === boDau(nguoi.ten || nguoi.tenNguoi)));
  return (x && x.viTri) || '';
}

/* ---------------- chấm ---------------- */

const khoaViec = (d) => String(d.maViec || '').trim() || ('ten:' + String(d.congViec || '').trim().toLowerCase());
const ptCua = (d) => (d.trangThai === 'Hoàn thành' ? 100 : Math.max(0, Math.min(100, Number(d.tienDoPt) || 0)));

/**
 * Chấm một phiếu ngày.
 *   dong   — các dòng việc của phiếu
 *   viTri  — "Editor" / "Content"…; không có chuẩn cho vị trí đó thì trả null
 *   truoc  — Map khoaViec → tiến độ % lần báo trước (để đếm phần tăng)
 */
function cham(dong, viTri, chuan, truoc = new Map(), ngoai = null) {
  const v = chuan && chuan.viTri && chuan.viTri[viTri];
  if (!v) return null;
  const dung = (dong || []).filter((d) => !NHOM_BO.includes(d.nhom));
  const tong = dung.reduce((s, d) => s + (Number(d.phut) || 0), 0);
  const boPhut = (dong || []).filter((d) => NHOM_BO.includes(d.nhom)).reduce((s, d) => s + (Number(d.phut) || 0), 0);
  const phut = (ks) => dung.filter((d) => ks.includes(d.nhom)).reduce((s, d) => s + (Number(d.phut) || 0), 0);
  const chinhPt = tong ? Math.round(phut(v.nhomChinh) / tong * 100) : null;
  const phuPt = tong ? Math.round(phut(chuan.nhomPhu) / tong * 100) : null;

  const sanLuong = v.sanLuong.map((s) => {
    /* '*' = mọi nhóm TRỪ việc phụ: họp hay làm báo cáo không phải một đầu việc
     * của vị trí (bắt được khi gửi thẻ thử Website 30/09: 5/5 mà chỉ có 2 việc thật). */
    const cua = dung.filter((d) => (s.nhom.includes('*') && !chuan.nhomPhu.includes(d.nhom)) || s.nhom.includes(d.nhom));
    let dat = 0;
    if (s.dem === 'dong') dat = cua.length;
    else {
      for (const d of cua) {
        const sl = Number(d.soLuong) > 0 ? Number(d.soLuong) : 1;
        const tang = Math.max(0, ptCua(d) - (truoc.get(khoaViec(d)) || 0));
        dat += sl * tang / 100;
      }
    }
    let tuApp = null;
    if (ngoai && s.nguon === 'chinh-anh-anh') tuApp = ngoai.anh || 0;
    if (ngoai && s.nguon === 'chinh-anh-video') tuApp = ngoai.video || 0;
    if (tuApp != null) dat = Math.max(dat, tuApp);
    dat = Math.round(dat * 10) / 10;
    return { ten: s.ten, dat, toiThieu: s.toiThieu, ok: dat >= s.toiThieu, tuApp };
  });
  const slOk = !sanLuong.length ? true
    : v.cheDo === 'mot-trong' ? sanLuong.some((s) => s.ok) : sanLuong.every((s) => s.ok);

  let muc = 'tot';
  if (chinhPt != null) {
    const hut = Math.max(chuan.chinhToiThieu - chinhPt, phuPt - chuan.phuToiDa);
    if (hut > chuan.bien) muc = 'lech';
    else if (hut > 0) muc = 'luu-y';
  }
  if (!slOk && muc === 'tot') muc = 'luu-y';
  return { viTri, muc, chinhPt, phuPt, boPhut, sanLuong, slOk, cheDo: v.cheDo,
    chuanChinh: chuan.chinhToiThieu, chuanPhu: chuan.phuToiDa };
}

const NHAN = { tot: '✅ Đạt chuẩn', 'luu-y': '⚠️ Cần lưu ý', lech: '🚨 Lệch chuẩn' };

/** Một dòng cho thẻ Lark / màn hình. */
function veCau(kq) {
  if (!kq) return '';
  const phan = [];
  if (kq.chinhPt != null) phan.push('việc chính ' + kq.chinhPt + '% (chuẩn ≥ ' + kq.chuanChinh + '%)');
  for (const s of kq.sanLuong) {
    phan.push(s.ten + ' ' + String(s.dat).replace('.', ',') + '/' + String(s.toiThieu).replace('.', ',') +
      (s.tuApp ? ' (app Chỉnh ảnh)' : '') + (s.ok ? '' : ' ✗'));
  }
  if (kq.boPhut) phan.push('lỗi máy/mất điện ' + kq.boPhut + ' phút, không tính');
  return NHAN[kq.muc] + ' · ' + kq.viTri + ' — ' + phan.join(' · ');
}

/* ---------------- số từ app Chỉnh ảnh ---------------- */

let demCA = { luc: 0, rows: null };

/** Mốc ms của một ô ngày giờ: api trả số, lark-cli trả chuỗi ISO có múi giờ. */
const msCua = (v) => (typeof v === 'number' ? v : Date.parse(String(v || ''))) || 0;

/**
 * Số ảnh / video một người đã báo trên app Chỉnh ảnh TRONG NGÀY [tu, tu+24h).
 * Tính theo "Báo cáo lúc" (lúc làm xong), không theo ngày tác nghiệp — lô chụp
 * hôm qua chỉnh hôm nay là sản lượng của hôm nay. Một lô nhiều người chỉnh thì
 * chia đều. Khớp theo TÊN bỏ dấu: open_id khác nhau giữa các app Lark.
 */
async function chinhAnhTrongNgay(nguoi, tu) {
  const c = cfg.chinhAnh;
  if (!demCA.rows || Date.now() - demCA.luc > 120000) {
    try {
      demCA = { luc: Date.now(), rows: await lark.listAllRecords(c.table, c.base) };
    } catch (e) {
      console.error('[chuẩn] đọc app Chỉnh ảnh hỏng: ' + e.message);
      return null;
    }
  }
  const ten = boDau(nguoi && (nguoi.ten || nguoi.tenNguoi));
  const email = String((nguoi && nguoi.email) || '').toLowerCase();
  if (!ten && !email) return null;
  const out = { anh: 0, video: 0, lo: 0 };
  for (const r of demCA.rows) {
    const luc = msCua(r.cells[c.f.luc]);
    if (luc < tu || luc >= tu + 86400000) continue;
    const ai = Array.isArray(r.cells[c.f.nguoi]) ? r.cells[c.f.nguoi] : [];
    const co = ai.some((u) => (ten && boDau(u.name) === ten) || (email && String(u.email || '').toLowerCase() === email));
    if (!co) continue;
    const chia = ai.length || 1;
    out.anh += (Number(r.cells[c.f.anh]) || 0) / chia;
    out.video += (Number(r.cells[c.f.video]) || 0) / chia;
    out.lo++;
  }
  out.anh = Math.round(out.anh); out.video = Math.round(out.video);
  return out;
}

const NHAN_NGAN = { tot: '✅ Tốt ·', 'luu-y': '⚠️ Cần lưu ý ·', lech: '⚠️ Cần lưu ý ·' };

/**
 * Lời nhắn cho thẻ gửi nhóm — ngắn, không con số (anh Hùng 30/09):
 *   ✅ Tốt · Duy trì và phát triển
 *   ⏰ Cần chú ý sắp xếp thời gian            ← khi nộp trễ / nộp bù
 *   ⚙️ Có 150 phút lỗi máy / mất điện — cân đối lại công việc
 * `kq` có thể null (vị trí chưa có chuẩn) — khi đó chỉ còn dòng trễ nếu có.
 * Trả mảng dòng; rỗng = không có gì để nhắn.
 */
function loiNhanThe(kq, chuan, { tre = false } = {}) {
  const ln = (chuan && chuan.loiNhan) || MAC_DINH.loiNhan;
  const dong = [];
  if (kq) dong.push(NHAN_NGAN[kq.muc] + ' ' + (kq.muc === 'tot' ? ln.tot : kq.muc === 'lech' ? ln.lech : ln.luuY));
  if (tre) dong.push('⏰ ' + ln.tre);
  if (kq && kq.boPhut) dong.push('⚙️ ' + ln.loiMay.replace('{phut}', kq.boPhut));
  return dong;
}

module.exports = { docKhoa, luuKhoa, txt, loiNhanThe, chinhAnhTrongNgay, NGUON, MAC_DINH, KHOA, NHOM_BO, chuanHoa, doc, luu, dsViTri, viTriCua, cham, veCau, khoaViec, ptCua, NHAN };
