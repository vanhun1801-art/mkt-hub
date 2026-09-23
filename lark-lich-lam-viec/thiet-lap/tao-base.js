'use strict';
/**
 * Dựng Base "Lịch làm việc MKT" từ con số không.
 *
 * Khuôn lấy từ bảng LLV hằng tháng của phòng HCNS (wiki K3H2w9JQli3rwAkKPUYlXKlhgHb,
 * tab "LLV 09.2026"): mỗi người một hàng, mỗi ngày một ô mang MÃ CÔNG (x, x/2,
 * OFF, NP…). Base giữ đúng hình đó — một phiếu = một người × một tháng, ba mươi
 * mốt cột "Ngày 01…31" — để lúc chép sang sheet HCNS chỉ là dán một khối, không
 * phải xoay dữ liệu.
 *
 * Chạy: node thiet-lap/tao-base.js          (in ra việc sẽ làm, KHÔNG ghi)
 *       node thiet-lap/tao-base.js --that   (tạo thật)
 */
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const MA = require('../ma-cong');

const THAT = process.argv.includes('--that');

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
const p2 = (n) => String(n).padStart(2, '0');

/* ---------------------------------------------------------------- bảng 1 */
const DANG_KY = [
  { type: 'text', name: 'Mã phiếu',
    description: 'YYYY-MM|Mã NV. Khoá chống trùng — một người một tháng chỉ một phiếu.' },
  { type: 'text', name: 'Tháng', description: 'YYYY-MM' },
  { type: 'text', name: 'Mã NV', description: 'Mã nhân viên bên HCNS (RT00xxx).' },
  { type: 'text', name: 'Họ tên' },
  { type: 'text', name: 'Chức vụ' },
  { type: 'text', name: 'Người', description: 'open_id của người nộp (theo app Lark của hub).' },
  { type: 'text', name: 'Email', style: { type: 'email' } },
  { type: 'select', name: 'Trạng thái', ...chon('Nháp', 'Đã nộp', 'Đã chuyển HCNS') },
  { type: 'number', name: 'Công chuẩn',
    description: 'Công của lịch chuẩn công ty trong tháng: CN nghỉ, T7 tuần 2 và tuần 4 làm nửa ngày.' },
  { type: 'number', name: 'Tổng công', description: 'Cộng theo cột "Tính công" của bảng mã HCNS.' },
  { type: 'number', name: 'Ngày nghỉ', description: 'Số ngày không đi làm, quy ra ngày (nửa ngày = 0,5), không tính Chủ nhật.' },
  { type: 'datetime', name: 'Nộp lúc' },
  { type: 'datetime', name: 'Sửa lúc' },
  { type: 'datetime', name: 'Chuyển HCNS lúc' },
  { type: 'checkbox', name: 'Sửa sau khi chuyển',
    description: 'Người đó sửa lịch SAU lần chép sang HCNS — phải chép lại.' },
  { type: 'text', name: 'Ghi chú' },
  ...Array.from({ length: 31 }, (_, i) => ({
    type: 'select', name: 'Ngày ' + p2(i + 1), ...chon(...MA.DANH_SACH.map((m) => m.ma)),
  })),
];

/* ---------------------------------------------------------------- bảng 2 */
/* Danh sách người phải đăng ký, đúng thứ tự dòng bên sheet HCNS — thứ tự này
 * chính là thứ tự khối dán sang. */
const NHAN_SU = [
  { type: 'text', name: 'Họ tên' },
  { type: 'text', name: 'Mã NV' },
  { type: 'text', name: 'Chức vụ' },
  { type: 'number', name: 'Thứ tự', description: 'Thứ tự dòng trong sheet LLV của HCNS.' },
  { type: 'checkbox', name: 'Đang làm' },
  { type: 'text', name: 'Người', description: 'open_id — app tự điền lần đầu người đó mở app.' },
  { type: 'text', name: 'Email', style: { type: 'email' } },
];

/* Lấy từ khối PHÒNG MARKETING của tab LLV 09.2026. Võ Nguyễn Như Quỳnh chỉ có
 * công tới 06/09 rồi bỏ trống nên để Đang làm = tắt. */
const DS_NHAN_SU = [
  ['Lê Văn Hùng', 'RT00254', 'Trưởng Phòng MKT', true],
  ['Phù Mỹ Hân', 'RT00185', 'Leader SEO', true],
  ['Võ Nguyễn Như Quỳnh', 'RT00305', 'Nhân viên SEO', false],
  ['Nguyễn Hồng Ngọc', 'RT00289', 'Content marketing', true],
  ['Huỳnh Thị Anh Thư', 'RT00276', 'Content marketing', true],
  ['Võ Thị Cẩm Hằng', 'RT00140', 'Content marketing', true],
  ['Nguyễn Long Khánh', 'RT00224', 'Video editor', true],
  ['Danh Minh Trường', 'RT00236', 'Video editor', true],
  ['Huỳnh Chí Khanh', 'RT00376', 'Video editor', true],
];

