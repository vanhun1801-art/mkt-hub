'use strict';
/**
 * Tự giám sát sức khoẻ đồng bộ.
 *
 * Vì sao cần: tác vụ nền chạy mỗi 3 giờ và khi hỏng thì nó hỏng LẶNG LẼ — mã lỗi
 * nằm trong Task Scheduler, thông báo nằm trong dong-bo.log, không ai mở ra xem.
 * Meta bị chặn từ 29/08 mà tới 31/08 mới phát hiện là vì vậy.
 *
 * Sau mỗi lượt đồng bộ, file này chấm điểm sức khoẻ, ghi ra trang-thai.json cho
 * app hiện băng đỏ, và (nếu bật) nhắn thẳng vào Lark cho người phụ trách.
 *
 * Chống làm phiền: cùng một vấn đề chỉ nhắn lại sau `imLangGio` giờ. Khi hết lỗi
 * thì nhắn một lần báo đã trở lại bình thường.
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const cfg = require('./config');
const ketnoi = require('./sync/ketnoi');
const live = require('./sync/live');
const store = require('./store');

const FILE_TT = path.join(__dirname, 'trang-thai.json');

const doc = (f, mac) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return mac; } };
const ghi = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 2), 'utf8');
const vnd = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN') + 'đ';

/* ---------------- cấu hình nhắn tin ---------------- */
function caiDatNhac() {
  const c = ketnoi.read();
  const n = c.nhacNho || {};
  return {
    bat: !!n.bat,                                   // mặc định TẮT — phải bật rõ ràng
    nguoiNhan: n.nguoiNhan || '',                   // open_id, dạng ou_xxx
    imLangGio: Number(n.imLangGio || 12),
    treNgay: Number(n.treNgay || 2),                // nền tảng im bao nhiêu ngày thì coi là hỏng
  };
}

/* ---------------- chấm sức khoẻ ---------------- */
/**
 * @returns {{ khoe:boolean, van_de:Array, tomTat:string, luc:string }}
 */
async function chamDiem() {
  const vanDe = [];
  const c = ketnoi.read();
  const homNay = store.todayKey();

  // 1. kênh nào đang bật mà gọi không được
  let nenTangSong = [];
  try {
    const { nenTang, loi } = await live.layRows(store.addDays(homNay, -2), homNay);
    nenTangSong = nenTang;
    loi.forEach((x) => vanDe.push({
      loai: 'ket-noi', nang: true, kenh: x.platform,
      mo_ta: `${x.platform}: ${x.loi}`,
    }));
  } catch (e) {
    vanDe.push({ loai: 'ket-noi', nang: true, kenh: '(tất cả)', mo_ta: 'Không gọi được nền tảng nào: ' + e.message });
  }

  // 2. kênh gọi được nhưng số đứng yên quá lâu
  const { treNgay } = caiDatNhac();
  const data = await store.get({ force: true });
  const moiNhat = {};
  data.daily.forEach((d) => {
    if (!d.date || !d.platform) return;
    if (!moiNhat[d.platform] || d.date > moiNhat[d.platform]) moiNhat[d.platform] = d.date;
  });
  nenTangSong.forEach((p) => {
    const m = moiNhat[p];
    const tre = m ? store.daysBetween(m, homNay) : 999;
    if (tre > treNgay) {
      vanDe.push({
        loai: 'du-lieu', nang: false, kenh: p,
        mo_ta: `${p}: số mới nhất trong Base là ${m || '(chưa có)'} — trễ ${tre} ngày`,
      });
    }
  });

  // 3. token sắp hết hạn
  const han = ketnoi.hanToken(c.meta);
  if (han && (han.muc === 'het' || han.muc === 'sapHet')) {
    vanDe.push({
      loai: 'token', nang: han.muc === 'het', kenh: 'Facebook / Meta',
      mo_ta: `Token Meta ${han.text}`,
    });
  }

  // 4. hai nguồn cùng một nền tảng (đã tự bỏ bớt, nhưng vẫn nên báo)
  live.nguonBiBo().forEach((x) => vanDe.push({
    loai: 'cau-hinh', nang: false, kenh: x.platform,
    mo_ta: `Đang bật 2 nguồn cho ${x.platform}, app chỉ dùng 1 (${x.ly_do})`,
  }));

  const nang = vanDe.filter((v) => v.nang);
  return {
    khoe: vanDe.length === 0,
    coLoiNang: nang.length > 0,
    van_de: vanDe,
    nenTangSong,
    moiNhat,
    tomTat: vanDe.length ? vanDe.map((v) => v.mo_ta).join(' | ') : 'Mọi kênh đang chạy bình thường',
    luc: new Date().toISOString(),
  };
}

