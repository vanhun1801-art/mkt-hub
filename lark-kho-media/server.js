'use strict';
/* Kho media — tìm ảnh/video trong Drive Marketing theo ĐƯỜNG DẪN thư mục.
   Chỉ mục đọc từ du-lieu/cay.json (tạo bằng quet-drive.js). Ảnh thu nhỏ lấy qua
   `lark-cli drive +cover` lúc được xem lần đầu rồi giữ trong du-lieu/anh/.
   Chỉ ĐỌC Drive. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const PORT = Number(process.env.PORT || 5188);
const BIND = process.env.BIND_HOST || '127.0.0.1';
const GOC = path.join(__dirname, 'public');
const DL = path.join(__dirname, 'du-lieu');
const ANH = path.join(DL, 'anh');
const MIEN = process.env.LARK_MIEN || 'https://rootytrip2.sg.larksuite.com';
const CLI = process.env.LARK_CLI_JS ||
  path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@larksuite', 'cli', 'scripts', 'run.js');

const { bo, thuong, docMedia, docThe, docGoi, GOI } = require('./chi-muc');
const hoc = require('./hoc');
const tacNghiep = require('./tac-nghiep');
const larkApi = require('./lark-api');
const dongBoLen = require('./dong-bo-len');
const { Readable } = require('stream');
const crypto = require('crypto');
/* ONLINE = bản deploy (Render): có khoá app, không có chỉ mục quét tại chỗ. Đọc gói chỉ mục máy
   nội bộ đẩy lên, và lấy ảnh/video/file gốc thẳng từ Lark bằng khoá app — không cần lark-cli, không
   cần ổ đĩa. Máy nội bộ (có cay.json) vẫn chạy như cũ và là nơi đẩy gói lên. */
const ONLINE = process.env.KHO_ONLINE === '1' ||
  (larkApi.coApi() && !fs.existsSync(path.join(__dirname, 'du-lieu', 'cay.json')));
const MOI_NGAY = 7 * 86400e3; // lịch kết thúc trong 7 ngày → gắn nhãn "Mới"
const sanPham = require('./san-pham');

let KHO = { items: [], theoToken: new Map(), cay: null, tm: new Map(), tong: {} };

function napChiMuc() {
  const d = docMedia();
  if (!d) { console.log('Chưa có du-lieu/cay.json — chạy: node quet-drive.js'); return; }
  const { items, tm, loaiNhayCam, gop } = d;
  /* Mô tả + thẻ nội dung do AI xem ảnh (du-lieu/the.json, khoá = token). Tìm theo cả những chữ
     này, nên "đoàn" ra được ảnh chụp đoàn dù thư mục không ghi chữ đoàn. */
  const THE = docThe();
  for (const it of items) {
    const t = THE[it.t];
    if (!t) continue;
    it.mo = t.mo; it.the = t.the; it.diem = t.diem;
    it.chuoiAi = bo(t.mo + ' ' + t.the.join(' '));
  }
  items.sort((a, b) => (b.nam || 0) - (a.nam || 0) || b.mod - a.mod);
  /* cây đếm dồn: mỗi nút biết tổng số media bên dưới */
  const goc = { ten: 'Drive Marketing', n: 0, con: new Map() };
  for (const it of items) {
    let nut = goc; nut.n++;
    for (const s of it.duong) {
      if (!nut.con.has(s)) nut.con.set(s, { ten: s, n: 0, con: new Map() });
      nut = nut.con.get(s); nut.n++;
    }
  }
  const dem = l => items.filter(i => i.loai === l).length;
  KHO = {
    items, theoToken: new Map(items.map(i => [i.t, i])), cay: goc, tm, lich: d.lich,
    tong: { daGan: items.filter(i => i.mo).length, media: items.length, video: dem('v'), anh: dem('a'), raw: dem('r'), thuMuc: tm.size, nhayCam: loaiNhayCam, banSao: gop, quetLuc: d.quetLuc },
  };
  dungGoiY();
  henDayLen();
  console.log(`Chỉ mục: ${items.length} media · loại ${loaiNhayCam} file nhạy cảm · gộp ${gop} bản sao`);
}

/* ---------- gợi ý khi gõ ----------
   Từ điển "cụm tìm được" dựng lại mỗi lần nạp chỉ mục: địa điểm/thư mục, thẻ AI, tên lịch
   tác nghiệp — mỗi cụm kèm số media thật, để gợi ý nào bấm vào cũng ra kết quả. */
