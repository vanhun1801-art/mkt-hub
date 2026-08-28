'use strict';
/**
 * Kiểm thử chỉ-đọc cho lớp vỏ. Không ghi gì lên Lark Base.
 *
 *   node test/api.test.js            (hub phải đang chạy ở cổng 5180)
 *   HUB=http://localhost:5180 node test/api.test.js
 *
 * Mỗi module kiểu 'local' phải đang chạy (hub tự bật, hoặc chạy sẵn bằng start.bat)
 * — nếu chưa chạy thì các phép thử của module đó được ghi là BỎ QUA, không tính lỗi.
 */
const http = require('http');

const GOC = (process.env.HUB || 'http://localhost:5180').replace(/\/+$/, '');
let pass = 0, fail = 0, bo = 0;

function ok(dieuKien, ten, chiTiet) {
  if (dieuKien) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; console.log('  ✗ ' + ten + (chiTiet ? '  → ' + chiTiet : '')); }
}
const boQua = (ten, vi) => { bo++; console.log('  – ' + ten + '  (bỏ qua: ' + vi + ')'); };

function goi(duongDan, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(GOC + duongDan);
    const than = opts.body == null ? null : Buffer.from(JSON.stringify(opts.body), 'utf8');
    const req = http.request(
      {
        host: u.hostname, port: u.port, path: u.pathname + u.search,
        method: opts.method || 'GET', timeout: 45000,
        headers: Object.assign(
          than ? { 'content-type': 'application/json; charset=utf-8', 'content-length': than.length } : {},
          opts.headers || {}
        ),
      },
      (res) => {
        const buf = [];
        res.on('data', (c) => buf.push(c));
        res.on('end', () => resolve({ code: res.statusCode, headers: res.headers, raw: Buffer.concat(buf).toString('utf8') }));
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (than) req.write(than);
    req.end();
  });
}
const json = async (p, opts) => {
  const r = await goi(p, opts);
  try { r.data = JSON.parse(r.raw); } catch (_) { r.data = null; }
  return r;
};

