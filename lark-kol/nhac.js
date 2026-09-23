'use strict';
/**
 * Bộ nhắc — chạy nền trong server, mỗi phút một vòng.
 *
 *   1. Mốc lịch trình: hạng mục bật "Nhắc hẹn", giờ hẹn còn ≤ N phút (mặc định 60)
 *      → bot nhắn RIÊNG anh Hùng, kèm tin soạn sẵn để copy gửi KOL qua Zalo.
 *      KOL không dùng Lark nên không nhắn thẳng KOL được.
 *   2. Bước tự trôi: tới ngày đi → Đang đi tour; qua ngày về → Chờ nhận sản phẩm.
 *   3. Bản tin sáng (một lần/ngày): bàn giao quá hạn, bài đến hạn nhập số 7N/30N,
 *      chuyến sắp đi, đề xuất chờ BGĐ lâu.
 *
 * Gửi bằng đâu:
 *   - khai KOL_TIN_APP_ID/SECRET (hoặc LARK_APP_*) + KOL_NHAC_EMAIL → app Marketing
 *     Hub, chỉ đích bằng EMAIL (open_id riêng theo từng app — xem lark-chung/tin-lark.js)
 *   - không khai, chạy local → bot của lark-cli nhắn chính người đang đăng nhập
 *     lark-cli (open_id lấy từ `auth status` nên cùng app với bot, không lệch).
 *
 * Nhắc xong mới ghi "Đã nhắc lúc" — gửi hỏng thì vòng sau thử lại, tối đa 3 lần
 * mỗi mốc để không dội tin khi app gửi tin bị cấu hình sai.
 */
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const T = require('./tinh');
const kho = require('./kho');
const { tenGon } = require('./mau-email');

const TT_FILE = path.join(__dirname, 'du-lieu', 'nhac.json');
const trangThai = { kenh: '', lanCuoi: 0, loiCuoi: '', daGui: 0, banTinNgay: '' };
try { Object.assign(trangThai, JSON.parse(fs.readFileSync(TT_FILE, 'utf8'))); } catch (_) {}
const luuTT = () => {
  try { fs.mkdirSync(path.dirname(TT_FILE), { recursive: true }); fs.writeFileSync(TT_FILE, JSON.stringify(trangThai)); } catch (_) {}
};
const thatBai = new Map();   // khoá mốc → số lần gửi hỏng

/* ---------------- kênh gửi ---------------- */
let tinApp = null;
function kenhGui() {
  const n = cfg.nhac;
  if (n.appId && n.appSecret && n.email) {
    if (!tinApp) tinApp = require('../lark-chung/tin-lark').tao({ appId: n.appId, appSecret: n.appSecret, apiHost: cfg.apiHost, tenApp: 'Marketing Hub' });
    return { ten: 'App ' + n.appId + ' → ' + n.email, gui: (text, khoa) => tinApp.gui({ email: n.email, text, khoa }) };
  }
  if (cfg.mode === 'cli') {
    return {
      ten: 'Bot lark-cli → người đang đăng nhập lark-cli',
      gui: async (text) => {
        const u = await kho.lark.whoami();
        if (!u || !u.id) return { ok: false, loi: 'lark-cli chưa đăng nhập' };
        const r = await kho.lark.guiTinNhan(u.id, text);
        return r.ok ? r : { ok: false, loi: r.ly };
      },
    };
  }
  return null;
}
async function guiTin(text, khoa) {
  const k = kenhGui();
  if (!k) return { ok: false, loi: 'Chưa khai kênh gửi tin (KOL_TIN_APP_ID/SECRET + KOL_NHAC_EMAIL)' };
  trangThai.kenh = k.ten;
  const r = await k.gui(text, khoa);
  trangThai.lanCuoi = Date.now();
  if (r.ok) { trangThai.daGui++; trangThai.loiCuoi = ''; } else trangThai.loiCuoi = r.loi || 'lỗi không rõ';
  luuTT();
  return r;
}

/* ---------------- dựng tin ---------------- */
function tinMoc(nhom, ht, kol) {
  const h = nhom[0];
  const khach = nhom.map((x) => (x.loaiKhach && x.soLuong ? x.soLuong + ' ' + x.loaiKhach.toLowerCase() : '')).filter(Boolean).join(' + ');
  const dau = [
    'Nhắc hẹn KOL · ' + T.hhmm(h.gioHen) + ' ' + T.ddmm(h.gioHen),
    tenGon(h.ten) + ' — ' + (kol ? kol.ten : '?') + ' (' + (ht.ma || '') + ')',
    h.diemHen ? 'Điểm hẹn: ' + h.diemHen : '',
    khach ? 'Khách: ' + khach : '',
    h.nhaCungCap ? 'Nhà cung cấp: ' + h.nhaCungCap : '',
  ].filter(Boolean);
  return dau.join('\n') + '\n\nTin gửi KOL (copy):\n' + T.tinNhacKol(h, ht, kol);
}