const LA_NGAY = /^(20\d\d|tháng.*|thang.*|t\d{1,2}|ngày.*|\d{1,2}([.\/／\-_ ]\d{1,4}){0,2}|\d+|ảnh|video|vd|ảnh jpg|jpg|png|raw|máy ảnh|may anh|flycam|iphone.*|pocket.*|dji.*|gopro|sony.*|a7.*|canon.*|đt.*|dt .*|mới|moi|cũ|cu|tổng hợp|tong hop)$/i;
let TU_GOI_Y = [];
function dungGoiY() {
  const m = new Map();
  /* Tên thư mục gõ HOA ("WYNDHAM GARDEN") → "Wyndham Garden"; giữ viết tắt ≤4 chữ (MICE, APEC, VIP) */
  const dep = s => (s === s.toUpperCase() && /\p{Lu}/u.test(s))
    ? s.split(' ').map(w => (w.length <= 4 && /^\p{Lu}+$/u.test(w) && !/[À-ỹ]/.test(w)) ? w : w.charAt(0) + w.slice(1).toLowerCase()).join(' ')
    : s;
  const them = (ten, loai, n = 1) => {
    ten = dep(String(ten || '').replace(/^\d+\.\s*/, '').replace(/\s+/g, ' ').trim());
    if (ten.length < 2 || ten.length > 60) return;
    const k = hoc.khoa(ten); if (!k || k.length < 2) return;
    const x = m.get(k);
    /* trùng tên thư mục thì giữ nhãn thư mục — nó lớn hơn, lịch chỉ là một buổi trong đó */
    if (x) x.n += loai === 'lich' ? 0 : n; else m.set(k, { k, ten, loai, n });
  };
  for (const i of KHO.items) {
    i.duong.slice(0, 5).forEach((s, d) => { if (!LA_NGAY.test(s.trim()) && !/(^|\D)0\d{8,}/.test(s)) them(s, d === 0 ? 'kho' : 'noi'); });
    for (const t of i.the || []) them(t, 'the');
  }
  for (const [id, l] of Object.entries(KHO.lich || {})) them(l.ten, 'lich', KHO.items.filter(i => i.tn === id).length || 1);
  TU_GOI_Y = [...m.values()].filter(x => x.n >= 3 || x.loai === 'lich').sort((a, b) => b.n - a.n).slice(0, 8000);
}
function goiYTim(q, n = 8) {
  const k = hoc.khoa(q);
  if (!k) return [];
  const tu = k.split(' ');
  const ra = [];
  for (const x of TU_GOI_Y) {
    const kk = ' ' + x.k;
    /* mọi từ gõ phải là ĐẦU một từ trong cụm (gõ "hon th" → "Cáp treo Hòn Thơm") */
    if (!tu.every(t => kk.includes(' ' + t))) continue;
    const dau = x.k.startsWith(k) ? 3 : x.k.startsWith(tu[0]) ? 1 : 0;
    ra.push([dau * 1e6 + x.n, x]);
    if (ra.length > 400) break;
  }
  return ra.sort((a, b) => b[0] - a[0]).slice(0, n).map(([, x]) => ({ ten: x.ten, loai: x.loai, n: x.n }));
}

/* ---------- ảnh thu nhỏ ---------- */
const DANG = new Map();   // token-cỡ → Promise
const HONG = new Map();   // token-cỡ → thời điểm lỗi (không hỏi lại trong 1 giờ)
const hangDoi = []; let dangChay = 0;
const SONG_SONG = 4;
function chay() {
  while (dangChay < SONG_SONG && hangDoi.length) {
    const v = hangDoi.shift(); dangChay++;
    v().finally(() => { dangChay--; chay(); });
  }
}
function layAnh(token, co) {
  const khoa = token + '-' + co;
  for (const duoi of ['.png', '.jpg', '.jpeg', '.webp']) {
    const f = path.join(ANH, khoa + duoi);
    if (fs.existsSync(f)) return Promise.resolve(f);
  }
  if (HONG.has(khoa) && Date.now() - HONG.get(khoa) < 3600e3) return Promise.resolve(null);
  if (DANG.has(khoa)) return DANG.get(khoa);
  const p = new Promise(ok => {
    hangDoi.push(() => new Promise(xong => {
      execFile(process.execPath, [CLI, 'drive', '+cover', '--file-token', token, '--spec', co, '--output', khoa, '--if-exists', 'overwrite', '--format', 'json'],
        { cwd: ANH, timeout: 30000, maxBuffer: 5e6 }, (err, out) => {
          let f = null;
          try { const j = JSON.parse(out); if (j.ok && j.data && j.data.output_path) f = j.data.output_path; } catch (e) {}
          if (!f || !fs.existsSync(f)) HONG.set(khoa, Date.now());
          DANG.delete(khoa); ok(f && fs.existsSync(f) ? f : null); xong();
        });
    }));
    chay();
  });
  DANG.set(khoa, p);
  return p;
}

/* ---------- phát + tải ----------
   Phát: bản MP4 1080p Lark tự chuyển mã (flycam 385 MB gốc → 18 MB, về trong ~2s; MOV iPhone cũng có).
   Tải gốc: `drive +download` ~4 MB/s, nên tải về bộ đệm trước, trình duyệt hỏi tiến độ rồi mới lưu. */