(async function () {
  console.log('\nKiểm thử Marketing Hub · ' + GOC + '\n');

  /* ---- 1. lớp vỏ ---- */
  console.log('[1] Lớp vỏ');
  const hz = await json('/healthz');
  ok(hz.code === 200 && hz.data && hz.data.ok === true, 'GET /healthz trả ok', hz.raw.slice(0, 120));

  const hub = await json('/api/hub');
  ok(hub.code === 200 && Array.isArray(hub.data.modules), 'GET /api/hub trả danh sách module');
  const mods = (hub.data && hub.data.modules) || [];
  ok(mods.length > 0, 'Có ít nhất 1 module trong modules.json');
  ok(mods.every((m) => m.id && m.ten && m.kieu), 'Module nào cũng có id/ten/kieu');
  ok(new Set(mods.map((m) => m.id)).size === mods.length, 'id module không trùng nhau');
  const congs = mods.filter((m) => m.kieu === 'local').map((m) => m.cong);
  ok(new Set(congs).size === congs.length, 'Không có hai module local dùng chung cổng');

  const trang = await goi('/');
  ok(trang.code === 200 && /Marketing Hub/.test(trang.raw), 'GET / trả trang lớp vỏ');
  const css = await goi('/styles.css');
  ok(css.code === 200 && /rail/.test(css.raw), 'GET /styles.css có style của panel');
  const js = await goi('/app.js');
  ok(js.code === 200 && /napTongQuan/.test(js.raw), 'GET /app.js có mã lớp vỏ');
  const q404 = await goi('/khong-co-file-nay.txt');
  ok(q404.code === 404, 'File không tồn tại trả 404');
  const api404 = await json('/api/khong-co');
  ok(api404.code === 404 && api404.data && api404.data.error, 'API lạ trả 404 kèm error');

  /* ---- 2. proxy vào từng module ---- */
  console.log('\n[2] Proxy module');
  const dangChay = [];
  for (const m of mods.filter((x) => x.kieu === 'local' && x.bat)) {
    const tt = (m.tinhTrang || {}).trangThai;
    if (!['chay', 'ngoai'].includes(tt)) { boQua('Proxy ' + m.id, 'trạng thái ' + tt); continue; }
    dangChay.push(m);

    const html = await goi('/m/' + m.id + '/');
    ok(html.code === 200 && /<html/i.test(html.raw), 'GET /m/' + m.id + '/ trả HTML');
    ok(/class="trong-hub"/.test(html.raw), '  ' + m.id + ': HTML được đánh dấu trong-hub');
    ok(/data-hub="1"/.test(html.raw), '  ' + m.id + ': đã chèn style + shim của hub');
    /* Hai file của LỚP VỎ (loc.js, i18n.js) cố tình giữ đường dẫn gốc: chúng nằm ở
     * gốc origin và dùng chung cho cả bốn app. Mọi đường dẫn khác phải mang tiền tố. */
    const conTuyetDoi = html.raw.replace(/\s(?:href|src)="\/(?:loc|i18n)\.js[^"]*"/g, ' ');
    ok(!/(\s(?:href|src)=")\/(?!\/|m\/)/.test(conTuyetDoi),
      '  ' + m.id + ': không còn đường dẫn tuyệt đối chưa gắn tiền tố');
    // app.js/styles.css có thể được khai bằng đường dẫn tương đối (như app quảng cáo)
    // — lúc đó không có gì để gắn tiền tố, và trình duyệt vẫn giải đúng dưới /m/<id>/.
    ok(html.raw.includes('"/m/' + m.id + '/') || !/\s(?:href|src)="\//.test(conTuyetDoi),
      '  ' + m.id + ': href/src tuyệt đối (nếu có) đã mang tiền tố /m/<id>/');
    ok(/no-store/.test(String(html.headers['cache-control'] || '')), '  ' + m.id + ': HTML không bị cache');

    const meta = await json('/m/' + m.id + '/api/meta');
    ok(meta.code === 200 && meta.data, '  ' + m.id + ': API /api/meta xuyên proxy trả JSON', meta.raw.slice(0, 100));

    const chuyen = await goi('/m/' + m.id);
    ok(chuyen.code === 302 && String(chuyen.headers.location || '').endsWith('/m/' + m.id + '/'),
      '  ' + m.id + ': /m/<id> chuyển hướng về /m/<id>/');
  }
  const la = await goi('/m/khong-co-module/');
  ok(la.code === 404, 'Proxy vào module không tồn tại trả 404');

  /* ---- 3. tổng quan chung ---- */
  console.log('\n[3] Tổng quan chung');
  const tq = await json('/api/tongquan');
  ok(tq.code === 200 && Array.isArray(tq.data.modules), 'GET /api/tongquan trả danh sách chỉ số');
  ok(Array.isArray(tq.data.canXuLy), 'Có danh sách "cần xử lý" gộp');
  const coKpi = mods.filter((m) => m.bat && m.coKpi).map((m) => m.id);
  coKpi.forEach((id) => {
    const r = (tq.data.modules || []).find((x) => x.id === id);
    if (!r) { ok(false, id + ': thiếu trong /api/tongquan'); return; }
    if (!r.ok) { boQua(id + ': chỉ số', r.loi || 'module chưa sẵn sàng'); return; }
    ok(Array.isArray(r.the) && r.the.length > 0, id + ': có thẻ chỉ số (' + (r.the || []).length + ' thẻ)');
    ok(r.the.every((t) => t.nhan && typeof t.so === 'number' && Number.isFinite(t.so)),
      id + ': mọi thẻ có nhãn và số hữu hạn');
  });
  ok((tq.data.canXuLy || []).every((v) => v.tieuDe && v.module && ['cao', 'vua', 'thap'].includes(v.muc)),
    'Việc cần xử lý nào cũng có tiêu đề, mức và module nguồn');

  /* --- bộ lọc thời gian --- */
  const thang = new Date().toISOString().slice(0, 7);
  const loc = await json('/api/tongquan?tu=' + thang + '-01&den=' + thang + '-28');
  ok(loc.code === 200 && loc.data.khoang && loc.data.khoang.tu === thang + '-01',
    'GET /api/tongquan?tu=&den= trả lại khoảng đã lọc');
  ok(typeof loc.data.ngoaiKhoang === 'number', 'Có đếm việc gấp nằm ngoài khoảng lọc');
  const soLoc = (loc.data.modules.find((x) => x.id === 'cong-viec') || {}).tong;
  const soAll = (tq.data.modules.find((x) => x.id === 'cong-viec') || {}).tong;
  if (soLoc == null || soAll == null) boQua('Bộ lọc thu hẹp dữ liệu', 'không có module cong-viec');
  else ok(soLoc <= soAll, 'Lọc theo tháng cho tập nhỏ hơn hoặc bằng toàn bộ (' + soLoc + ' ≤ ' + soAll + ')');
  const xau = await json('/api/tongquan?tu=khong-phai-ngay&den=x');
  ok(xau.code === 200 && !xau.data.khoang, 'Tham số ngày sai thì bỏ qua bộ lọc, không lỗi');

  const bd = await json('/api/bo-doc-kpi');
  ok(bd.code === 200 && Array.isArray(bd.data.ds) && bd.data.ds.length >= 3, 'GET /api/bo-doc-kpi liệt kê bộ đọc');

  /* ---- 3b. lịch chung ---- */
  console.log('\n[3b] Lịch chung');
  const lc = await json('/api/lich-chung?tu=' + thang + '-01&den=' + thang + '-28');
  ok(lc.code === 200 && Array.isArray(lc.data.ngay) && lc.data.ngay.length === 28,
    'GET /api/lich-chung trả đúng 28 cột ngày');
  ok(Array.isArray(lc.data.hang), 'Có danh sách hàng theo nhân sự');
  ok(lc.data.hang.every((r) => typeof r.ten === 'string' && typeof r.tong === 'number'),
    'Hàng nào cũng có tên và tổng số việc');
  const tongO = lc.data.hang.reduce((s2, r) =>
    s2 + Object.values(r.o || {}).reduce((x, ds) => x + ds.length, 0), 0);
  ok(tongO === lc.data.tongLuot, 'Tổng số ô khớp tổng lượt phụ trách (' + tongO + ')');
  const soTheoNgay = Object.values(lc.data.theoNgay || {}).reduce((x, n) => x + n, 0);
  ok(soTheoNgay === lc.data.tongLuot, 'Tổng theo ngày khớp tổng lượt');
  ok(lc.data.hang.every((r) => Object.keys(r.o || {}).every((n) => lc.data.ngay.includes(n))),
    'Mọi ngày có việc đều nằm trong khoảng đã lọc');
  const xepGiam = lc.data.hang.filter((r) => r.id).map((r) => r.tong);
  ok(xepGiam.every((v, i) => i === 0 || xepGiam[i - 1] >= v), 'Người bị dồn nhiều xếp trước');
  const chua = lc.data.hang.filter((r) => !r.id);
  ok(chua.length <= 1, 'Chỉ có tối đa một hàng "Chưa phân công"');
  // client dựa vào `module` của từng việc để chấm dấu tác nghiệp lên góc ô
  const moiViec = lc.data.hang.flatMap((r) => Object.values(r.o || {}).flat());
  ok(moiViec.every((v) => typeof v.module === 'string' && v.module),
    'Việc nào cũng mang tên base nguồn (để chấm dấu tác nghiệp)');
  ok(moiViec.some((v) => v.module === 'lich-tac-nghiep') || !moiViec.length,
    'Có việc từ base Lịch tác nghiệp trong lưới');
  const rong = await json('/api/lich-chung?tu=2026-01-01&den=2026-12-31');
  ok(rong.code === 400, 'Khoảng quá rộng (>92 ngày) bị từ chối');
  const trong = await json('/api/lich-chung');
  ok(trong.code === 200 && trong.data.ngay.length >= 28, 'Không truyền ngày thì lấy tháng hiện tại');
  /* ---- 3c. cửa sổ xử lý nhanh ----
   * Không có phép thử nào GHI vào Base: chỉ kiểm những đường bị chặn, và kiểm
   * con số trên thẻ đúng bằng số dòng trong nhóm nó mở ra.
   */
  console.log('\n[3c] Cửa sổ xử lý nhanh');
  let soThe = 0;
  let lech = 0;
  let recThu = '';
  for (const mm of (tq.data.modules || [])) {
    for (const t of (mm.the || [])) {
      if (!t.khoa) continue;
      soThe++;
      const o = await json('/api/o?mod=' + mm.id + '&khoa=' + encodeURIComponent(t.khoa));
      if (o.code !== 200 || !Array.isArray(o.data.ds)) { lech++; continue; }
      if (t.dinhDang === 'so' && o.data.ds.length !== Number(t.so)) {
        lech++;
        console.log('     lệch: ' + mm.id + ' / ' + t.nhan + ' thẻ=' + t.so + ' ds=' + o.data.ds.length);
      }
      if (!recThu) {
        const co = (o.data.ds || []).find((x) => x.id);
        if (co) recThu = mm.id + '|' + co.id;
      }
    }
  }
  ok(soThe > 0, 'Có thẻ số mở được cửa sổ nhanh (' + soThe + ' thẻ)');
  ok(lech === 0, 'Số trên thẻ đúng bằng số dòng nhóm nó mở ra', lech + ' thẻ lệch');

  const oLa = await json('/api/o?mod=cong-viec&khoa=khong-co-nhom-nay');
  ok(oLa.code === 400, 'Xin nhóm không tồn tại thì trả 400, không trả rỗng âm thầm');
  const oBaseLa = await json('/api/o?mod=khong-co&khoa=mo');
  ok(oBaseLa.code === 404, 'Xin base không có trong panel trả 404');

  if (recThu) {
    const [mId, rId] = recThu.split('|');
    const mot = await json('/api/o?mod=' + mId + '&khoa=rec:' + rId);
    ok(mot.code === 200 && mot.data.ds.length === 1 && mot.data.ds[0].id === rId,
      'khoa=rec:<id> trả đúng một bản ghi đó');

    /* các đường ghi bị chặn — không chạm Base */
    const actLa = await json('/api/viec', { method: 'POST', body: { mod: mId, id: rId, act: 'xoa-sach' } });
    ok(actLa.code === 400, 'Hành động ngoài danh sách trắng bị chặn (400)');
    const idLa = await json('/api/viec', { method: 'POST', body: { mod: mId, id: '../../etc/passwd', act: 'bat-dau' } });
    ok(idLa.code === 400, 'Mã bản ghi sai định dạng bị chặn (400)');
    const modLa = await json('/api/viec', { method: 'POST', body: { mod: 'khong-co', id: rId, act: 'bat-dau' } });
    ok(modLa.code === 404, 'Ghi vào base không có trong panel trả 404');
    const recLa = await json('/api/viec', { method: 'POST', body: { mod: mId, id: 'recZZZZZZZZZZ', act: 'bat-dau' } });
    ok(recLa.code === 404 || recLa.code === 400, 'Bản ghi không tồn tại thì module trả lỗi, hub không tự bịa');
    ok(recLa.data && typeof recLa.data.error === 'string' && recLa.data.error.length < 260,
      'Lỗi trả về đã cắt ngắn, đủ hiện một dòng thông báo');
  } else boQua('Cửa sổ nhanh: bản ghi lẻ', 'không có nhóm nào có bản ghi');

  /* ---- 3d. xem như một nhân sự ----
   * Quản lý bật chế độ này để kiểm tra nhân sự thấy gì. Hai thứ phải đúng:
   * chỉ còn base người đó được xem, và mọi thao tác ghi bị chặn.
   */
  console.log('\n[3d] Xem như một nhân sự');
  const bat = await json('/api/xem-nhu', { method: 'POST', body: { id: 'ou_kiem_thu', ten: 'Người kiểm thử' } });
  ok(bat.code === 200, 'POST /api/xem-nhu bật được chế độ xem hộ', bat.raw.slice(0, 120));
  const ck = String((bat.headers && bat.headers['set-cookie']) || '');
  ok(/hub_nhu=/.test(ck) && /HttpOnly/i.test(ck), 'Cookie xem hộ có HttpOnly');
  const cookieNhu = (ck.match(/hub_nhu=[^;]+/) || [''])[0];

  const hubNhu = await json('/api/hub', { headers: { cookie: cookieNhu } });
  ok(hubNhu.code === 200 && hubNhu.data.xemNhu && hubNhu.data.xemNhu.ten === 'Người kiểm thử',
    '/api/hub báo đang xem hộ ai');
  ok(hubNhu.data.quanLy === false && hubNhu.data.quanLyThat === true,
    'Đang xem hộ thì mất vai quản lý nhưng vẫn thoát ra được');

  const ghiNhu = await json('/api/viec', {
    method: 'POST', headers: { cookie: cookieNhu },
    body: { mod: 'cong-viec', id: 'recZZZZZZZZZZ', act: 'bat-dau' },
  });
  ok(ghiNhu.code === 403 && /xem bằng mắt/i.test(ghiNhu.data.error || ''),
    'Đang xem hộ thì mọi thao tác ghi bị chặn (403)', ghiNhu.raw.slice(0, 120));

  const tat = await json('/api/xem-nhu', { method: 'DELETE' });
  ok(tat.code === 200, 'DELETE /api/xem-nhu thoát được chế độ xem hộ');

  const vt = await json('/api/quyen');
  ok(vt.code === 200 && Array.isArray(vt.data.viTri) && vt.data.viTri.length >= 5,
    'Có danh sách vị trí công việc kèm mẫu quyền (' + ((vt.data.viTri || []).length) + ')');
  ok((vt.data.viTri || []).every((x) => x.ten && Array.isArray(x.base)),
    'Vị trí nào cũng có tên và danh sách base');

  /* ---- 3e. nhân sự không quản được panel ----
   * Ẩn nút là chưa đủ: gõ tay API cũng phải bị chặn. Ở chế độ cli (máy cá nhân)
   * thì người ngồi trước máy chính là quản lý nên các phép thử này được bỏ qua.
   */
  console.log('\n[3e] Chốt quyền quản panel');
  if (hub.data.che_do !== 'api') {
    boQua('Chốt quyền quản panel', 'chế độ cli — máy cá nhân luôn là quản lý');
  } else {
    const idThu = (mods[0] || {}).id || 'cong-viec';
    const tat = await json('/api/modules/' + idThu + '/tat', { method: 'POST' });
    ok(tat.code === 403, 'Nhân sự không tắt được module (403)', tat.raw.slice(0, 100));
    const xoa = await json('/api/modules/' + idThu, { method: 'DELETE' });
    ok(xoa.code === 403, 'Nhân sự không xoá được base khỏi panel (403)');
    const them = await json('/api/modules', { method: 'POST', body: { ten: 'Thử', kieu: 'lark' } });
    ok(them.code === 403, 'Nhân sự không thêm được base (403)');
    const kt = await json('/api/kiem-tra');
    ok(kt.code === 403, 'Nhân sự không mở được Kiểm tra hệ thống (403)');
  }

  /* ---- 4. log của module ---- */
  console.log('\n[4] Log module');
  if (dangChay.length) {
    const r = await json('/api/modules/' + dangChay[0].id + '/log');
    ok(r.code === 200 && Array.isArray(r.data.logs), 'GET /api/modules/<id>/log trả mảng log');
  } else boQua('Log module', 'không có module nào đang chạy');
  const logLa = await json('/api/modules/khong-co/log');
  ok(logLa.code === 404, 'Log của module không tồn tại trả 404');

  /* ---- 5. không rò rỉ ---- */
  console.log('\n[5] An toàn cơ bản');
  const vuot = await goi('/../config.js');
  ok(vuot.code === 404 || !/module\.exports/.test(vuot.raw), 'Không đọc được file ngoài public/ qua đường dẫn ..');
  ok(!/appSecret|SESSION_SECRET|access_token/i.test(hub.raw), '/api/hub không trả bí mật nào');

  /* ---- 6. các lỗ đã vá ở chặng 1 ----
   * Mỗi phép thử dưới đây ứng với một lỗ thật đã tìm ra khi rà soát 28/08/2026.
   * Giữ chúng lại để lần sửa sau không vô tình mở lại.
   */
  console.log('\n[6] Chặng 1 — các lỗ đã vá');

  // BM-3: header bảo mật phải có trên MỌI phản hồi, kể cả trang tĩnh
  for (const [duong, ten] of [['/healthz', 'API'], ['/', 'trang']]) {
    const r = await goi(duong);
    const h = r.headers;
    ok(/frame-ancestors/.test(h['content-security-policy'] || ''),
      'Có frame-ancestors trên ' + ten + ' ' + duong, h['content-security-policy']);
    ok(h['x-content-type-options'] === 'nosniff', 'Có nosniff trên ' + ten + ' ' + duong);
    ok(h['referrer-policy'] === 'same-origin', 'Có Referrer-Policy trên ' + ten + ' ' + duong);
  }
  const cspM = (await goi('/m/' + ((mods.find((x) => x.kieu === 'local') || {}).id || 'cong-viec') + '/'))
    .headers['content-security-policy'] || '';
  ok(/frame-ancestors/.test(cspM), 'Header bảo mật phủ cả phần proxy vào app con', cspM);

  // BM-2: đường dẫn quay lại sau đăng nhập không được dẫn ra ngoài
  const authMod = require('../auth');
  const dd = authMod.duongDanNoiBo;
  ok(dd('/tong-quan') === '/tong-quan', 'Đường dẫn nội bộ được giữ nguyên');
  ok(dd('//trang-la.com') === '/', 'Chặn URL rút gọn giao thức //trang-la.com');
  ok(dd('/\\trang-la.com') === '/', 'Chặn /\\trang-la.com');
  ok(dd('https://trang-la.com') === '/', 'Chặn URL tuyệt đối');
  ok(dd('') === '/' && dd(null) === '/', 'Rỗng thì về trang chủ');

  // BM-4: cookie xem hộ kiểu cũ (chỉ base64, không ký) phải bị từ chối
  const giaNhu = Buffer.from(JSON.stringify({ id: 'ou_gia', ten: 'Người giả', email: 'gia@x.com' }))
    .toString('base64url');
  const gia = await json('/api/hub', { headers: { cookie: 'hub_nhu=' + giaNhu } });
  ok(gia.code === 200 && !gia.data.xemNhu,
    'Cookie xem hộ không ký bị bỏ qua', JSON.stringify(gia.data && gia.data.xemNhu));

  // BM-1: app con chỉ được nghe trên loopback, không phơi ra mạng LAN
  const os = require('os');
  const net = require('net');
  const ipNgoai = Object.values(os.networkInterfaces()).flat()
    .filter((x) => x && x.family === 'IPv4' && !x.internal).map((x) => x.address)[0];
  const congLocal = mods.filter((x) => x.kieu === 'local' && x.cong).map((x) => x.cong);
  if (!ipNgoai) boQua('App con không phơi ra mạng LAN', 'máy này không có IP mạng ngoài');
  else if (!congLocal.length) boQua('App con không phơi ra mạng LAN', 'không có module local');
  else {
    for (const cong of congLocal) {
      const moDuoc = await new Promise((res) => {
        const s = net.connect({ host: ipNgoai, port: cong, timeout: 2500 });
        const xong = (v) => { s.destroy(); res(v); };
        s.on('connect', () => xong(true));
        s.on('error', () => xong(false));
        s.on('timeout', () => xong(false));
      });
      ok(!moDuoc, 'Cổng ' + cong + ' không mở ra ' + ipNgoai +
        ' (app con tin header danh tính nên chỉ được nghe loopback)');
    }
  }

  // BM-5: /healthz công khai chỉ được trả đúng thứ Render cần
  if (hub.data.che_do === 'api') {
    ok(hz.data && !hz.data.commit && !hz.data.modules,
      '/healthz không lộ commit / danh sách base cho người chưa phải quản lý');
  } else boQua('/healthz không lộ thông tin nội bộ', 'chế độ cli — máy cá nhân luôn là quản lý');

  console.log('\n' + '-'.repeat(50));
  console.log('  ' + pass + ' pass · ' + fail + ' fail' + (bo ? ' · ' + bo + ' bỏ qua' : ''));
  console.log('-'.repeat(50) + '\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('\nLỗi khi chạy kiểm thử: ' + e.message);
  console.error('Hub có đang chạy ở ' + GOC + ' không? (node server.js)\n');
  process.exit(1);
});
