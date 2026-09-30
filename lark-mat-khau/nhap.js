#!/usr/bin/env node
'use strict';
/**
 * Nhập file Excel "TÀI KHOẢN MẬT KHẨU - ROOTY TRIP" vào bảng Tài khoản, và mã
 * hoá các mật khẩu đang để chữ thường trên bảng gói đăng ký.
 *
 *   node nhap.js --tao-khoa                 tạo khoá TK_KHOA vào .env (một lần duy nhất)
 *   node nhap.js --thu   "<file.xlsx>"      xem trước: đếm, chia nhóm — KHÔNG in mật khẩu, KHÔNG ghi
 *   node nhap.js         "<file.xlsx>"      nhập thật (từ chối nếu bảng Tài khoản đã có dữ liệu)
 *   node nhap.js --ma-hoa-goi [--thu]       mã hoá tại chỗ cột Mật khẩu của bảng gói đăng ký
 *
 * Đọc .xlsx bằng Python + openpyxl (máy anh Hùng có sẵn) vì cả hệ không dùng
 * dependency npm, mà .xlsx là tệp zip chứa XML — tự viết bộ đọc là rước lỗi.
 * Ô gộp (merged) được điền theo ô đầu vùng: file gốc gộp cột "Nền tảng" và
 * "Phụ trách" cho nhiều dòng tài khoản cùng nền tảng.
 *
 * Script này KHÔNG BAO GIỜ in mật khẩu ra màn hình.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const cfg = require('./config');
const mh = require('./ma-hoa');

const args = process.argv.slice(2);
const co = (k) => args.includes(k);
const tep = args.find((a) => !a.startsWith('--'));
const THU = co('--thu');

/* ---------------- khoá ---------------- */

if (require.main === module && co('--tao-khoa')) {
  const f = path.join(__dirname, '.env');
  const cu = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
  if (/^\s*TK_KHOA\s*=/m.test(cu) || process.env.TK_KHOA) {
    console.log('Đã có TK_KHOA — KHÔNG tạo khoá mới (khoá mới sẽ làm mọi mật khẩu đã mã hoá thành rác).');
    process.exit(0);
  }
  fs.writeFileSync(f, cu + (cu && !cu.endsWith('\n') ? '\n' : '') +
    '# Khoá mã hoá mật khẩu — MẤT LÀ MẤT HẾT. Sao lưu vào chỗ an toàn (không phải Lark Base).\n' +
    'TK_KHOA=' + mh.taoKhoa() + '\n');
  console.log('Đã ghi TK_KHOA vào ' + f);
  console.log('→ Sao lưu khoá này (trình quản lý mật khẩu cá nhân / giấy cất két), và khai cùng giá trị trên Render.');
  process.exit(0);
}

/* ---------------- chia nhóm ---------------- */

const LUAT = [
  ['Thanh toán', /payoneer|flyremit|hoá đơn|hóa đơn|invoice|ngân hàng|bank/i],
  ['Kênh bán OTA', /getyourguide|kkday|klook|viator|(?<![a-z])trip\.com|myrealtrip|tripadvisor|\bota\b|agoda|booking/i],
  ['Mạng xã hội', /tik ?tok|instagram|youtube|facebook|zalo|naver|kktalk|kakao|threads|pinterest/i],
  ['Email & Google', /gmail|e-?mail|\bmail\b|google|microsoft|outlook|apple id/i],
  ['Website & hạ tầng', /website|hosting|cpanel|tên miền|domain|tino|supabase|vps|n8n|tawk|server/i],
  ['Công cụ & AI', /gemini|claude|chatgpt|\bai\b|spineditor|tourwell|cnv|canva|adobe|capcut|vindow|window/i],
];
/* Xét TÊN NỀN TẢNG trước, link sau: "Website rootytrip.com" có link trỏ sang
   trang đặt tour nên xét chung một lượt là bị xếp nhầm sang OTA. */
const nhomCua = (...s) => {
  for (const t of s.filter(Boolean)) {
    const l = LUAT.find(([, re]) => re.test(t));
    if (l) return l[0];
  }
  return 'Khác';
};

/* ---------------- đọc Excel ---------------- */

