'use strict';
/* Dựng danh sách media từ du-lieu/cay.json — dùng chung cho server và script gắn thẻ,
   để luật loại file nhạy cảm chỉ nằm MỘT chỗ. */
const fs = require('fs');
const path = require('path');

const DL = path.join(__dirname, 'du-lieu');
const bo = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

/* Thư mục chứa dữ liệu cá nhân — không bao giờ vào chỉ mục. Tên thư mục mang số điện thoại
   cũng loại (thư mục "Thông tin nhân sự" đặt tên kiểu "Họ tên - 09xx xxx xxx"). */
const CAM = new Set(['11. du lieu ca nhan', 'thong tin nhan su', 'anh nhan su']);
/* Ảnh giấy tờ tuỳ thân (vd "13. INFLUENCER/<KOL>/CCCD") */
const GIAY_TO = /^(cccd|cmnd|can cuoc|ho chieu|passport|giay to)\b/;
const SO_DT = /(^|[^0-9])0\d{2,3}[ .]?\d{3}[ .]?\d{3,4}([^0-9]|$)/;
const LOAI = { mp4: 'v', mov: 'v', m4v: 'v', jpg: 'a', jpeg: 'a', png: 'a', heic: 'a', webp: 'a', gif: 'a', arw: 'r', dng: 'r', cr2: 'r', cr3: 'r' };
const NAM_TM = /(?:^|[^0-9])(20(?:1[5-9]|2[0-6]))(?:[^0-9]|$)/;
const NAM_TEN = /(20(?:1[5-9]|2[0-6]))(?:0[1-9]|1[0-2])[0-3]\d/;
const nhayCam = seg => seg.some(s => CAM.has(bo(s).trim()) || GIAY_TO.test(bo(s).trim()) || SO_DT.test(s));

/* Bản online không có cay.json (không tự liệt kê được Drive): đọc gói do máy nội bộ đẩy lên
   (dong-bo-len.js) — đã lọc nhạy cảm và gộp bản sao TỪ MÁY NỘI BỘ, ở đây chỉ dựng lại object. */
const GOI = path.join(DL, 'goi-chi-muc.json.gz');
/* KHÔNG giữ nguyên gói đã giải nén (mảng 97 nghìn dòng) — nó nhân đôi RAM so với chỉ mục dựng
   từ nó. Chỉ nhớ phần nhỏ đọc lại nhiều lần (the, lich, dongNghia); mảng items đọc mỗi lần nạp. */
let goiNho = null;
function docGoi(canItems) {
  if (!fs.existsSync(GOI)) return null;
  const st = fs.statSync(GOI);
  if (!canItems && goiNho && goiNho.mtime === st.mtimeMs) return goiNho.goi;
  const goi = JSON.parse(require('zlib').gunzipSync(fs.readFileSync(GOI)));
  const { items, ...nho } = goi;
  goiNho = { mtime: st.mtimeMs, goi: nho };
  return canItems ? goi : nho;
}
function tuGoi() {
  const g = docGoi(true);
  if (!g) return null;
  const chung = new Map();
  const ghim = s => { let v = chung.get(s); if (v === undefined) { v = s; chung.set(s, v); } return v; };
  const lich = g.lich || {};
  const items = g.items.map(([t, ten, duong, loai, nam, mod, tn]) => {
    const seg = duong ? duong.split('/') : [];
    const tenLich = tn && lich[tn] ? ' ' + lich[tn].ten : '';
    return { t, ten, duong: seg.map(ghim), loai, nam: nam || null, mod, tn: tn || null, chuoi: bo(seg.join(' ') + ' ' + ten + tenLich) };
  });
  return { items, tm: new Map(g.tm || []), loaiNhayCam: g.loaiNhayCam || 0, gop: g.gop || 0, lich, quetLuc: g.quetLuc || g.luc, tuGoi: true };
}

