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

function docMedia() {
  const f = path.join(DL, 'cay.json');
  if (!fs.existsSync(f)) return null;
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
      items.push({ t: d.x.token, ten: d.ten, duong: d.seg, loai: d.loai, nam, mod: d.x.mod, tn: tnId, chuoi: bo(d.seg.join(' ') + ' ' + d.ten + tenLich) });
    }
  }
  return { items, tm, loaiNhayCam, gop, lich: tn.lich || {}, quetLuc: fs.statSync(f).mtimeMs };
}

function docThe() {
  try { return JSON.parse(fs.readFileSync(path.join(DL, 'the.json'), 'utf8')); } catch (e) { return {}; }
}

/* chữ thường GIỮ dấu, dấu câu → khoảng trắng: để phân biệt "san hô" với "(khách) sạn hồ" */
const thuong = s => String(s || '').normalize('NFC').toLowerCase().replace(/uỷ/g, 'ủy').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

module.exports = { DL, bo, thuong, docMedia, docThe };
