'use strict';
/**
 * ============================================================================
 * Máy chủ — quyền ghi, danh sách trắng, hình dạng câu trả lời, tệp tĩnh
 * ============================================================================
 * Không chạm Base: thay lớp `kho`/`lark` bằng dữ liệu giả trước khi nạp
 * server.js. Base có hỏng thì bộ này vẫn phải chạy, vì nó đang gác chuyện
 * QUYỀN — "hôm nay Base lỗi nên bỏ qua" là cách tốt nhất để một lỗ hổng đi
 * thẳng lên bản chạy thật.
 *
 * Chạy: node test/api.test.js
 */
const http = require('http');
const Module = require('module');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else {
    fail++; fails.push(ten + (vi ? ' — ' + vi : ''));
    console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + vi : ''));
  }
};
const group = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');

const CONG = 5198;   // cổng riêng cho test, không đụng bản đang chạy

/* ---------------- dữ liệu giả ---------------- */

const NGAY = 86400000;
const nay = Date.now();

const SP = [
  {
    id: 'rec1', ma: 'G4', ten: 'Tour cano 3 đảo', nhom: 'Tour ghép hằng ngày',
    uuTien: '🟢 Chạy hằng ngày', trangThai: 'Đang kinh doanh',
    giaNL: 800000, giaTE: 400000, tinhTrang: '✅ Còn hiệu lực', conLai: null,
    thieu: '', tepKhach: [], traiNghiem: [], gia: [], chinhSach: [], media: [],
  },
  {
    id: 'rec2', ma: 'TG01', ten: 'Trọn gói 3N2Đ', nhom: 'Tour trọn gói',
    uuTien: '🔵 Duy trì', trangThai: 'Đang kinh doanh',
    giaNL: null, giaTE: null, tinhTrang: '⚠️ Sắp hết hạn', conLai: 8,
    hieuLucDen: nay + 8 * NGAY, thieu: 'USP', tepKhach: [], traiNghiem: [], gia: [],
    chinhSach: [{ id: 'cs1', ten: 'Voucher ẩm thực', den: nay + 8 * NGAY }], media: [],
  },
  {
    id: 'rec4', ma: 'TG09', ten: 'Tour mới chưa mở bán', nhom: 'Tour trọn gói',
    uuTien: '', trangThai: '🆕 Sắp ra mắt',
    giaNL: null, giaTE: null, tinhTrang: '—', conLai: null,
    thieu: '', tepKhach: [], traiNghiem: [], gia: [], chinhSach: [], media: [],
  },
  {
    id: 'rec3', ma: 'CT7', ten: 'NLĐ CT7', nhom: 'Tour trọn gói',
    uuTien: '', trangThai: 'Rất ít bán',
    giaNL: null, giaTE: null, tinhTrang: '❌ Đã hết hạn', conLai: 0,
    thieu: 'USP · Lịch trình', tepKhach: [], traiNghiem: [], gia: [], chinhSach: [], media: [],
  },
];

let ghiCuoi = null;
let ghiNhieu = null;
const khoGia = {
  tatCa: async () => ({ ds: SP, mediaChung: [{ id: 'm1', ten: 'Bảng giá đối tác', spIds: [] }], luc: nay }),
  xoaDem: () => {},
  sapHetHan: (ds) => ds.filter((p) => /hết hạn/i.test(p.tinhTrang)),
  canBoSung: (ds) => ds.filter((p) => p.thieu),
  uuDaiSapHet: () => [{ id: 'cs1', ten: 'Voucher ẩm thực', den: nay + 8 * NGAY, sanPham: ['TG01'] }],
};
const larkGia = {
  whoami: async () => ({ id: 'ou_test', name: 'Người thử' }),
  updateRecord: async (id, fields, tableId) => { ghiCuoi = { id, fields, tableId }; return {}; },
  updateMany: async (map, tableId) => { ghiNhieu = { map, tableId }; return {}; },
};

/* Chặn require: server.js phải nhận bản giả, không được chạm Base thật. */
const thatSu = Module.prototype.require;
Module.prototype.require = function (ten) {
  if (ten === './kho') return khoGia;
  if (ten === './lark' || ten === './larkapi') return larkGia;
  return thatSu.apply(this, arguments);
};
const S = require('../server');
const cfg = require('../config');
Module.prototype.require = thatSu;

/* ---------------- gọi HTTP ---------------- */

