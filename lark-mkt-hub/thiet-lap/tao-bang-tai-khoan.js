'use strict';
/**
 * Tạo bảng "Tài khoản" trong Base của hub — chỗ giữ tài khoản/mật khẩu cho
 * người KHÔNG có tài khoản Lark.
 *
 * Chạy: node thiet-lap/tao-bang-tai-khoan.js          (chỉ in ra, KHÔNG ghi)
 *       node thiet-lap/tao-bang-tai-khoan.js --that   (tạo thật)
 *
 * Giữ lại trong kho chứ không phải script dùng một lần: đây là bản mô tả duy
 * nhất nói bảng gồm cột nào và vì sao. Dựng lại (đổi tenant, làm bản thử, lỡ
 * xoá bảng) thì chạy lại, khỏi bấm tay.
 *
 * Gọi qua execFile chứ không qua shell: tên cột có dấu tiếng Việt, mà shell trên
 * máy này băm UTF-8 trong tham số — Base đã từng từ chối giá trị vì đúng lý do
 * đó.
 *
 * Chạy bằng phiên lark-cli của máy (`--as user`), nên Base phải là Base anh Hùng
 * mở được. Bảng tạo xong vẫn phải chia sẻ cho APP Lark quyền sửa, nếu không bản
 * trên Render ghi vào sẽ trả 91403 — script in lại nhắc đó ở cuối.
 */
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const THAT = process.argv.includes('--that');
const BASE = process.env.HUB_TK_BASE || process.env.HUB_TB_BASE || 'JhZtbxv0gamk5ys3Fr0luHnsgwG';

function cliScript() {
  const rel = path.join('node_modules', '@larksuite', 'cli', 'scripts', 'run.js');
  const roots = [
    path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'npm'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'npm'),
    '/usr/local/lib', '/usr/lib',
  ];
  for (const r of roots) { const p = path.join(r, rel); if (fs.existsSync(p)) return p; }
  throw new Error('Không tìm thấy lark-cli');
}

function cli(args) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [cliScript(), ...args],
      { timeout: 120000, maxBuffer: 32 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        const raw = String(stdout || '').trim();
        let j = null;
        const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
        if (s >= 0 && e > s) { try { j = JSON.parse(raw.slice(s, e + 1)); } catch (_) {} }
        if (j && j.ok === false) return reject(new Error(JSON.stringify(j.error)));
        if (err && !j) return reject(new Error((stderr || err.message || '').slice(0, 600)));
        resolve((j && j.data) || {});
      });
  });
}

const chon = (...ten) => ({ options: ten.map((name) => ({ name })) });

/* Cột đầu là cột chính của bảng, Base không cho xoá — để Email ở đó vì nó là
 * thứ định danh tài khoản, nhìn vào Base là biết ngay dòng nào của ai. */
const COT = [
  { type: 'text', name: 'Email',
    description: 'Tên đăng nhập. Chữ thường, duy nhất. Đây là khoá khớp với bảng Phân quyền app.' },
  { type: 'text', name: 'Tên', description: 'Tên hiển thị trong app.' },
  { type: 'text', name: 'Băm',
    description: 'scrypt$1$N$r$p$muối$băm — KHÔNG phải mật khẩu. Sửa tay ô này là khoá người đó ra ngoài; '
      + 'muốn đặt lại mật khẩu thì dùng nút trong app.' },
  { type: 'select', name: 'Trạng thái', ...chon('Chờ duyệt', 'Hoạt động', 'Khoá', 'Từ chối'),
    description: 'Chỉ "Hoạt động" mới đăng nhập được. Người mới đăng ký vào "Chờ duyệt".' },
  { type: 'text', name: 'Tạo lúc', description: 'ISO, lúc bấm đăng ký.' },
  { type: 'text', name: 'Duyệt lúc', description: 'ISO, lúc quản lý duyệt.' },
  { type: 'text', name: 'Đăng nhập cuối', description: 'ISO. Rỗng nghĩa là chưa vào lần nào.' },
  { type: 'text', name: 'Phiên từ',
    description: 'Mốc ms. Mọi cookie cấp TRƯỚC mốc này hết hiệu lực — đây là cách đăng xuất/khoá/đổi '
      + 'mật khẩu đá được các phiên đang mở, vì hub không giữ kho phiên ở server.' },
  { type: 'text', name: 'Ghi chú', description: 'Quản lý ghi tay: ai giới thiệu, làm việc gì, tới bao giờ.' },
];

