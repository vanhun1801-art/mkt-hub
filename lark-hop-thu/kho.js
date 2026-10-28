'use strict';
/**
 * Dữ liệu chạy của app.
 *
 *   ai.json  bộ đệm kết quả AI theo thư (chung, tệp trên máy, mất cũng không sao)
 *
 *   Sổ riêng của TỪNG người (anh Hùng 28/10/2026: "việc phân loại của anh trên
 *   ứng dụng thì không nên tác động đến email thật vì cũng có người khác sử
 *   dụng"). Mọi thao tác trong app chỉ ghi vào sổ này, KHÔNG đổi gì trên Lark
 *   Mail; hộp chung sales@, marketing@ người khác vẫn thấy y nguyên.
 *     luat  "thư từ địa chỉ này luôn vào ngăn X"
 *     hen   thư hẹn nhắc lại: ẩn khỏi ngăn tới giờ hẹn
 *     tt    trạng thái từng thư: x = đã xong (giờ), s = gắn sao,
 *           d = 1 đã đọc trong app / 0 đánh dấu chưa đọc
 *     nhom  nhóm việc đang theo dõi
 *     chuKy chữ ký gắn vào thư trả lời
 *
 * Sổ nằm ở kho Base của Hub (bảng của Ghi chú: mỗi người một dòng, ô "Ô" là
 * khoá, ô "Tệp" giữ hop-thu.json.gz). Ổ đĩa Render là tạm, deploy là mất; nên
 * tệp trên máy chỉ là bản đệm. Chạy test, chạy riêng hay soát chỉ đọc
 * (HOP_THU_CHI_DOC) thì dùng tệp thôi, không chạm Base.
 *
 * Ghi tệp qua tệp tạm rồi đổi tên; ghi Base gom lại sau 1,5 giây, mỗi người
 * một hàng đợi để hai lần bấm sát nhau không đè nhau.
 */
const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');
const path = require('path');
const cfg = require('./config');

const bo = {};

function duong(ten) { return path.join(cfg.duLieu, ten + '.json'); }

function doc(ten) {
  if (bo[ten]) return bo[ten];
  let d = {};
  try { d = JSON.parse(fs.readFileSync(duong(ten), 'utf8')) || {}; } catch (_) { d = {}; }
  bo[ten] = d;
  return d;
}

function ghi(ten) {
  fs.mkdirSync(cfg.duLieu, { recursive: true });
  const f = duong(ten);
  fs.writeFileSync(f + '.tmp', JSON.stringify(bo[ten] || {}, null, 1));
  fs.renameSync(f + '.tmp', f);
}

const khoa = (hop, id) => hop + '|' + id;
const bam = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);
const cua = (ten, nguoi) => (nguoi ? ten + '-' + bam(nguoi) : ten);

/* Bộ đệm AI không phình mãi: giữ 2000 thư gần nhất là đủ cho mọi hộp. */
const TRAN_AI = 2000;
/* Trạng thái thư: giữ 4000 thư gần nhất mỗi người. */
const TRAN_TT = 4000;

/* ---------------- sổ riêng từng người ---------------- */

const soRong = () => ({ v: 1, luat: {}, hen: {}, tt: {}, nhom: [] });

function chuanSo(d) {
  const s = soRong();
  if (!d || typeof d !== 'object') return s;
  for (const k of ['luat', 'hen', 'tt']) if (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k])) s[k] = d[k];
  if (Array.isArray(d.nhom)) s.nhom = d.nhom;
  if (typeof d.chuKy === 'string') s.chuKy = d.chuKy;
  return s;
}

const dungBase = () => process.env.HOP_THU_KHO === 'base' ||
  (process.env.HUB === '1' && process.env.HOP_THU_KHO !== 'tep' && process.env.HOP_THU_CHI_DOC !== '1');

let bangKho = null;
function layBang() {
  if (bangKho !== null) return bangKho;
  try {
    const bl = require('../lark-mkt-hub/base-lark');
    bangKho = {
      bl,
      t: bl.bang(
        process.env.HUB_GHI_CHU_BASE || process.env.HUB_PHIM_BASE || process.env.HUB_TB_BASE || 'JhZtbxv0gamk5ys3Fr0luHnsgwG',
        process.env.HUB_GHI_CHU_TABLE || process.env.HUB_PHIM_TABLE || 'tbl1rcw5ES34EeEY', 'Tệp'),
    };
  } catch (e) {
    console.error('[hop-thu] không nạp được lớp Base của hub, sổ chỉ nằm trên máy:', e.message);
    bangKho = false;
  }
  return bangKho;
}
const TEP_BASE = 'hop-thu.json.gz';
const oBase = (nguoi) => 'hop-thu:' + bam('nguoi:' + nguoi);

