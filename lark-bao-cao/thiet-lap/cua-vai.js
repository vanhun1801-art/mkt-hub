'use strict';
/**
 * ============================================================================
 * CỬA XEM THEO VAI — mở app dưới danh tính của từng người, ngay trên máy
 * ============================================================================
 * Anh Hùng muốn xem app "đúng như nhân sự đang thấy" trước khi giao việc mới.
 *
 * Vì sao phải có lớp này: app nhận danh tính qua header `x-hub-user-*` (đúng
 * đường Hub đẩy xuống app con). Trình duyệt thì không gắn header vào được khi
 * ta chỉ gõ một địa chỉ. Lớp này đứng giữa — mỗi người một cổng, nhận request,
 * gắn header rồi chuyển tiếp sang app thật.
 *
 * Danh sách người ĐỌC TỪ BẢNG PHÂN QUYỀN, không cắm cứng trong mã: thêm bớt
 * nhân sự thì chạy lại là xong, và repo không phải chứa open_id của ai cả.
 *
 * Chạy:  node server.js            (app thật, cổng 5183 hoặc PORT)
 *        node thiet-lap/cua-vai.js (các cửa, in ra bảng link)
 *
 * CHỈ nghe 127.0.0.1. Đây là cửa bỏ qua đăng nhập — mở ra mạng là ai cũng
 * vào được dưới tên người khác.
 */
const http = require('http');
const lark = require('../lark');

const APP = Number(process.env.CONG_APP || 5193);
const DAU = Number(process.env.CONG_DAU || 5200);   // 5200 = quản lý, rồi 5201, 5202…
const BASE_QUYEN = process.env.HUB_QUYEN_BASE || 'JhZtbxv0gamk5ys3Fr0luHnsgwG';
const BANG_QUYEN = process.env.HUB_QUYEN_TABLE || 'tblBKm6ZurhN3703';
/* Ai là quản lý — khai bằng EMAIL như hub (open_id khác nhau giữa các app). */
const QL = String(process.env.LARK_MANAGER_EMAILS || 'hunglv@rootytrip.com')
  .split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

function moCua(cong, nguoi) {
  const h0 = {
    'x-hub-user-id': nguoi.id || '',
    'x-hub-user-email': nguoi.email || '',
    'x-hub-user-name': encodeURIComponent(nguoi.ten || ''),
  };
  /* Có mặt header = quản lý; vắng = nhân sự. Đừng gắn '0' — app đọc theo SỰ CÓ
   * MẶT của giá trị '1', nhưng để rõ ý thì xoá hẳn khi là nhân sự. */
  if (nguoi.quanLy) h0['x-hub-user-manager'] = '1';

  return new Promise((xong, hong) => {
    const s = http.createServer((req, res) => {
      const h = Object.assign({}, req.headers, h0);
      if (!nguoi.quanLy) delete h['x-hub-user-manager'];
      h.host = '127.0.0.1:' + APP;
      const r = http.request({ host: '127.0.0.1', port: APP, path: req.url,
        method: req.method, headers: h },
      (rs) => { res.writeHead(rs.statusCode, rs.headers); rs.pipe(res); });
      r.on('error', (e) => {
        res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Chưa nối được vào app ở cổng ' + APP + ' — đã chạy `node server.js` chưa?\n' + e.message);
      });
      req.pipe(r);
    });
    s.on('error', hong);
    s.listen(cong, '127.0.0.1', () => xong(s));
  });
}

(async () => {
  /* Bản ghi về theo MÃ CỘT (fld…), không theo tên — nên phải xin bảng cột
   * trước. Đọc theo tên cột để đổi tên cột trên Base không làm hỏng tệp này. */
  const [ds, cot] = await Promise.all([
    lark.listAllRecords(BANG_QUYEN, BASE_QUYEN),
    lark.listFields(BANG_QUYEN, BASE_QUYEN),
  ]);
  const maCot = {};
  cot.forEach((f) => { maCot[f.field_name || f.name] = f.field_id || f.id; });
  const lay = (r, ten) => {
    const v = (r.cells || {})[maCot[ten]];
    if (v == null) return '';
    if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : (x && (x.text || x.name)) || '')).join('');
    if (typeof v === 'object') return v.text || v.name || '';
    return String(v);
  };

  const nguoi = ds.map((r) => ({
    ten: lay(r, 'Người').trim(),
    viTri: lay(r, 'Vị trí').trim(),
    email: lay(r, 'Email').trim(),
    id: lay(r, 'open_id').trim(),
  })).filter((n) => n.ten && /^ou_/.test(n.id));   // bỏ dòng chưa có open_id thật

  /* Quản lý đứng đầu, rồi nhân sự xếp theo vị trí cho dễ tìm. */
  nguoi.forEach((n) => { n.quanLy = QL.includes(n.email.toLowerCase()); });
  nguoi.sort((a, b) => (b.quanLy - a.quanLy) || a.viTri.localeCompare(b.viTri, 'vi') ||
    a.ten.localeCompare(b.ten, 'vi'));

  const mo = [];
  let cong = DAU;
  for (const n of nguoi) {
    try {
      await moCua(cong, n);
      mo.push({ cong, n });
    } catch (e) {
      console.log('  (bỏ cổng ' + cong + ' — ' + e.code + ')');
    }
    cong++;
  }

  console.log('\nApp thật: http://localhost:' + APP + '  (danh tính của chính máy này)\n');
  console.log('  CỔNG   VAI       VỊ TRÍ      NGƯỜI');
  mo.forEach(({ cong: c, n }) => {
    console.log('  ' + String(c).padEnd(6) + ' ' + (n.quanLy ? 'Quản lý ' : 'Nhân sự ').padEnd(9) +
      ' ' + (n.viTri || '—').padEnd(11) + ' ' + n.ten + '   → http://localhost:' + c);
  });
  console.log('\nCtrl+C để đóng hết. Mỗi cửa là một danh tính — xem thì thoải mái, ' +
    'nhưng bấm Nộp là ghi phiếu THẬT đứng tên người đó.');
})().catch((e) => { console.error('HỎNG: ' + e.message); process.exit(1); });