function docExcel(f) {
  const py = `
import json, sys, datetime, openpyxl
wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
ws = wb.worksheets[0]
gop = {}
for r in ws.merged_cells.ranges:
    v = ws.cell(r.min_row, r.min_col).value
    for row in range(r.min_row, r.max_row + 1):
        for col in range(r.min_col, r.max_col + 1):
            gop[(row, col)] = v
ra = []
for row in range(3, ws.max_row + 1):
    o = []
    for col in range(1, 13):
        v = ws.cell(row, col).value
        if v is None: v = gop.get((row, col))
        if isinstance(v, (datetime.datetime, datetime.date)): v = v.isoformat()
        o.append(v)
    ra.append(o)
sys.stdout.write(json.dumps(ra, ensure_ascii=False))
`;
  const out = execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', py, f],
    { encoding: 'utf8', env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' }), maxBuffer: 32 * 1024 * 1024 });
  return JSON.parse(out);
}

const s = (v) => (v == null ? '' : String(v).trim());
const laLink = (v) => /^https?:\/\//i.test(s(v)) || /\.(com|vn|net|io|to)(\/|$)/i.test(s(v));

/* Ô "Thời gian cập nhật cuối" có khi là ngày thật, có khi là chữ lạ — chỉ nhận ngày. */
function ngayCua(v) {
  const t = s(v);
  if (!t) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t) || null;
  if (m) return m[1] + '-' + m[2] + '-' + m[3] + ' 00:00:00';
  const n = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
  if (n) return n[3] + '-' + n[2].padStart(2, '0') + '-' + n[1].padStart(2, '0') + ' 00:00:00';
  return null;
}

function chuyenDong(r) {
  const [stt, nenTangGoc, phuTrach, kenh, ten, user, pass, tg1, phone, passMoi, tg2, mail] = r;
  let nenTang = s(nenTangGoc);
  if (/^\*?note/i.test(nenTang.replace(/\s+/g, '')) || /vui lòng thông báo/i.test(nenTang)) return null;
  if (!nenTang && !s(ten) && !s(user) && !s(pass)) return null;
  let link = s(kenh);
  /* Vài dòng ghi thẳng URL vào cột Nền tảng ("https://tino.vn/vps-n8n"). */
  if (laLink(nenTang) && !link) link = nenTang;
  if (laLink(nenTang)) nenTang = nenTang.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  const hienTai = s(passMoi) || s(pass);
  const cu = s(passMoi) && s(pass) && s(pass) !== s(passMoi) ? s(pass) : '';
  const ghiChu = [
    !laLink(kenh) && s(kenh) ? 'Kênh: ' + s(kenh) : '',
    s(mail) ? 'Mail: ' + s(mail) : '',
  ].filter(Boolean).join(' · ');
  /* Cột "Thời gian cập nhật cuối" của file gốc có ô chứa chuỗi trông như mật
     khẩu (dán nhầm cột). Nên chỉ nhận cột này khi nó là NGÀY; chữ khác bỏ hẳn,
     không chép sang Ghi chú — Ghi chú không mã hoá. */
  return {
    stt: Number(stt) || null,
    nenTang,
    ten: s(ten) || nenTang,
    nhom: nhomCua(nenTang, link, s(ten)),
    link: laLink(kenh) ? s(kenh) : (laLink(link) ? link : ''),
    user: s(user),
    matKhau: hienTai,
    matKhauCu: cu,
    doiLuc: ngayCua(tg2) || ngayCua(tg1),
    sdt: s(phone),
    phuTrachChu: s(phuTrach),
    ghiChu,
  };
}