/** Các mốc đến giờ nhắc, gộp dòng NL/TE cùng dịch vụ + cùng giờ thành một tin. */
function mocCanNhac(dl, now) {
  const htSong = new Map(dl.hopTac.filter((h) => T.BUOC_NHAC.includes(h.buoc)).map((h) => [h.id, h]));
  const nhom = new Map();
  for (const h of dl.hangMuc) {
    const ht = htSong.get(h.hopTac);
    if (!ht || !T.canNhac(h, now, cfg.nhac.truocPhut)) continue;
    const k = h.hopTac + '|' + h.gioHen + '|' + tenGon(h.ten);
    if (!nhom.has(k)) nhom.set(k, { khoa: k, ht, ds: [] });
    nhom.get(k).ds.push(h);
  }
  return [...nhom.values()];
}

function banTinSang(dl, now) {
  const kolTen = new Map(dl.kol.map((k) => [k.id, k.ten]));
  const htTen = (id) => { const h = dl.hopTac.find((x) => x.id === id); return h ? (kolTen.get(h.kol) || h.ma) : '?'; };
  const dong = [];
  const bg = dl.banGiao.map((b) => ({ b, tt: T.trangThaiBanGiao(b, now) }));
  const tre = bg.filter((x) => x.tt.ma === 'tre');
  const do7 = bg.filter((x) => x.tt.ma === 'do-7' || x.tt.ma === 'do-30');
  const sap = dl.hopTac.filter((h) => h.batDau && h.batDau >= T.dauNgay(now) && h.batDau - now <= 3 * T.NGAY &&
    !['Huỷ', 'Hoàn tất'].includes(h.buoc));
  const cho = dl.hopTac.filter((h) => h.buoc === 'Chờ BGĐ duyệt' && h.trinhLuc && now - h.trinhLuc > 2 * T.NGAY);
  if (sap.length) dong.push('Sắp đi (3 ngày tới): ' + sap.map((h) => (kolTen.get(h.kol) || h.ma) + ' ' + T.ddmm(h.batDau) +
    (T.viTri(h.buoc) < 4 ? ' — CHƯA XÁC NHẬN (' + h.buoc + ')' : '')).join('; '));
  if (cho.length) dong.push('Chờ BGĐ duyệt quá 2 ngày: ' + cho.map((h) => kolTen.get(h.kol) || h.ma).join('; '));
  if (tre.length) dong.push('Bàn giao quá hạn đăng (' + tre.length + '): ' + tre.slice(0, 8).map((x) => htTen(x.b.hopTac) + ' · ' + x.b.ten).join('; '));
  if (do7.length) dong.push('Đến hạn nhập số bài đăng (' + do7.length + '): ' + do7.slice(0, 8).map((x) => htTen(x.b.hopTac) + ' · ' + x.b.ten +
    ' (' + (x.tt.ma === 'do-7' ? '7N' : '30N') + ')').join('; '));
  return dong.length ? 'Việc KOL hôm nay ' + T.ddmm(now) + '\n\n' + dong.map((d) => '• ' + d).join('\n') : '';
}

/* ---------------- một vòng ---------------- */
let dangChay = false;
async function vong(now = Date.now()) {
  if (dangChay || cfg.nhac.tat) return;
  dangChay = true;
  try {
    const dl = await kho.tatCa({ moi: true });

    /* 2. bước tự trôi */
    const doi = {};
    for (const h of dl.hopTac) {
      const b = T.buocTheoLich(h, now);
      if (b) doi[h.id] = { buoc: b, lichSu: T.noiLichSu(h.lichSu, T.dongLichSu(h.buoc, b, 'tự chuyển theo ngày đi/về', now)) };
    }
    if (Object.keys(doi).length) await kho.suaNhieu('hopTac', doi);

    /* 1. mốc lịch trình */
    const kolTheoId = new Map(dl.kol.map((k) => [k.id, k]));
    for (const m of mocCanNhac(dl, now)) {
      if ((thatBai.get(m.khoa) || 0) >= 3) continue;
      const r = await guiTin(tinMoc(m.ds, m.ht, kolTheoId.get(m.ht.kol)), 'kol-' + m.ds[0].id + '-' + m.ds[0].gioHen);
      if (r.ok) {
        await kho.suaNhieu('hangMuc', Object.fromEntries(m.ds.map((h) => [h.id, { daNhac: now }])));
      } else {
        thatBai.set(m.khoa, (thatBai.get(m.khoa) || 0) + 1);
        console.error('[nhắc] gửi hỏng:', r.loi);
      }
    }

    /* 3. bản tin sáng */
    const hn = T.ngayCua(now);
    if (T.vn(now).gio >= cfg.nhac.gioSang && trangThai.banTinNgay !== hn) {
      trangThai.banTinNgay = hn;
      luuTT();
      const t = banTinSang(dl, now);
      if (t) await guiTin(t, 'kol-sang-' + hn);
    }
  } catch (e) {
    trangThai.loiCuoi = String(e.message || e).slice(0, 300);
    console.error('[nhắc]', trangThai.loiCuoi);
  } finally {
    dangChay = false;
  }
}

let hen = null;
function batDau() {
  if (hen || cfg.nhac.tat) return;
  setTimeout(() => vong(), 15000);
  hen = setInterval(() => vong(), 60000);
  hen.unref();
}

module.exports = { batDau, vong, guiTin, tinMoc, mocCanNhac, banTinSang, trangThai, kenhGui };
