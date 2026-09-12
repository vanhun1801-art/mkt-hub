'use strict';
/**
 * Dựng Base "Báo cáo công việc MKT" từ con số không.
 *
 * Giữ lại trong repo chứ không phải script dùng một lần rồi xoá: đây là bản mô
 * tả duy nhất nói rõ Base gồm những cột nào và vì sao. Cần dựng lại (đổi tenant,
 * làm bản thử, Base hỏng) thì chạy lại file này, khỏi phải bấm tay 30 cột.
 *
 * Chạy: node thiet-lap/tao-base.js          (in ra việc sẽ làm, KHÔNG ghi)
 *       node thiet-lap/tao-base.js --that   (tạo thật)
 *
 * Gọi qua execFile chứ không qua shell: payload có dấu tiếng Việt, mà bash trên
 * máy này băm UTF-8 trong tham số — Base đã từng từ chối giá trị select vì lý do
 * đúng như vậy.
 */
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

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

/* ---------------------------------------------------------------- bảng 1 */
/* Một phiếu = một người × một kỳ. Phiếu tuần/tháng KHÔNG có dòng việc riêng —
 * số của nó cộng từ các phiếu ngày, người chỉ viết thêm nhận định. */
const PHIEU = [
  /* Cột đầu là cột chính của bảng, Base không cho xoá. Để mã phiếu ở đây vì nó
   * là thứ duy nhất bảo đảm không tạo hai phiếu cho cùng một người một ngày. */
  { type: 'text', name: 'Mã phiếu',
    description: 'ngay|tuan|thang + mốc bắt đầu + open_id. Khoá chống trùng — một người một kỳ chỉ một phiếu.' },
  { type: 'select', name: 'Loại kỳ', ...chon('Ngày', 'Tuần', 'Tháng') },
  { type: 'datetime', name: 'Từ ngày' },
  { type: 'datetime', name: 'Đến ngày' },
  { type: 'text', name: 'Người',
    description: 'open_id. Khác nhau giữa app Lark local và app trên Render — nên luôn ghi kèm Email.' },
  { type: 'text', name: 'Email', style: { type: 'email' },
    description: 'Khoá phụ để ghép người khi open_id không khớp giữa hai app.' },
  { type: 'text', name: 'Tên người' },
  { type: 'select', name: 'Ca', ...chon('Cả ngày', 'Nửa ngày', 'Khác') },
  { type: 'number', name: 'Định mức phút',
    description: 'Cả ngày 480 · Nửa ngày 240 · Khác thì tự khai.' },
  { type: 'number', name: 'Tổng phút' },
  { type: 'number', name: '% hoàn thành',
    description: 'Tổng phút / Định mức. Chia cho chính tổng của mình thì ai cũng ra 100% và con số đó vô nghĩa.' },
  { type: 'text', name: 'Nhận định',
    description: 'Người viết. Đây là phần AI đọc để đánh giá, không phải mấy con số.' },
  { type: 'text', name: 'Kế hoạch kỳ sau' },
  { type: 'select', name: 'Trạng thái', ...chon('Nháp', 'Đã nộp') },
  { type: 'datetime', name: 'Nộp lúc' },
  { type: 'datetime', name: 'Hạn nộp',
    description: 'Ngày: hết ngày đó · Tuần: hết ngày cuối tuần · Tháng: hết ngày đầu tiên của tháng sau.' },
  { type: 'select', name: 'Đúng hạn', ...chon('Đúng hạn', 'Trễ', 'Thiếu') },
  { type: 'number', name: 'Trễ (phút)' },
  /* Vướng mắc nhân sự tự nêu. Quản lý xem gom một chỗ ở màn "Cần hỗ trợ" —
   * anh Hùng: "liệt kê tổng hợp lại cái vấn đề cần giúp đỡ của nhân viên". */
  { type: 'text', name: 'Cần hỗ trợ' },
  /* Hai cột dưới còn trống ở giai đoạn này. Tạo sẵn vì thêm cột vào bảng đã có
   * vài nghìn dòng phiền hơn nhiều so với để trống vài tháng. */
  { type: 'text', name: 'Đánh giá AI' },
  { type: 'number', name: 'Điểm AI' },
];

/* ---------------------------------------------------------------- bảng 2 */
/* Mỗi đầu việc một bản ghi. Đây là toàn bộ lý do làm app này: nội dung đang nằm
 * trong ảnh chụp màn hình nên không tìm được, không cộng được, không đưa cho AI
 * đọc được. Tách thành dòng thì cả ba việc đó thành chuyện thường. */