const XEM = path.join(DL, 'xem');
const GOC_DL = path.join(DL, 'goc');
const TRAN_GOC = Number(process.env.KHO_TRAN_GOC_GB || 5) * 1024 ** 3;
const dangXem = new Map();
function layBanXem(token) {
  const f = path.join(XEM, token + '-1080.mp4');
  if (fs.existsSync(f)) return Promise.resolve(f);
  if (dangXem.has(token)) return dangXem.get(token);
  const p = new Promise(ok => {
    execFile(process.execPath, [CLI, 'drive', '+preview', '--file-token', token, '--type', 'mp4_1080p', '--output', token + '-1080', '--if-exists', 'overwrite', '--format', 'json'],
      { cwd: XEM, timeout: 120000, maxBuffer: 5e6 }, (err, out) => {
        let r = null;
        try { const j = JSON.parse(out); if (j.ok && j.data && j.data.output_path && fs.existsSync(j.data.output_path)) r = j.data.output_path; } catch (e) {}
        if (r && r !== f) { try { fs.renameSync(r, f); r = f; } catch (e) {} }
        dangXem.delete(token); ok(r);
      });
  });
  dangXem.set(token, p);
  return p;
}
const dangGoc = new Map(); // token → { xong, loi, f }
function duoiCua(it) { const m = it.ten.match(/\.[a-z0-9]{2,5}$/i); return m ? m[0].toLowerCase() : ''; }
function fileGoc(it) { return path.join(GOC_DL, it.t + duoiCua(it)); }
function donGoc() {
  /* giữ bộ đệm file gốc dưới trần: xoá file cũ nhất trước */
  const ds = fs.readdirSync(GOC_DL).filter(n => !n.startsWith('.')).map(n => { const f = path.join(GOC_DL, n); const s = fs.statSync(f); return { f, c: s.size, t: s.atimeMs }; }).sort((a, b) => a.t - b.t);
  let tong = ds.reduce((s, x) => s + x.c, 0);
  for (const x of ds) { if (tong <= TRAN_GOC) break; try { fs.unlinkSync(x.f); tong -= x.c; } catch (e) {} }
}
function batDauGoc(it) {
  const f = fileGoc(it);
  if (fs.existsSync(f)) return { xong: true };
  if (dangGoc.has(it.t)) return dangGoc.get(it.t);
  const tt = { xong: false, loi: null };
  dangGoc.set(it.t, tt);
  execFile(process.execPath, [CLI, 'drive', '+download', '--file-token', it.t, '--output', path.basename(f), '--overwrite', '--format', 'json'],
    { cwd: GOC_DL, timeout: 3600e3, maxBuffer: 5e6 }, (err, out) => {
      let ok = false;
      try { const j = JSON.parse(out); ok = j.ok && fs.existsSync(f); } catch (e) {}
      if (ok) { tt.xong = true; donGoc(); } else tt.loi = 'Không tải được file từ Drive';
      setTimeout(() => dangGoc.delete(it.t), 60e3);
    });
  return tt;
}
function daTai(it) {
  /* lark-cli ghi dần vào ".<tên>.<số>.tmp" rồi mới đổi tên — đọc cỡ file tạm để báo tiến độ */
  const ten = '.' + path.basename(fileGoc(it)) + '.';
  const n = fs.readdirSync(GOC_DL).find(x => x.startsWith(ten) && x.endsWith('.tmp'));
  try { return n ? fs.statSync(path.join(GOC_DL, n)).size : 0; } catch (e) { return 0; }
}
function guiFile(req, res, f, loai, tenLuu) {
  const c = fs.statSync(f).size;
  const h = { 'Content-Type': loai, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600' };
  if (tenLuu) h['Content-Disposition'] = "attachment; filename=\"" + tenLuu.replace(/[^\x20-\x7e]|"/g, '_') + "\"; filename*=UTF-8''" + encodeURIComponent(tenLuu);
  const r = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (r && !tenLuu) {
    const dau = r[1] ? +r[1] : c - (+r[2]);
    const cuoi = r[1] && r[2] ? Math.min(+r[2], c - 1) : c - 1;
    if (dau >= c || dau < 0) { res.writeHead(416, { 'Content-Range': 'bytes */' + c }); return res.end(); }
    res.writeHead(206, Object.assign(h, { 'Content-Range': `bytes ${dau}-${cuoi}/${c}`, 'Content-Length': cuoi - dau + 1 }));
    return fs.createReadStream(f, { start: dau, end: cuoi }).pipe(res);
  }
  res.writeHead(200, Object.assign(h, { 'Content-Length': c }));
  fs.createReadStream(f).pipe(res);
}
const MIME = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.heic': 'image/heic', '.webp': 'image/webp', '.gif': 'image/gif' };

/* ---------- API ---------- */
const tomLich = id => { const l = id && KHO.lich && KHO.lich[id]; return l ? { id, ten: l.ten, kt: l.kt, moi: Date.now() - l.kt < MOI_NGAY } : null; };
const ra = it => ({ t: it.t, ten: it.ten, duong: it.duong, loai: it.loai, nam: it.nam, mod: it.mod, mo: it.mo || null, the: it.the || null, diem: it.diem || null, tn: tomLich(it.tn), url: MIEN + '/file/' + it.t, tm: KHO.tm.get('/' + it.duong.join('/')) || null });
function docDuong(s) { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a.map(String) : []; } catch (e) { return []; } }
/* Chữ CÓ dấu của một media — chỉ tính cho các kết quả đang xếp hạng khi người gõ có dấu,
   không giữ sẵn cho cả 97 nghìn file (tốn RAM hơn cả chỉ mục). */
const gocCua = i => ' ' + thuong(i.duong.join(' ') + ' ' + i.ten + ' ' + (i.mo || '') + ' ' + (i.the || []).join(' ')) + ' ';
function locItems(q) {
  /* "đẹp", "nổi bật"… là yêu cầu CHẤT LƯỢNG, không phải nội dung: bỏ khỏi điều kiện khớp,
     dùng để đẩy ảnh điểm cao lên. Không có từ này trong tên file/mô tả nên để lại thì ra 0. */
  let qGoc = q.get('q') || '';
  const CHAT = /(^|\s)(đẹp|dep|nổi bật|noi bat|chất lượng|chat luong|xịn|xin|ấn tượng|an tuong)(?=\s|$)/gi;
  const uuDep = CHAT.test(qGoc);
  qGoc = qGoc.replace(CHAT, ' ').trim();
  const tu = hoc.khoa(qGoc).split(' ').filter(Boolean);
  const loai = q.get('loai'); const nam = +q.get('nam') || null; const duong = docDuong(q.get('duong'));
  const chiAi = q.get('ai') === '1';
  /* Mỗi từ được thay bằng nhóm đồng nghĩa của nó; cả câu cũng có thể có cụm đồng nghĩa
     ("sunset town" = "địa trung hải") → khớp nếu đủ mọi từ, HOẶC đủ mọi từ của một cụm thay thế. */
  const nhomTu = tu.map(t => hoc.moRong(t));
  const cumThay = hoc.moRong(qGoc).filter(c => c !== tu.join(' ')).map(c => c.split(' '));
  const co = (i, s) => i.chuoi.includes(s) || (i.chuoiAi && i.chuoiAi.includes(s));
  const khop = i => nhomTu.every(g => g.some(s => co(i, s))) || cumThay.some(c => c.every(s => co(i, s)));
  const hopLoc = i => (!loai || i.loai === loai) && (!nam || i.nam === nam) && (!chiAi || i.mo) && duong.every((p, k) => i.duong[k] === p);
  let r = KHO.items.filter(i => hopLoc(i) && (!tu.length || khop(i)));
  let ganDung = false;
  /* Không có gì khớp đủ mọi từ → lấy media khớp được NHIỀU từ nhất (ít nhất một nửa), báo là gần đúng */
  if (!r.length && tu.length > 1) {
    const dem = i => nhomTu.filter(g => g.some(s => co(i, s))).length;
    const can = Math.ceil(tu.length / 2);
    const ung = KHO.items.filter(hopLoc).map(i => [dem(i), i]).filter(x => x[0] >= can);
    const max = ung.reduce((m, x) => Math.max(m, x[0]), 0);
    r = ung.filter(x => x[0] === max).map(x => x[1]);
    ganDung = r.length > 0;
  }
  r.ganDung = ganDung;
  if (!tu.length) {
    if (uuDep) { const s = r.filter(i => i.diem).sort((a, b) => b.diem - a.diem); s.ganDung = false; return s; }
    return r;
  }
  /* Xếp hạng, cộng dồn:
     - khớp trong nội dung AI thấy được (×10/từ) > chỉ khớp tên thư mục
     - điểm HỌC: người khác đã bấm/tải/ghim media này khi tìm đúng câu này (×4, có trần)
     - gõ CÓ dấu mà khớp đúng dấu, nguyên từ (×3/từ): "san hô" không lẫn "khách sạn hồ bơi"
     - cùng hạng thì ảnh đẹp trước */
  const tuDau = thuong(qGoc).split(' ').filter(w => /[^\x00-\x7f]/.test(w)).map(w => ' ' + w + ' ');
  const diem = i => (i.chuoiAi ? nhomTu.filter(g => g.some(s => i.chuoiAi.includes(s))).length * 10 : 0) +
    hoc.diemHoc(q.get('q') || '', i.t) * 4 + (tuDau.length ? tuDau.filter(w => gocCua(i).includes(w)).length * 3 : 0) + (i.diem || 0) * (uuDep ? 3 : 1);
  const kq = r.map((i, k) => [diem(i), k, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(x => x[2]);
  kq.ganDung = ganDung;
  return kq;
}
/* Ảnh nội bộ (văn phòng, thiết kế) tìm được nhưng không đưa lên dải gợi ý bán hàng */
const KHONG_GOI_Y = /DỮ LIỆU NỘI BỘ|TÀI LIỆU KINH DOANH/i;
/* Mỗi thư mục cấp 2 lấy một media, xoay vòng theo ngày → dải gợi ý không bị một kho chiếm hết */
function goiY(kieu, n) {
  if (kieu === 'ai') return KHO.items.filter(i => i.diem >= 8 && !KHONG_GOI_Y.test(i.duong[0])).sort((a, b) => b.diem - a.diem || b.mod - a.mod).slice(0, n);
  const nhom = new Map();
  for (const i of KHO.items) {
    if (i.loai === 'r' || KHONG_GOI_Y.test(i.duong[0])) continue;
    const k = i.duong.slice(0, 2).join('/');
    if (!nhom.has(k)) nhom.set(k, []);
    nhom.get(k).push(i);
  }
  const ngay = Math.floor(Date.now() / 864e5);
  let ds = [...nhom.values()].filter(a => a.length >= 5);
  if (kieu === 'moi') ds = ds.map(a => a[0]).sort((a, b) => (b.nam || 0) - (a.nam || 0) || b.mod - a.mod);
  else ds = ds.map((a, k) => a[(ngay * 7919 + k * 104729) % a.length]).sort((a, b) => ((a.t.charCodeAt(3) + ngay) % 17) - ((b.t.charCodeAt(3) + ngay) % 17));
  return ds.slice(0, n);
}

function json(res, o, ma = 200) { res.writeHead(ma, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); }

const KIEU = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

/* Vân tay tệp tĩnh = mốc sửa mới nhất trong public/ (khởi động lại server là tính lại) */
const VER = (() => {
  let t = 0;
  try { for (const n of fs.readdirSync(GOC)) { try { const st = fs.statSync(path.join(GOC, n)); if (st.isFile()) t = Math.max(t, st.mtimeMs); } catch (_) {} } } catch (_) {}
  return String(Math.round(t / 1000) || 1);
})();

/* ---------- bản online: luồng từ Lark + đệm ảnh trong RAM ---------- */
function chuyenLuong(r, res, ct, tenLuu) {
  if (r.status !== 200 && r.status !== 206) {
    try { r.body && r.body.cancel(); } catch (e) {}
    res.writeHead(r.status === 416 ? 416 : 502); return res.end();
  }
  const h = { 'Content-Type': ct, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600' };
  for (const k of ['content-length', 'content-range']) { const v = r.headers.get(k); if (v) h[k] = v; }
  if (tenLuu) h['Content-Disposition'] = "attachment; filename=\"" + tenLuu.replace(/[^\x20-\x7e]|"/g, '_') + "\"; filename*=UTF-8''" + encodeURIComponent(tenLuu);
  res.writeHead(r.status, h);
  Readable.fromWeb(r.body).on('error', () => res.destroy()).pipe(res);
}
/* Ảnh thu nhỏ ~100 KB/ảnh: giữ tối đa 40 MB gần nhất (RAM bản online chia với hub + 12 app);
   trình duyệt còn tự nhớ 7 ngày nhờ Cache-Control, nên lượt xem lại không tới đây. */
const anhRam = new Map(); let anhRamCo = 0;
function nhoAnh(k, x) {
  anhRam.set(k, x); anhRamCo += x.buf.length;
  while (anhRamCo > 40 * 1024 * 1024 && anhRam.size) { const [k0, v0] = anhRam.entries().next().value; anhRam.delete(k0); anhRamCo -= v0.buf.length; }
}

/* Bản online nạp gói chỉ mục 10 phút một lần (đổi mới ghi đè + nạp lại) */
let bamGoi = '';
async function napGoiOnline() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'dong-bo.json'), 'utf8'));
    if (!cfg.file) return console.log('dong-bo.json chưa có mã file gói chỉ mục');
    const { r, buf } = await larkApi.taiFile(cfg.file);
    if (!buf) return console.log('Không tải được gói chỉ mục: HTTP ' + r.status);
    const bam = crypto.createHash('sha1').update(buf).digest('hex');
    if (bam === bamGoi) return;
    fs.mkdirSync(DL, { recursive: true });
    fs.writeFileSync(GOI + '.tmp', buf); fs.renameSync(GOI + '.tmp', GOI);
    bamGoi = bam;
    const g = docGoi();
    if (g && g.dongNghia) { fs.mkdirSync(path.join(DL, 'hoc'), { recursive: true }); fs.writeFileSync(path.join(DL, 'hoc', 'dong-nghia.json'), JSON.stringify(g.dongNghia, null, 1)); }
    napChiMuc();
  } catch (e) { console.log('Nạp gói chỉ mục lỗi:', e.message); }
}

