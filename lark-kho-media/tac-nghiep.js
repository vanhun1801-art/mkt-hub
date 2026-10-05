'use strict';
/* Media từ Lịch tác nghiệp: lịch "Đã hoàn tất" có dán link thư mục Lark Drive ở cột "Liên kết"
   → quét ngay thư mục đó (không đợi lượt quét toàn Drive ban đêm), gắn tên lịch vào từng file
   để tìm được theo tên lịch, và đưa lên mục Nổi bật + ưu tiên gắn thẻ.
   CHỈ ĐỌC: Base Lịch tác nghiệp (qua lark.js của app lark-lich-tac-nghiep) và Drive. */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { DL } = require('./chi-muc');

const LICH_DIR = process.env.KHO_LICH_DIR || path.join(__dirname, '..', 'lark-lich-tac-nghiep');
const FILE = path.join(DL, 'tac-nghiep.json');
const CLI = process.env.LARK_CLI_JS ||
  path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@larksuite', 'cli', 'scripts', 'run.js');
const HOAN_TAT = 'Đã hoàn tất';
/* Media hay được tải lên dần sau buổi quay → quét lại thư mục mỗi giờ trong 3 ngày sau lịch */
const QUET_LAI = 3600e3, CUA_SO = 3 * 86400e3;

let du = { lich: {}, thuMuc: {}, luc: 0 };
try { du = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) {}
/* Nội dung lần ghi gần nhất (không kể mốc giờ). Lượt 15 phút mà Base và thư mục không đổi thì
   KHÔNG ghi file: ghi là watchFile ở server.js nạp lại 97 nghìn media rồi đẩy gói 3 MB lên Drive —
   bản Render lại tải về nạp lại — tất cả chỉ vì `luc` đổi (đo 05/10/2026: 53 lượt một đêm). */
let noiDungCu = JSON.stringify({ lich: du.lich, thuMuc: du.thuMuc });

const chu = v => typeof v === 'string' ? v : Array.isArray(v) ? v.map(chu).join(', ') : (v && typeof v === 'object' ? (v.name || v.text || '') : '');
const ngay = v => { const t = Date.parse(chu(v)); return isNaN(t) ? 0 : t; };

function listThuMuc(token, trang) {
  const p = { folder_token: token, page_size: 200 };
  if (trang) p.page_token = trang;
  return new Promise(ok => execFile(process.execPath, [CLI, 'drive', 'files', 'list', '--params', JSON.stringify(p), '--format', 'json'],
    { timeout: 60000, maxBuffer: 50e6 }, (e, out) => { try { ok(JSON.parse(out)); } catch (er) { ok(null); } }));
}
async function quetThuMuc(goc) {
  const files = []; const hang = [{ t: goc, p: '' }]; let loi = null, goi = 0;
  while (hang.length && goi < 400) {
    const f = hang.shift(); let trang = '';
    do {
      goi++;
      const r = await listThuMuc(f.t, trang);
      if (!r || !r.ok) { loi = (r && r.error && r.error.message) || 'không đọc được thư mục'; break; }
      for (const x of r.data.files || []) {
        const p = f.p + '/' + x.name;
        if (x.type === 'folder') hang.push({ t: x.token, p });
        else if (x.type === 'file') files.push({ path: p, token: x.token, mod: +x.modified_time });
      }
      trang = r.data.has_more ? r.data.next_page_token : '';
    } while (trang);
  }
  return { files, loi };
}

let dang = null;
async function dongBo() {
  if (dang) return dang;
  dang = (async () => {
    const lark = require(path.join(LICH_DIR, 'lark'));
    const cfg = require(path.join(LICH_DIR, 'config'));
    const F = cfg.fields;
    const rs = await lark.listAllRecords();
    const lich = {};
    for (const r of rs) {
      const c = r.cells || {};
      if (chu(c[F.status.id]) !== HOAN_TAT) continue;
      const lk = chu(c[F.link.id]);
      const thuMuc = [...new Set([...lk.matchAll(/larksuite\.com\/drive\/folder\/([A-Za-z0-9]+)/g)].map(m => m[1]))];
      const gg = /drive\.google\.com|photos\.google|photos\.app\.goo\.gl/.test(lk);
      if (!thuMuc.length && !gg) continue;
      lich[r.record_id] = {
        ten: chu(c[F.title.id]).replace(/\s+/g, ' ').trim(), bd: ngay(c[F.start.id]), kt: ngay(c[F.end.id]) || ngay(c[F.start.id]),
        diaDiem: chu(c[F.diaDiem.id]), loaiHinh: chu(c[F.loaiHinh.id]),
        nguoi: [].concat(c[F.staff.id] || []).map(u => u && u.name).filter(Boolean),
        thuMuc, googleDrive: gg && !thuMuc.length,
      };
    }
    const nay = Date.now(); let quet = 0;
    for (const l of Object.values(lich)) {
      for (const t of l.thuMuc) {
        const cu = du.thuMuc[t];
        const moi = nay - l.kt < CUA_SO;
        if (cu && !(moi && nay - cu.luc > QUET_LAI)) continue;
        const r = await quetThuMuc(t);
        du.thuMuc[t] = { luc: nay, files: r.files, loi: r.loi };
        quet++;
      }
    }
    du.lich = lich; du.luc = nay;
    const noiDung = JSON.stringify({ lich: du.lich, thuMuc: du.thuMuc });
    const doi = noiDung !== noiDungCu;
    if (doi) {
      fs.writeFileSync(FILE + '.tmp', JSON.stringify(du));
      fs.renameSync(FILE + '.tmp', FILE);
      noiDungCu = noiDung;
    }
    return { lich: Object.keys(lich).length, quet, doi };
  })().catch(e => { console.log('Đồng bộ lịch tác nghiệp lỗi:', e.message); return null; }).finally(() => { dang = null; });
  return dang;
}

module.exports = { dongBo, FILE };