function docMedia() {
  const f = path.join(DL, 'cay.json');
  if (!fs.existsSync(f)) return tuGoi();
  const cay = JSON.parse(fs.readFileSync(f, 'utf8'));
  const tm = new Map();
  for (const x of cay) if (x.type === 'folder') tm.set(x.path, x.url);
  /* Media từ lịch tác nghiệp đã hoàn tất (tac-nghiep.js): file chưa có trong lượt quét đêm thì
     thêm ngay; file nào cũng nhớ nó thuộc lịch nào (lịch mới nhất nếu nhiều lịch cùng trỏ). */
  let tn = { lich: {}, thuMuc: {} };
  try { tn = JSON.parse(fs.readFileSync(path.join(DL, 'tac-nghiep.json'), 'utf8')); } catch (e) {}
  const coToken = new Set(cay.filter(x => x.type === 'file').map(x => x.token));
  const tmTheoToken = new Map(cay.filter(x => x.type === 'folder').map(x => [x.token, x.path]));
  const lichCua = new Map();
  for (const [id, l] of Object.entries(tn.lich || {})) {
    for (const t of l.thuMuc || []) {
      const s = (tn.thuMuc || {})[t];
      if (!s) continue;
      const goc = tmTheoToken.get(t) || ('/Tác nghiệp/' + l.ten.replace(/\//g, '-'));
      for (const x of s.files) {
        if (!coToken.has(x.token)) { cay.push({ path: goc + x.path, type: 'file', token: x.token, mod: x.mod }); coToken.add(x.token); }
        const cu = lichCua.get(x.token);
        if (!cu || tn.lich[cu].kt < l.kt) lichCua.set(x.token, id);
      }
    }
  }
  const theoTM = new Map();
  let loaiNhayCam = 0;
  for (const x of cay) {
    if (x.type !== 'file') continue;
    const m = x.path.match(/\.([a-z0-9]{2,4})$/i);
    const loai = m && LOAI[m[1].toLowerCase()];
    if (!loai) continue;
    const seg = x.path.split('/').slice(1);
    const ten = seg.pop();
    if (nhayCam(seg)) { loaiNhayCam++; continue; }
    const k = seg.join('/');
    if (!theoTM.has(k)) theoTM.set(k, []);
    theoTM.get(k).push({ x, ten, seg, loai });
  }
  const items = [];
  let gop = 0;
  /* 97 nghìn file nằm trong ~2.900 thư mục: dùng CHUNG một chuỗi cho mỗi tên thư mục, không để mỗi
     file giữ một bản — bản online chạy chung máy với hub + 12 app, RAM là thứ hiếm nhất */
  const chung = new Map();
  const ghim = s => { let v = chung.get(s); if (v === undefined) { v = s; chung.set(s, v); } return v; };
  for (const ds of theoTM.values()) {
    const co = new Set(ds.map(d => d.ten));
    for (const d of ds) {
      /* "Bản sao của IMG_1.MOV" nằm cạnh "IMG_1.MOV" → chỉ giữ bản gốc */
      if (d.ten.startsWith('Bản sao của ') && co.has(d.ten.slice(12))) { gop++; continue; }
      let nam = null;
      for (let i = d.seg.length - 1; i >= 0 && !nam; i--) { const n = d.seg[i].match(NAM_TM); if (n) nam = +n[1]; }
      if (!nam) { const n = d.ten.match(NAM_TEN); if (n) nam = +n[1]; }
      const tnId = lichCua.get(d.x.token) || null;
      const tenLich = tnId ? ' ' + tn.lich[tnId].ten : '';
      items.push({ t: d.x.token, ten: d.ten, duong: d.seg.map(ghim), loai: d.loai, nam, mod: d.x.mod, tn: tnId, chuoi: bo(d.seg.join(' ') + ' ' + d.ten + tenLich) });
    }
  }
  return { items, tm, loaiNhayCam, gop, lich: tn.lich || {}, quetLuc: fs.statSync(f).mtimeMs };
}

function docThe() {
  let the = null;
  try { the = JSON.parse(fs.readFileSync(path.join(DL, 'the.json'), 'utf8')); } catch (e) {}
  if (the) return the;
  const g = !fs.existsSync(path.join(DL, 'cay.json')) && docGoi();
  return (g && g.the) || {};
}

/* chữ thường GIỮ dấu, dấu câu → khoảng trắng: để phân biệt "san hô" với "(khách) sạn hồ" */
const thuong = s => String(s || '').normalize('NFC').toLowerCase().replace(/uỷ/g, 'ủy').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

module.exports = { DL, GOI, bo, thuong, docMedia, docThe, docGoi };