async function docBase(nguoi) {
  const B = layBang();
  if (!B) throw new Error('Không có lớp Base');
  const dong = (await B.t.docHet()).filter((r) => String(r['Ô'] || '') === oBase(nguoi));
  const r = dong[dong.length - 1];
  if (!r) return { so: null, recordId: '' };
  const tep = B.bl.docOTep(r['Tệp']).filter((f) => f.ten === TEP_BASE).pop();
  if (!tep) return { so: null, recordId: r.recordId };
  const kq = await B.t.taiTep(r.recordId, tep.token);
  const so = JSON.parse(zlib.gunzipSync(kq.buf, { maxOutputLength: 4000000 }).toString('utf8'));
  return { so: chuanSo(so), recordId: r.recordId };
}

async function ghiBase(nguoi, so, recordId) {
  const B = layBang();
  if (!B) return recordId;
  let id = recordId;
  if (!id) {
    id = await B.t.tao({ 'Ô': oBase(nguoi) });
    if (!id) throw new Error('Lark chưa trả mã dòng sổ Hộp thư');
  }
  const buf = zlib.gzipSync(Buffer.from(JSON.stringify(so)));
  if (B.bl.laApi()) {
    const token = await B.t.upMedia(TEP_BASE, 'application/gzip', buf);
    if (!token) throw new Error('Lark chưa nhận tệp sổ Hộp thư');
    await B.t.ghi(id, { 'Tệp': [{ file_token: token }] });
  } else {
    const cu = await B.t.docTepCua(id, 'Tệp').catch(() => []);
    await B.t.dinhTep(id, 'Tệp', { ten: TEP_BASE, kieu: 'application/gzip', buf });
    for (const f of cu) await B.t.goTep(id, 'Tệp', f.token).catch(() => {});
  }
  return id;
}

/* nguoi → { so, recordId, luc, base: true nếu đã đọc được Base, hen, dangGhi } */
const soNguoi = new Map();

function soTep(nguoi, khoaCu) {
  const t = doc(cua('so', nguoi));
  if (t && t.v) return chuanSo(t);
  /* Bản trước chỉ có luat-*.json / hen-*.json theo khoá cũ: chép sang. */
  const s = soRong();
  for (const k of [nguoi, khoaCu].filter((x, i, a) => x != null && a.indexOf(x) === i)) {
    Object.assign(s.luat, doc(cua('luat', k)));
    Object.assign(s.hen, doc(cua('hen', k)));
  }
  return s;
}

/** Nạp sổ của một người (gọi trước mọi lệnh API). Không bao giờ ném lỗi. */
async function nap(nguoi = '', khoaCu) {
  const c = soNguoi.get(nguoi);
  if (c && (c.base || !dungBase() || Date.now() - c.luc < 60000)) return c.so;
  if (c && c.dangNap) return c.dangNap;
  const muc = c || { so: soTep(nguoi, khoaCu), recordId: '', luc: 0, base: false };
  soNguoi.set(nguoi, muc);
  if (!dungBase()) { muc.luc = Date.now(); return muc.so; }
  muc.dangNap = (async () => {
    try {
      const kq = await docBase(nguoi);
      muc.recordId = kq.recordId;
      if (kq.so) muc.so = kq.so;
      muc.base = true;
      /* Chưa có sổ trên Base mà máy đã có (luật, hẹn từ bản trước): đẩy lên. */
      if (!kq.so && Object.keys(muc.so.luat).length + Object.keys(muc.so.hen).length + Object.keys(muc.so.tt).length) luuSo(nguoi);
    } catch (e) {
      /* Đọc Base hỏng thì dùng bản trên máy và KHÔNG ghi Base, kẻo bản thiếu
       * đè lên bản đầy đủ. Một phút sau thử đọc lại. */
      console.error('[hop-thu] chưa đọc được sổ trên Base:', e.message);
    } finally {
      muc.luc = Date.now();
      muc.dangNap = null;
    }
    return muc.so;
  })();
  return muc.dangNap;
}