function goi(duong, opts = {}) {
  return new Promise((res, rej) => {
    const than = opts.body ? Buffer.from(JSON.stringify(opts.body), 'utf8') : null;
    const r = http.request({
      host: '127.0.0.1', port: CONG, path: duong, method: opts.method || 'GET',
      headers: Object.assign({}, opts.headers,
        than ? { 'content-type': 'application/json', 'content-length': than.length } : {}),
    }, (rs) => {
      let s = '';
      rs.setEncoding('utf8');
      rs.on('data', (c) => { s += c; });
      rs.on('end', () => {
        let d = null;
        try { d = s ? JSON.parse(s) : null; } catch (_) { d = s; }
        res({ ma: rs.statusCode, headers: rs.headers, d, raw: s });
      });
    });
    r.on('error', rej);
    if (than) r.write(than);
    r.end();
  });
}

const NHAN_SU = {
  'x-hub-user-id': 'ou_nhan_su',
  'x-hub-user-name': encodeURIComponent('Nhân sự thử'),
  'x-hub-user-email': encodeURIComponent('nhansu@rootytrip.com'),
};
const QUAN_LY = Object.assign({}, NHAN_SU, { 'x-hub-user-manager': '1' });
/* Request từ hub mà HỤT danh tính: vẫn là "đến từ hub", vẫn phải bị coi là
 * người lạ — không được rơi xuống nhánh chạy-một-mình rồi tự cấp quyền quản lý. */
const HUB_HUT = { 'x-hub-user-id': '' };

const sua = (id, truong, giaTri, headers) =>
  goi('/api/san-pham/' + id, { method: 'POST', headers, body: { truong, giaTri } });