/* ---------------- nhắn vào Lark ---------------- */
function nhanLark(nguoiNhan, text) {
  return new Promise((resolve) => {
    execFile(process.execPath, [
      cfg.cliScript, 'im', '+messages-send',
      '--user-id', nguoiNhan, '--text', text,
      '--as', 'user', '--format', 'json',
    ], { timeout: 45000, cwd: __dirname, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
    (err, stdout, stderr) => {
      const raw = String(stdout || '');
      let ok = false;
      try { ok = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)).ok === true; } catch (_) {}
      resolve({ ok, loi: ok ? null : (stderr || err?.message || raw).slice(0, 200) });
    });
  });
}

/** Chữ ký của tình trạng — để biết có phải vẫn đúng vấn đề cũ không. */
const chuKy = (tt) => tt.van_de.map((v) => v.loai + ':' + v.kenh).sort().join(',');

function soanTin(tt) {
  if (tt.khoe) {
    return '✅ Đồng bộ quảng cáo đã trở lại bình thường.\n'
      + `Kênh đang chạy: ${tt.nenTangSong.join(', ') || '(không có)'}`;
  }
  const dong = tt.van_de.map((v) => (v.nang ? '🔴 ' : '🟠 ') + v.mo_ta);
  return '⚠️ Đồng bộ quảng cáo đang có vấn đề\n\n'
    + dong.join('\n')
    + '\n\nSố mới nhất trong Base:\n'
    + Object.keys(tt.moiNhat).sort().map((p) => `· ${p}: ${tt.moiNhat[p]}`).join('\n')
    + '\n\nApp: http://localhost:5176 → tab Kết nối & Đồng bộ';
}

/* ---------------- chạy ---------------- */
async function chay({ imLang = false } = {}) {
  const tt = await chamDiem();
  const truoc = doc(FILE_TT, {});
  const nhac = caiDatNhac();

  const kyMoi = chuKy(tt);
  const kyCu = truoc.chuKy || '';
  const gioTuLanNhac = truoc.nhacLuc ? (Date.now() - Date.parse(truoc.nhacLuc)) / 3600000 : 1e9;

  // Có nhắn hay không: vấn đề mới, hoặc vấn đề cũ nhưng đã im lâu, hoặc vừa khỏi hẳn
  let nen = false;
  let lyDo = '';
  if (!tt.khoe && kyMoi !== kyCu) { nen = true; lyDo = 'vấn đề mới'; }
  else if (!tt.khoe && gioTuLanNhac >= nhac.imLangGio) { nen = true; lyDo = `vẫn hỏng sau ${nhac.imLangGio}h`; }
  else if (tt.khoe && kyCu) { nen = true; lyDo = 'đã khắc phục'; }

  const ra = {
    ...tt,
    chuKy: kyMoi,
    nhacLuc: nen ? new Date().toISOString() : (truoc.nhacLuc || null),
    nhacGanNhat: nen ? lyDo : (truoc.nhacGanNhat || null),
  };

  if (nen && nhac.bat && nhac.nguoiNhan && !imLang) {
    const kq = await nhanLark(nhac.nguoiNhan, soanTin(tt));
    ra.guiLark = kq.ok ? 'đã gửi' : ('lỗi: ' + kq.loi);
  } else if (nen) {
    ra.guiLark = nhac.bat ? 'chưa khai người nhận' : 'nhắc qua Lark đang TẮT';
  }

  ghi(FILE_TT, ra);
  return ra;
}

module.exports = { chay, chamDiem, soanTin, FILE_TT, caiDatNhac };

/* chạy trực tiếp: node giam-sat.js [--im-lang] */
if (require.main === module) {
  chay({ imLang: process.argv.includes('--im-lang') }).then((tt) => {
    console.log(tt.khoe ? '✓ ' + tt.tomTat : '✗ ' + tt.tomTat);
    if (tt.guiLark) console.log('  nhắc Lark: ' + tt.guiLark);
    process.exitCode = tt.coLoiNang ? 1 : 0;
  }).catch((e) => { console.error('LỖI giám sát:', e.message); process.exitCode = 1; });
}