/* Máy nội bộ: dữ liệu đổi (quét, gắn thẻ, lịch tác nghiệp, từ đồng nghĩa) → đẩy gói lên cho bản
   online, gom lại tối đa một lần mỗi 10 phút. KHO_DAY_TAT=1 để tắt. */
let henDay, lanDay = 0;
function henDayLen() {
  if (ONLINE || process.env.KHO_DAY_TAT === '1') return;
  clearTimeout(henDay);
  henDay = setTimeout(async () => {
    try {
      const r = await dongBoLen.dayLen(); lanDay = Date.now();
      console.log(r.boQua ? 'Gói chỉ mục không đổi so với bản trên Drive — không đẩy lại' : 'Đã đẩy gói chỉ mục lên Drive (' + Math.round(r.bytes / 1024) + ' KB)');
    }
    catch (e) { console.log('Đẩy gói chỉ mục lỗi:', e.message); }
  }, Math.max(60e3, lanDay + 10 * 60e3 - Date.now()));
}

napChiMuc();
if (ONLINE) { napGoiOnline(); setInterval(napGoiOnline, 10 * 60e3); }
/* Lượt quét/gắn thẻ hằng ngày ghi đè cay.json, the.json → nạp lại, không phải khởi động lại server */
let henNap;
/* Lịch tác nghiệp: đồng bộ 10 giây sau khi bật rồi 15 phút một lần (KHO_TN_TAT=1 để tắt).
   Bản online không quét được thư mục Drive — phần này chạy ở máy nội bộ rồi theo gói lên. */