(async () => {
  await new Promise((r) => S.server.listen(CONG, '127.0.0.1', r));

  /* ---------------------------------------------------------------- */
  group('Danh tính: hub quyết, app con không tự quyết lại');
  {
    const a = await goi('/api/khoi-tao', { headers: NHAN_SU });
    ok('nhân sự qua hub KHÔNG phải quản lý', a.d.me.quanLy === false, JSON.stringify(a.d.me));
    /* Giao diện hỏi server "cột nào sửa được" thay vì tự giữ một danh sách
     * riêng — hai danh sách lệch nhau thì nút hiện ra mà bấm vào báo 400. */
    ok('khởi tạo trả danh sách cột sửa được cho giao diện',
      !!(a.d.suaDuoc && a.d.suaDuoc.uuTien && !a.d.suaDuoc.usp));
    ok('trạng thái "Sắp ra mắt" có trong lựa chọn',
      (a.d.chon.trangThai || []).some((x) => /Sắp ra mắt/.test(x)),
      JSON.stringify(a.d.chon.trangThai));

    const b = await goi('/api/khoi-tao', { headers: QUAN_LY });
    ok('hub nói là quản lý thì là quản lý', b.d.me.quanLy === true);

    const c = await goi('/api/khoi-tao', { headers: HUB_HUT });
    ok('request từ hub mà hụt danh tính vẫn KHÔNG được là quản lý',
      c.d.me.quanLy === false, JSON.stringify(c.d.me));
  }

  /* ---------------------------------------------------------------- */
  group('Sửa thông tin — nhân sự bị chặn, quản lý được');
  {
    ghiCuoi = null;
    const a = await sua('rec1', 'uuTien', '🔥 Ưu tiên đẩy', NHAN_SU);
    ok('nhân sự bị chặn 403', a.ma === 403, String(a.ma));
    ok('và KHÔNG có gì được ghi xuống Base', ghiCuoi === null);

    const b = await sua('rec1', 'uuTien', '🔥 Ưu tiên đẩy', QUAN_LY);
    ok('quản lý đổi được', b.ma === 200 && b.d.ok === true, JSON.stringify(b.d));
    ok('ghi bằng FIELD ID, không bằng tên cột',
      ghiCuoi && Object.keys(ghiCuoi.fields)[0] === cfg.f.sp.uuTien,
      JSON.stringify(ghiCuoi && ghiCuoi.fields));
    ok('ghi đúng bảng Sản phẩm', ghiCuoi && ghiCuoi.tableId === cfg.spTableId);
  }

  /* ---------------------------------------------------------------- */
  group('Danh sách trắng: cột nào sửa được, giá trị nào hợp lệ');
  {
    /* Select của Base TỰ ĐẺ lựa chọn mới khi ghi giá trị lạ — gõ nhầm một lần
     * là cột ưu tiên có thêm một mức rác vĩnh viễn, và bộ lọc lệch từ đó. */
    ghiCuoi = null;
    const a = await sua('rec1', 'uuTien', 'Đẩy mạnh', QUAN_LY);
    ok('mức lạ bị từ chối 400', a.ma === 400, String(a.ma));
    ok('và không ghi gì xuống Base', ghiCuoi === null);

    /* Nội dung dài cố ý KHÔNG sửa được từ app — sửa trên Lark Base, chỗ Kinh
     * doanh và Marketing cùng nhìn. */
    ghiCuoi = null;
    const b = await sua('rec1', 'usp', 'xxx', QUAN_LY);
    ok('cột ngoài danh sách trắng bị từ chối', b.ma === 400, String(b.ma));
    ok('lời từ chối chỉ chỗ sửa thay thế', /Lark Base/.test((b.d || {}).error || ''),
      JSON.stringify(b.d));
    ok('và không ghi gì xuống Base', ghiCuoi === null);

    const c = await sua('rec1', 'giaNL', -5, QUAN_LY);
    ok('giá âm bị từ chối', c.ma === 400, String(c.ma));

    const d = await sua('rec1', 'hieuLucDen', '30/09/2026', QUAN_LY);
    ok('ngày sai dạng bị từ chối', d.ma === 400, String(d.ma));

    ghiCuoi = null;
    const e = await sua('rec1', 'hieuLucDen', '2026-09-30', QUAN_LY);
    ok('ngày đúng dạng thì ghi, kèm giờ 00:00:00',
      e.ma === 200 && ghiCuoi.fields[cfg.f.sp.hieuLucDen] === '2026-09-30 00:00:00',
      JSON.stringify(ghiCuoi && ghiCuoi.fields));

    /* Ô trống phải ghi null: Base hiểu chuỗi rỗng ở cột số/ngày là một giá trị,
     * không phải "xoá". */
    ghiCuoi = null;
    const f = await sua('rec1', 'uuTien', '', QUAN_LY);
    ok('bỏ trống select được', f.ma === 200, String(f.ma));
    ok('bỏ trống select ghi null', ghiCuoi.fields[cfg.f.sp.uuTien] === null);

    ghiCuoi = null;
    await sua('rec1', 'giaNL', '', QUAN_LY);
    ok('bỏ trống số ghi null', ghiCuoi.fields[cfg.f.sp.giaNL] === null);

    ghiCuoi = null;
    await sua('rec1', 'hieuLucDen', '', QUAN_LY);
    ok('bỏ trống ngày ghi null', ghiCuoi.fields[cfg.f.sp.hieuLucDen] === null);

    /* Trạng thái thêm ngày 22/09/2026 — phải nằm trong danh sách trắng, không
     * thì chính tầng đầu của Bảng đẩy lại không đặt được. */
    ghiCuoi = null;
    const g = await sua('rec1', 'trangThai', '🆕 Sắp ra mắt', QUAN_LY);
    ok('đặt được trạng thái Sắp ra mắt',
      g.ma === 200 && ghiCuoi.fields[cfg.f.sp.trangThai] === '🆕 Sắp ra mắt',
      JSON.stringify(ghiCuoi && ghiCuoi.fields));
  }

  /* ---------------------------------------------------------------- */
  group('Sửa hàng loạt');
  {
    const hl = (ids, truong, giaTri, headers) =>
      goi('/api/san-pham/hang-loat', { method: 'POST', headers, body: { ids, truong, giaTri } });

    ghiNhieu = null;
    const a = await hl(['rec1'], 'uuTien', '🔵 Duy trì', NHAN_SU);
    ok('nhân sự bị chặn 403', a.ma === 403, String(a.ma));
    ok('và không ghi gì', ghiNhieu === null);

    const b = await hl([], 'uuTien', '🔵 Duy trì', QUAN_LY);
    ok('không chọn dòng nào thì báo 400', b.ma === 400, String(b.ma));

    ghiNhieu = null;
    const c = await hl(['rec1', 'rec2', 'khong-phai-id'], 'uuTien', '🔵 Duy trì', QUAN_LY);
    ok('quản lý đặt được cho cả nhóm', c.ma === 200 && c.d.so === 2, JSON.stringify(c.d));
    ok('id rác bị loại, không lọt xuống Base',
      ghiNhieu && Object.keys(ghiNhieu.map).join() === 'rec1,rec2',
      JSON.stringify(ghiNhieu && Object.keys(ghiNhieu.map)));
    ok('hàng loạt cũng ghi bằng field ID',
      ghiNhieu && ghiNhieu.map.rec1[cfg.f.sp.uuTien] === '🔵 Duy trì');

    ghiNhieu = null;
    const d = await hl(['rec1'], 'uuTien', 'Đẩy mạnh', QUAN_LY);
    ok('hàng loạt cũng kiểm giá trị', d.ma === 400, String(d.ma));
    ok('và không ghi gì', ghiNhieu === null);
  }

  /* ---------------------------------------------------------------- */
  group('Tổng quan: đúng khuôn trang Tổng quan chung của hub');
  {
    const r = await goi('/api/tong-quan', { headers: QUAN_LY });
    const t = r.d;
    const tim = (n) => t.the.find((x) => x.nhan === n);
    ok('có mảng the', Array.isArray(t.the) && t.the.length >= 4);
    ok('thẻ đầu là thẻ chính', t.the[0].chinh === true);
    ok('đếm đúng số đang kinh doanh', t.the[0].so === 2, String(t.the[0].so));
    ok('có thẻ Sắp ra mắt và đếm đúng', tim('Sắp ra mắt').so === 1, String(tim('Sắp ra mắt').so));
    ok('đếm đúng sắp/đã hết hạn', tim('Sắp / đã hết hạn').so === 2);
    ok('đếm đúng hồ sơ còn thiếu', tim('Hồ sơ còn thiếu').so === 2);
    ok('thẻ có số > 0 được đánh mức cảnh báo', tim('Sắp / đã hết hạn').muc === 'gap');
    ok('thẻ không có gì để lo thì mức ok', tim('Ưu tiên đẩy').so === 0);

    ok('có canXuLy và canXuLyTong', Array.isArray(t.canXuLy) && typeof t.canXuLyTong === 'number');
    /* Dòng "đã hết hạn" phải đứng TRƯỚC dòng "còn 8 ngày" — nếu không thì danh
     * sách cảnh báo mất nghĩa. */
    const iHet = t.canXuLy.findIndex((v) => /CT7/.test(v.tieuDe) && v.muc === 'gap');
    const iSap = t.canXuLy.findIndex((v) => /TG01/.test(v.tieuDe) && v.muc === 'vua');
    ok('đã hết hạn xếp trước sắp hết hạn', iHet >= 0 && iSap >= 0 && iHet < iSap,
      'iHet=' + iHet + ' iSap=' + iSap);
    ok('mọi dòng canXuLy đều có tieuDe',
      t.canXuLy.every((v) => v.tieuDe && v.tieuDe.length));
    /* Base này không có trục thời gian; phải NÓI RA thay vì im lặng để người
     * xem tưởng con số đã được lọc theo khoảng của trang Tổng quan. */
    ok('nói rõ là không lọc theo thời gian', /không lọc theo thời gian/.test(t.khoang));
  }

  /* ---------------------------------------------------------------- */
  group('Danh sách sản phẩm');
  {
    const r = await goi('/api/san-pham', { headers: NHAN_SU });
    ok('trả đủ sản phẩm', r.d.ds.length === 4, String(r.d.ds.length));
    /* Anh Hùng bỏ tab Tài liệu chung để nhường chỗ cho khu Quản lý — đừng gửi
     * lên một mảng không ai vẽ. Link vẫn nằm trong bảng Kho media trên Base. */
    ok('KHÔNG gửi kèm tài liệu dùng chung nữa', r.d.mediaChung === undefined);
    ok('kèm tóm tắt để vẽ dải thẻ', !!(r.d.tomTat && r.d.tomTat.the));
  }

  /* ---------------------------------------------------------------- */
  group('Ngày hiển thị theo giờ VN, không theo giờ máy chủ');
  {
    /* Render chạy UTC. 30/09/2026 00:00 (+07) = 29/09 17:00 UTC — đọc bằng giờ
     * máy là ra 29/09, tức mọi hạn bị lùi một ngày. */
    const t = Date.parse('2026-09-30T00:00:00+07:00');
    ok('30/09 vẫn là 30/09 dù máy chạy UTC', S.veNgay(t) === '30/09/2026', S.veNgay(t));
    ok('rỗng -> chuỗi rỗng', S.veNgay(0) === '');
  }

  /* ---------------------------------------------------------------- */
  group('Tệp tĩnh');
  {
    const r = await goi('/');
    ok('trang chủ trả về HTML', r.ma === 200 && /<title>Thông tin sản phẩm/.test(r.raw));
    ok('BUILD đã được thay bằng số bản', !/v=BUILD/.test(r.raw));
    ok('trang chủ KHÔNG được cache', /no-store/.test(r.headers['cache-control'] || ''));
    const c = await goi('/styles.css?v=' + S.VER);
    ok('css có số bản thì cache dài', /max-age=31536000/.test(c.headers['cache-control'] || ''));
    const x = await goi('/../config.js');
    ok('không leo ra ngoài thư mục public được', x.ma === 404, String(x.ma));
    const y = await goi('/api/khong-co');
    ok('đường API lạ trả 404 kèm lời giải thích', y.ma === 404 && /Không có đường/.test(y.d.error));
  }

  S.server.close();
  console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
  if (fail) { console.log(fails.map((f) => ' - ' + f).join('\n')); process.exit(1); }
})();