async function main() {
  const lark = cfg.mode === 'api' ? require('./larkapi') : require('./lark');

  /* ---- mã hoá tại chỗ bảng gói đăng ký ---- */
  if (co('--ma-hoa-goi')) {
    if (!mh.coKhoa()) throw new Error('Chưa có TK_KHOA. Chạy: node nhap.js --tao-khoa');
    const ds = await lark.listAllRecords(cfg.goiTableId);
    const F = cfg.f.goi;
    const map = {};
    for (const r of ds) {
      const v = r.cells[F.matKhau];
      const t = Array.isArray(v) ? v.map((x) => (x && x.text) || x).join('') : s(v);
      if (t && !mh.daMaHoa(t)) map[r.record_id] = { [F.matKhau]: mh.maHoa(t) };
    }
    console.log('Bảng gói đăng ký: ' + ds.length + ' dòng, ' + Object.keys(map).length + ' ô mật khẩu còn chữ thường.');
    if (THU || !Object.keys(map).length) { console.log(THU ? '(--thu: không ghi gì)' : 'Không có gì để làm.'); return; }
    /* Kiểm khứ hồi trước khi ghi: giải lại đúng bằng khoá hiện tại. */
    for (const id of Object.keys(map)) mh.giaiMa(map[id][F.matKhau]);
    await lark.updateMany(map, cfg.goiTableId);
    console.log('Đã mã hoá ' + Object.keys(map).length + ' ô.');
    return;
  }

  if (!tep) throw new Error('Thiếu đường dẫn file .xlsx. Ví dụ: node nhap.js --thu "C:\\Users\\ASUS\\Downloads\\TÀI KHOẢN MẬT KHẨU - ROOTY TRIP.xlsx"');
  if (!fs.existsSync(tep)) throw new Error('Không thấy file: ' + tep);

  const dong = docExcel(tep).map(chuyenDong).filter(Boolean);
  const theoNhom = {};
  for (const d of dong) theoNhom[d.nhom] = (theoNhom[d.nhom] || 0) + 1;
  console.log('Đọc được ' + dong.length + ' tài khoản.');
  console.log('  có mật khẩu: ' + dong.filter((d) => d.matKhau).length +
    ' · có mật khẩu cũ: ' + dong.filter((d) => d.matKhauCu).length +
    ' · có người phụ trách: ' + dong.filter((d) => d.phuTrachChu).length);
  for (const [k, v] of Object.entries(theoNhom)) console.log('  ' + k.padEnd(20) + v);
  if (THU) {
    console.log('\nXem trước (mật khẩu đã che):');
    for (const d of dong) {
      console.log('  ' + String(d.stt || '').padStart(3) + '  ' + d.nhom.padEnd(18) + ' ' +
        (d.nenTang || '').slice(0, 26).padEnd(26) + ' ' + (d.user || '').slice(0, 30).padEnd(30) +
        ' ' + (d.matKhau ? '••••' : '(trống)'));
    }
    console.log('\n(--thu: không ghi gì lên Base)');
    return;
  }

  if (!mh.coKhoa()) throw new Error('Chưa có TK_KHOA. Chạy trước: node nhap.js --tao-khoa');
  const daCo = await lark.listAllRecords(cfg.tkTableId);
  if (daCo.length && !co('--them')) {
    throw new Error('Bảng Tài khoản đã có ' + daCo.length + ' dòng — không nhập chồng. Thêm cờ --them nếu thật sự muốn nhập thêm.');
  }

  const F = cfg.f.tk;
  const rows = dong.map((d) => {
    const o = {
      [F.stt]: d.stt,
      [F.ten]: d.ten,
      [F.nenTang]: d.nenTang,
      [F.nhom]: d.nhom,
      [F.link]: d.link || null,
      [F.user]: d.user || null,
      [F.matKhau]: d.matKhau ? mh.maHoa(d.matKhau) : null,
      [F.matKhauCu]: d.matKhauCu ? mh.maHoa(d.matKhauCu) : null,
      [F.doiLuc]: d.doiLuc,
      [F.sdt]: d.sdt || null,
      [F.phuTrachChu]: d.phuTrachChu || null,
      [F.trangThai]: 'Đang dùng',
      [F.ghiChu]: d.ghiChu || null,
    };
    /* Kiểm khứ hồi TỪNG ô trước khi gửi: giải ra phải đúng chữ gốc. */
    if (d.matKhau && mh.giaiMa(o[F.matKhau]) !== d.matKhau) throw new Error('Mã hoá khứ hồi sai ở dòng ' + d.stt);
    return o;
  });
  for (let i = 0; i < rows.length; i += 100) {
    await lark.createMany(rows.slice(i, i + 100), cfg.tkTableId);
    console.log('  đã ghi ' + Math.min(i + 100, rows.length) + '/' + rows.length);
  }
  console.log('Xong. Mật khẩu trên Base đều ở dạng enc:v1:… — mở app để xem.');
  console.log('→ Sau khi kiểm trong app thấy đủ, hãy XOÁ file Excel gốc (và thùng rác), vì nó vẫn để chữ thường.');
}

if (require.main === module) main().catch((e) => { console.error('LỖI: ' + e.message); process.exit(1); });

module.exports = { chuyenDong, nhomCua };