function so(nguoi = '') {
  let c = soNguoi.get(nguoi);
  if (!c) { c = { so: soTep(nguoi), recordId: '', luc: 0, base: false }; soNguoi.set(nguoi, c); }
  return c.so;
}

/** Ghi sổ: tệp ngay, Base sau 1,5 giây (gom các lần bấm sát nhau). */
function luuSo(nguoi) {
  const c = soNguoi.get(nguoi);
  if (!c) return;
  bo[cua('so', nguoi)] = c.so;
  try { ghi(cua('so', nguoi)); } catch (e) { console.error('[hop-thu] chưa ghi được sổ trên máy:', e.message); }
  if (!dungBase() || !c.base) return;
  clearTimeout(c.hen);
  c.hen = setTimeout(() => {
    c.dangGhi = (c.dangGhi || Promise.resolve()).catch(() => {}).then(async () => {
      try { c.recordId = await ghiBase(nguoi, c.so, c.recordId); } catch (e) {
        console.error('[hop-thu] chưa ghi được sổ lên Base:', e.message);
      }
    });
  }, 1500);
}

function catTT(tt) {
  const ks = Object.keys(tt);
  if (ks.length <= TRAN_TT) return;
  ks.sort((a, b) => (tt[a].l || 0) - (tt[b].l || 0)).slice(0, ks.length - TRAN_TT).forEach((k) => delete tt[k]);
}

module.exports = {
  khoa,
  layAi: (hop, id) => doc('ai')[khoa(hop, id)] || null,
  datAi(hop, id, v) { this.datAiNhieu([{ hop, id, v }]); },
  datAiNhieu(ds) {
    const d = doc('ai');
    for (const x of ds) d[khoa(x.hop, x.id)] = Object.assign({ luc: Date.now() }, x.v);
    const ks = Object.keys(d);
    if (ks.length > TRAN_AI) {
      ks.sort((a, b) => (d[a].luc || 0) - (d[b].luc || 0))
        .slice(0, ks.length - TRAN_AI).forEach((k) => delete d[k]);
    }
    ghi('ai');
  },

  nap,

  luat: (nguoi = '') => so(nguoi).luat,
  datLuat(email, ngan, nguoi = '') {
    const s = so(nguoi);
    if (ngan) s.luat[email] = ngan; else delete s.luat[email];
    luuSo(nguoi);
  },

  hen: (nguoi = '') => so(nguoi).hen,
  datHen(hop, id, den, nguoi = '') {
    const s = so(nguoi);
    if (den) s.hen[khoa(hop, id)] = den; else delete s.hen[khoa(hop, id)];
    luuSo(nguoi);
  },

  /** Trạng thái riêng của từng thư: { x, s, d }. */
  tt: (nguoi = '') => so(nguoi).tt,
  datTT(hop, id, doi, nguoi = '') {
    const s = so(nguoi);
    const k = khoa(hop, id);
    const cu = Object.assign({}, s.tt[k]);
    if ('xong' in doi) { if (doi.xong) cu.x = Date.now(); else delete cu.x; }
    if ('sao' in doi) { if (doi.sao) cu.s = 1; else delete cu.s; }
    if ('daDoc' in doi) cu.d = doi.daDoc ? 1 : 0;
    cu.l = Date.now();
    s.tt[k] = cu;
    catTT(s.tt);
    luuSo(nguoi);
    return cu;
  },

  /** Chữ ký người dùng tự đặt; undefined = chưa đặt lần nào (gợi ý từ Lark). */
  chuKy: (nguoi = '') => so(nguoi).chuKy,
  datChuKy(chu, nguoi = '') {
    so(nguoi).chuKy = String(chu || '').slice(0, 1000);
    luuSo(nguoi);
  },

  nhom: (nguoi = '') => so(nguoi).nhom,
  datNhom(ds, nguoi = '') {
    so(nguoi).nhom = ds;
    luuSo(nguoi);
  },

  /* Chỉ cho test: quên bộ nhớ đệm để đọc lại từ tệp; thay lớp Base bằng bản giả. */
  _quen() { for (const k of Object.keys(bo)) delete bo[k]; soNguoi.clear(); },
  _datBang(b) { bangKho = b; },
  _choGhi: async () => { for (const c of soNguoi.values()) { if (c.dangGhi) await c.dangGhi; } },
};