if (process.env.KHO_TN_TAT !== '1' && !ONLINE) {
  setTimeout(() => tacNghiep.dongBo(), 10e3);
  setInterval(() => tacNghiep.dongBo(), 15 * 60e3);
}
for (const f of ['cay.json', 'the.json', 'tac-nghiep.json']) fs.watchFile(path.join(DL, f), { interval: 5000 }, () => { clearTimeout(henNap); henNap = setTimeout(napChiMuc, 3000); });
fs.watchFile(path.join(DL, 'hoc', 'dong-nghia.json'), { interval: 5000 }, () => henDayLen());
for (const d of [ANH, XEM, GOC_DL]) fs.mkdirSync(d, { recursive: true });

http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const u = new URL(req.url, 'http://x');
  const p = u.pathname, q = u.searchParams;
  if (p === '/healthz') return json(res, { ok: true });
  if (p === '/api/tong') return json(res, Object.assign({ online: ONLINE }, KHO.tong));
  if (p === '/api/tim') {
    const r = locItems(q); const tu = Math.max(0, +q.get('tu') || 0);
    return json(res, { tong: r.length, video: r.filter(i => i.loai === 'v').length, ganDung: !!r.ganDung, items: r.slice(tu, tu + 48).map(ra) });
  }
  if (p === '/api/cay') {
    let nut = KHO.cay; const duong = docDuong(q.get('duong'));
    for (const s of duong) { nut = nut && nut.con.get(s); }
    if (!nut) return json(res, { con: [] }, 404);
    const con = [...nut.con.values()].filter(c => c.con.size || true).map(c => ({ ten: c.ten, n: c.n, coCon: c.con.size > 0 }))
      .sort((a, b) => a.ten.localeCompare(b.ten, 'vi', { numeric: true }));
    return json(res, { ten: nut.ten, n: nut.n, con, url: KHO.tm.get('/' + duong.join('/')) || null });
  }
  if (p === '/api/su-kien' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 2048) req.destroy(); });
    req.on('end', () => {
      let e = null; try { e = JSON.parse(body); } catch (er) {}
      /* chỉ nhận media có trong chỉ mục — nhật ký không thành chỗ ghi tuỳ ý */
      const ok = e && (!e.t || KHO.theoToken.has(e.t)) && hoc.ghi(e);
      res.writeHead(ok ? 204 : 400); res.end();
    });
    return;
  }
  if (p === '/api/goi-y-tim') {
    /* gõ dở → cụm hợp; ô trống → câu cả phòng hay tìm (có ra kết quả) + thẻ phổ biến */
    const q0 = q.get('q') || '';
    if (q0.trim()) return json(res, { ds: goiYTim(q0, 8) });
    const hay = hoc.hayTim(8).map(x => ({ ten: x.q, loai: 'hay', n: x.lan }));
    const the = TU_GOI_Y.filter(x => x.loai === 'the').slice(0, 10).map(x => ({ ten: x.ten, loai: 'the', n: x.n }));
    return json(res, { ds: hay, the });
  }
  if (p === '/api/tong-quan') {
    /* Thẻ cho trang Tổng quan của Marketing Hub — mỗi thẻ là một việc cần làm, không phải số trang trí */
    const nay = Date.now();
    const lichMoi = Object.entries(KHO.lich || {}).filter(([, l]) => nay - l.kt < MOI_NGAY);
    const idMoi = new Set(lichMoi.map(([id]) => id));
    const mediaMoi = KHO.items.filter(i => i.tn && idMoi.has(i.tn)).length;
    const chiGoogle = Object.values(KHO.lich || {}).filter(l => l.googleDrive).sort((a, b) => b.kt - a.kt);
    const khongRa = hoc.timKhongRa(nay - MOI_NGAY);
    const daGan = KHO.tong.daGan || 0, conLai = KHO.items.filter(i => i.loai !== 'r' && !i.mo).length;
    const dd = t => { const d = new Date(t); return d.getDate() + '/' + (d.getMonth() + 1); };
    const canXuLy = [
      ...chiGoogle.slice(0, 5).map(l => ({ tieuDe: l.ten + ' (' + dd(l.kt) + '): media để trên Google Drive, chưa vào kho', muc: 'vua', nhan: 'Chuyển sang Lark Drive' })),
      ...khongRa.slice(0, 3).map(q => ({ tieuDe: 'Tìm "' + q + '" không ra kết quả nào', muc: 'thap', nhan: 'Kho thiếu nội dung' })),
    ];
    return json(res, {
      the: [
        { chinh: true, nhan: 'Media mới từ tác nghiệp', so: mediaMoi, dinhDang: 'so', muc: 'ok', ghi: lichMoi.length ? lichMoi.length + ' lịch trong 7 ngày' : 'chưa có lịch mới' },
        { nhan: 'Đã có mô tả AI', so: daGan, dinhDang: 'so', muc: 'ok', ghi: 'còn ' + conLai.toLocaleString('vi-VN') + ' chưa có' },
        { nhan: 'Lịch để link Google Drive', so: chiGoogle.length, dinhDang: 'so', muc: chiGoogle.length ? 'vua' : 'ok' },
        { nhan: 'Tìm không ra · 7 ngày', so: khongRa.length, dinhDang: 'so', muc: khongRa.length ? 'vua' : 'ok' },
      ],
      canXuLy, canXuLyTong: chiGoogle.length + khongRa.length,
      tong: KHO.items.length,
      khoang: 'toàn kho',
    });
  }
  if (p === '/api/tac-nghiep') {
    /* lịch đã hoàn tất có media, mới nhất trước; lịch chỉ có link Google Drive thì báo riêng */
    const dem = new Map();
    for (const i of KHO.items) if (i.tn) { const x = dem.get(i.tn) || { n: 0, video: 0 }; x.n++; if (i.loai === 'v') x.video++; dem.set(i.tn, x); }
    const ds = Object.entries(KHO.lich || {}).map(([id, l]) => Object.assign({ id, ten: l.ten, kt: l.kt, diaDiem: l.diaDiem, loaiHinh: l.loaiHinh, nguoi: l.nguoi, googleDrive: !!l.googleDrive, moi: Date.now() - l.kt < MOI_NGAY }, dem.get(id) || { n: 0, video: 0 }))
      .sort((a, b) => b.kt - a.kt);
    return json(res, { ds: ds.filter(x => x.n), chiGoogle: ds.filter(x => !x.n && x.googleDrive).map(x => ({ ten: x.ten, kt: x.kt })) });
  }
  if (p === '/api/goi-y' && q.get('kieu') === 'tn') {
    const id = q.get('id');
    const ds = KHO.items.filter(i => i.tn === id && i.loai !== 'r' && !(i.diem && i.diem <= 3))
      .sort((a, b) => (b.diem || 0) - (a.diem || 0) || (b.loai === 'v') - (a.loai === 'v') || b.mod - a.mod);
    return json(res, { items: ds.slice(0, Math.min(24, +q.get('n') || 12)).map(ra) });
  }
  if (p === '/api/san-pham') {
    const d = await sanPham.danhSach().catch(() => null);
    return json(res, { ds: d ? d.ds.map(s => ({ ma: s.ma, ten: s.ten, nhom: s.nhom, uuTien: s.uuTien, day: s.day })) : [], luc: d ? d.luc : null });
  }
  if (p === '/api/goi-y' && q.get('kieu') === 'sp') {
    const d = await sanPham.danhSach().catch(() => null);
    const sp = d && d.ds.find(s => s.ma === q.get('ma'));
    if (!sp) return json(res, { items: [] });
    return json(res, { items: sanPham.goiYChoSanPham(sp, KHO.items, Math.min(24, +q.get('n') || 12), i => KHONG_GOI_Y.test(i.duong[0])).map(ra) });
  }
  if (p === '/api/goi-y') return json(res, { items: goiY(q.get('kieu'), Math.min(24, +q.get('n') || 12)).map(ra) });
  if (p === '/api/theo-token') {
    const ds = (q.get('ds') || '').split(',').map(t => KHO.theoToken.get(t)).filter(Boolean);
    return json(res, { items: ds.map(ra) });
  }
  const pt = p.match(/^\/api\/(phat|tai|tai-tt)\/([A-Za-z0-9]{10,40})$/);
  if (pt) {
    const it = KHO.theoToken.get(pt[2]);
    if (!it) { res.writeHead(404); return res.end(); }
    const goc = it.ten.replace(/^Bản sao của /, '');
    if (ONLINE) {
      /* Bản online: không có ổ đĩa để đệm → chuyển thẳng luồng từ Lark, giữ nguyên Range/206 để tua */
      if (pt[1] === 'tai-tt') return json(res, { xong: true, loi: null, daTai: 0 });
      const la1080 = pt[1] === 'phat' || q.get('ban') === '1080';
      if (la1080 && it.loai !== 'v') { res.writeHead(404); return res.end(); }
      const tenLuu = pt[1] === 'tai' ? (la1080 ? goc.replace(/\.[^.]+$/, '') + '_1080p.mp4' : goc) : null;
      try {
        const r = la1080 ? await larkApi.phat(it.t, req.headers.range, res) : await larkApi.goc(it.t, req.headers.range, res);
        if (!r) return json(res, { loi: 'Lark chưa có bản xem trước cho video này' }, 502);
        return chuyenLuong(r, res, la1080 ? 'video/mp4' : (MIME[duoiCua(it)] || 'application/octet-stream'), tenLuu);
      } catch (e) { if (!res.headersSent) return json(res, { loi: 'Không đọc được file từ Lark' }, 502); return res.end(); }
    }
    if (pt[1] === 'phat' || (pt[1] === 'tai' && q.get('ban') === '1080')) {
      if (it.loai !== 'v') { res.writeHead(404); return res.end(); }
      const f = await layBanXem(it.t);
      if (!f) return json(res, { loi: 'Lark chưa có bản xem trước cho video này' }, 502);
      return guiFile(req, res, f, 'video/mp4', pt[1] === 'tai' ? goc.replace(/\.[^.]+$/, '') + '_1080p.mp4' : null);
    }
    if (pt[1] === 'tai-tt') {
      const tt = batDauGoc(it);
      return json(res, { xong: !!tt.xong, loi: tt.loi || null, daTai: tt.xong ? fs.statSync(fileGoc(it)).size : daTai(it) });
    }
    const f = fileGoc(it);
    if (!fs.existsSync(f)) return json(res, { loi: 'File gốc chưa tải xong' }, 409);
    return guiFile(req, res, f, MIME[duoiCua(it)] || 'application/octet-stream', goc);
  }
  const a = p.match(/^\/api\/anh\/([A-Za-z0-9]{10,40})$/);
  if (a) {
    /* chỉ trả ảnh của file có trong chỉ mục — không thành cổng đọc bất kỳ file Lark nào */
    if (!KHO.theoToken.has(a[1])) { res.writeHead(404); return res.end(); }
    const co = q.get('c') === 'middle' ? 'middle' : 'grid';
    if (ONLINE) {
      const khoa = a[1] + '-' + co;
      let x = anhRam.get(khoa);
      if (!x) {
        try { const { r, buf } = await larkApi.anh(a[1], co); if (buf) x = { buf, ct: r.headers.get('content-type') || 'image/png' }; } catch (e) {}
        if (x) nhoAnh(khoa, x);
      }
      if (!x) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': x.ct, 'Content-Length': x.buf.length, 'Cache-Control': 'private, max-age=604800' });
      return res.end(x.buf);
    }
    const f = await layAnh(a[1], co);
    if (!f) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': KIEU[path.extname(f)] || 'image/png', 'Cache-Control': 'private, max-age=86400' });
    return fs.createReadStream(f).pipe(res);
  }
  let fp = decodeURIComponent(p);
  if (fp.endsWith('/')) fp += 'index.html';
  const f = path.join(GOC, path.normalize(fp));
  if (!f.startsWith(GOC)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Không có'); }
    /* Trang .html giữ số bản của mọi tệp khác → không đệm, và thay v=BUILD bằng vân tay.
       Tệp xin KÈM số bản thì đệm một năm (đổi tệp là đổi địa chỉ); xin trần thì không đệm. */
    const trang = path.extname(f) === '.html';
    if (trang) buf = Buffer.from(buf.toString('utf8').split('v=BUILD').join('v=' + VER), 'utf8');
    res.writeHead(200, {
      'Content-Type': KIEU[path.extname(f)] || 'application/octet-stream',
      'Content-Length': buf.length,
      'Cache-Control': !trang && /[?&]v=/.test(u.search) ? 'public, max-age=31536000' : 'no-store',
    });
    res.end(buf);
  });
}).listen(PORT, BIND, () => console.log('Kho media: http://localhost:' + PORT));