const DONG = [
  { type: 'text', name: 'Công việc' },
  { type: 'text', name: 'Mã phiếu', description: 'Nối về bảng Phiếu báo cáo.' },
  { type: 'datetime', name: 'Ngày' },
  { type: 'text', name: 'Người' },
  { type: 'text', name: 'Email', style: { type: 'email' } },
  { type: 'text', name: 'Tên người' },
  /* Nhóm lấy từ chính báo cáo đang gửi trong nhóm Phòng MKT, không bịa ra. */
  { type: 'select', name: 'Nhóm việc',
    ...chon('Page', 'TikTok', 'Edit video', 'Chỉnh ảnh', 'Thiết kế', 'Kịch bản',
      'Chụp/Quay', 'Chạy quảng cáo', 'Báo cáo', 'Họp', 'Khác') },
  { type: 'number', name: 'Số phút' },
  /* Tiến độ đo bằng SỐ là mặc định (anh Hùng chốt 12/09): cộng được, so được,
   * và phát hiện được đầu việc đứng yên nhiều ngày — thứ mà ô chữ không làm nổi. */
  { type: 'number', name: 'Tiến độ %',
    description: '0–100. Ô "Tiến độ" chữ bên dưới chỉ để mô tả thêm.' },
  { type: 'text', name: 'Mã việc tracking',
    description: 'record_id bên Bảng công việc. Rỗng = việc gõ tay, chỉ nhóm "Khác" mới được gõ tay.' },
  { type: 'text', name: 'Tiến độ',
    description: 'Người viết tự do, ví dụ "Rạch Vẹm - HT 100% - Kịch bản + voice AI". Chỗ AI đọc.' },
  { type: 'select', name: 'Trạng thái việc',
    ...chon('Hoàn thành', 'Đang làm', 'Tạm dừng', 'Huỷ') },
  { type: 'text', name: 'Ghi chú' },
];

(async () => {
  if (!THAT) {
    console.log('THỬ — chưa ghi gì cả. Thêm --that để tạo thật.\n');
    console.log('Sẽ tạo Base "Báo cáo công việc MKT" (Asia/Bangkok = UTC+7) gồm:');
    console.log('  Bảng "Phiếu báo cáo" — ' + PHIEU.length + ' cột:');
    PHIEU.forEach((f) => console.log('    · ' + f.name + '  [' + f.type + ']'));
    console.log('  Bảng "Dòng việc" — ' + DONG.length + ' cột:');
    DONG.forEach((f) => console.log('    · ' + f.name + '  [' + f.type + ']'));
    return;
  }

  console.log('Tạo Base…');
  const base = await cli(['base', '+base-create', '--as', 'user',
    '--name', 'Báo cáo công việc MKT',
    /* Lark từ chối 'Asia/Ho_Chi_Minh' ("not a valid IANA timezone") dù đó là
     * tên IANA thật — danh sách của họ hẹp hơn. Bangkok cùng UTC+7 và không đổi
     * giờ mùa, nên mọi mốc ngày rơi đúng chỗ. */
    '--time-zone', 'Asia/Bangkok',
    '--table-name', 'Phiếu báo cáo',
    '--fields', JSON.stringify(PHIEU),
    '--format', 'json']);

  /* Hình dạng trả về của +base-create khong giong tai lieu: token nam o
   * data.app.app_token chu khong phai data.app_token, va +table-list tra ve
   * data.tables[].id chu khong phai items[].table_id. Do doan mo tat ca cac
   * duong thay vi doan mot duong — doan sai thi buoc sau bao NOTEXIST, ma loi
   * do nghe nhu Base khong ton tai chu khong nhu doc nham mot khoa. */
  const token = base.app_token || (base.app && base.app.app_token) ||
    (base.base && base.base.app_token);
  const url = base.url || (base.app && base.app.url) || '';
  if (!token) throw new Error('Khong lay duoc base_token tu: ' + JSON.stringify(base).slice(0, 400));
  console.log('  base_token: ' + token);
  if (url) console.log('  url: ' + url);

  console.log('Tạo bảng "Dòng việc"…');
  const t2 = await cli(['base', '+table-create', '--as', 'user',
    '--base-token', token,
    '--name', 'Dòng việc',
    '--fields', JSON.stringify(DONG),
    '--format', 'json']);
  console.log('  table_id: ' + (t2.table_id || JSON.stringify(t2)));

  console.log('\nLiệt kê lại để lấy id thật của từng cột…');
  const bang = await cli(['base', '+table-list', '--as', 'user',
    '--base-token', token, '--format', 'json']);
  for (const t of (bang.tables || bang.items || [])) {
    const tid = t.table_id || t.id;
    console.log('  bảng ' + t.name + ' = ' + tid);
    const fl = await cli(['base', '+field-list', '--as', 'user',
      '--base-token', token, '--table-id', tid, '--format', 'json']);
    for (const f of (fl.fields || fl.items || [])) {
      console.log('    ' + (f.field_id || f.id) + '  ' +
        (f.field_name || f.name) + '  [' + f.type + ']');
    }
  }
})().catch((e) => { console.error('HỎNG: ' + e.message); process.exit(1); });