/** Bảng "Tài khoản" đã có chưa — trả về table_id, hoặc '' nếu chưa. */
async function timBang() {
  const d = await cli(['base', '+table-list', '--as', 'user',
    '--base-token', BASE, '--format', 'json']);
  const ds = d.tables || d.items || [];
  const t = ds.find((x) => String(x.name || '').trim() === 'Tài khoản');
  return t ? (t.table_id || t.id || '') : '';
}

async function chay() {
  console.log('');
  console.log('Base: ' + BASE);
  console.log('Bảng: "Tài khoản" — ' + COT.length + ' cột');
  COT.forEach((c) => console.log('   · ' + c.name + '  [' + c.type + ']'));
  console.log('');

  /* Hỏi trước khi tạo. Chạy lại lần hai mà không hỏi là Base có HAI bảng cùng
   * tên, hub đọc một bảng còn người đăng ký rơi vào bảng kia — hỏng kiểu không
   * ai nhìn ra, vì cả hai bảng đều trông đúng. */
  const daCo = await timBang().catch(() => '');
  if (daCo) {
    console.log('='.repeat(66));
    console.log('  Bảng "Tài khoản" ĐÃ CÓ rồi: ' + daCo);
    console.log('  Không tạo lại (hai bảng cùng tên là hỏng kiểu khó tìm).');
    console.log('');
    console.log('  Việc cần làm: Render → Environment → HUB_TK_TABLE = ' + daCo);
    console.log('='.repeat(66));
    console.log('');
    return;
  }

  if (!THAT) {
    console.log('Đây mới là bản xem trước, CHƯA ghi gì.');
    console.log('Chạy lại với  --that  để tạo thật.');
    console.log('');
    return;
  }

  console.log('Đang tạo…');
  await cli(['base', '+table-create', '--as', 'user',
    '--base-token', BASE,
    '--name', 'Tài khoản',
    '--fields', JSON.stringify(COT),
    '--format', 'json']);

  /* HỎI LẠI Base thay vì đọc table_id từ phản hồi của lệnh tạo.
   *
   * Ngày 22/09/2026 lệnh này chạy THÀNH CÔNG — bảng nằm sẵn trong Base — nhưng
   * phản hồi trả về danh sách `fields` chứ không có `table_id`, nên script báo
   * "Không lấy được table_id" và nhìn y như tạo hỏng. Anh Hùng suýt chạy lại
   * lần nữa, mà chạy lại là có hai bảng cùng tên.
   *
   * Hình dạng phản hồi của lark-cli không khớp tài liệu và đã đổi vài lần (xem
   * chú thích tương tự trong lark-bao-cao/thiet-lap/tao-base.js). Hỏi lại danh
   * sách bảng thì không phụ thuộc vào hình dạng đó nữa. */
  const tid = await timBang();
  if (!tid) throw new Error('Tạo xong nhưng không thấy bảng "Tài khoản" trong Base. Mở Base kiểm tay.');

  console.log('');
  console.log('='.repeat(66));
  console.log('  Đã tạo. table_id = ' + tid);
  console.log('');
  console.log('  CÒN HAI BƯỚC, thiếu là đăng nhập mật khẩu không chạy:');
  console.log('');
  console.log('  1. Render → Environment → thêm biến:');
  console.log('        HUB_TK_TABLE = ' + tid);
  console.log('     (chưa khai biến này thì hub coi như KHÔNG có tính năng — trang');
  console.log('      đăng nhập chỉ hiện nút Lark, không hiện ô mật khẩu.)');
  console.log('');
  console.log('  2. Base ' + BASE + ' phải chia sẻ cho APP Lark quyền SỬA.');
  console.log('     Base này app đã đọc/ghi được (bảng Phân quyền, Thông báo nằm');
  console.log('     cùng đây) nên gần như chắc đã có — kiểm lại cho chắc.');
  console.log('='.repeat(66));
  console.log('');
}

chay().catch((e) => { console.error('\n  Hỏng: ' + e.message + '\n'); process.exitCode = 1; });