/* ---------------------------------------------------------------- bảng 3 */
const NGAY_LE = [
  { type: 'text', name: 'Tên ngày lễ' },
  { type: 'datetime', name: 'Ngày' },
];
const DS_LE = [
  ['Quốc khánh', '2026-09-02'],
  ['Quốc khánh (nghỉ bù)', '2026-09-03'],
  ['Tết Dương lịch', '2027-01-01'],
];

(async () => {
  if (!THAT) {
    console.log('THỬ — chưa ghi gì cả. Thêm --that để tạo thật.\n');
    console.log('Bảng "Đăng ký tháng" — ' + DANG_KY.length + ' cột');
    console.log('Bảng "Nhân sự" — ' + NHAN_SU.length + ' cột, ' + DS_NHAN_SU.length + ' người');
    console.log('Bảng "Ngày lễ" — ' + DS_LE.length + ' ngày');
    return;
  }

  /* --tiep <token>: Base đã tạo ở lượt trước nhưng script hỏng giữa chừng. */
  const tiep = process.argv[process.argv.indexOf('--tiep') + 1];
  console.log('Tạo Base…');
  const base = process.argv.includes('--tiep') ? { base: { base_token: tiep } } : await cli(['base', '+base-create', '--as', 'user',
    '--name', 'Lịch làm việc MKT',
    /* Lark từ chối 'Asia/Ho_Chi_Minh'. Bangkok cùng UTC+7, không đổi giờ mùa. */
    '--time-zone', 'Asia/Bangkok',
    '--table-name', 'Đăng ký tháng',
    '--fields', JSON.stringify(DANG_KY),
    '--format', 'json']);
  const token = base.app_token || (base.app && base.app.app_token) ||
    (base.base && (base.base.app_token || base.base.base_token));
  if (!token) throw new Error('Không lấy được base_token: ' + JSON.stringify(base).slice(0, 400));
  console.log('  base_token: ' + token);
  console.log('  url: ' + (base.url || (base.app && base.app.url) || ''));

  const t2 = await cli(['base', '+table-create', '--as', 'user', '--base-token', token,
    '--name', 'Nhân sự', '--fields', JSON.stringify(NHAN_SU), '--format', 'json']);
  const t3 = await cli(['base', '+table-create', '--as', 'user', '--base-token', token,
    '--name', 'Ngày lễ', '--fields', JSON.stringify(NGAY_LE), '--format', 'json']);
  const idNS = t2.table_id || (t2.table && (t2.table.table_id || t2.table.id));
  const idLe = t3.table_id || (t3.table && (t3.table.table_id || t3.table.id));
  console.log('  Nhân sự: ' + idNS + '  ·  Ngày lễ: ' + idLe);

  await cli(['base', '+record-batch-create', '--as', 'user', '--base-token', token,
    '--table-id', idNS, '--json', JSON.stringify({
      fields: ['Họ tên', 'Mã NV', 'Chức vụ', 'Thứ tự', 'Đang làm'],
      rows: DS_NHAN_SU.map((r, i) => [r[0], r[1], r[2], i + 1, r[3]]),
    })]);
  /* Chuỗi giờ trần = giờ của chính Base (xem memory lark-base-ghi-ngay). */
  await cli(['base', '+record-batch-create', '--as', 'user', '--base-token', token,
    '--table-id', idLe, '--json', JSON.stringify({
      fields: ['Tên ngày lễ', 'Ngày'],
      rows: DS_LE.map((r) => [r[0], r[1] + ' 00:00:00']),
    })]);

  console.log('\nId thật của từng cột:');
  const bang = await cli(['base', '+table-list', '--as', 'user', '--base-token', token, '--format', 'json']);
  for (const t of (bang.tables || bang.items || [])) {
    const tid = t.table_id || t.id;
    console.log('  bảng ' + t.name + ' = ' + tid);
    const fl = await cli(['base', '+field-list', '--as', 'user', '--base-token', token,
      '--table-id', tid, '--format', 'json']);
    for (const f of (fl.fields || fl.items || [])) {
      console.log('    ' + (f.field_id || f.id) + '  ' + (f.field_name || f.name) + '  [' + f.type + ']');
    }
  }
  console.log('\nNHỚ: mời app Marketing Hub (cli_aa1a8ae21a78ded2) vào Base với quyền Quản lý, ' +
    'không thì bản trên Render báo 91403.');
})().catch((e) => { console.error('HỎNG: ' + e.message); process.exit(1); });
