'use strict';
/**
 * ============================================================================
 * Máy chủ — quyền, hình dạng câu trả lời, và mấy cái bẫy đã từng sập
 * ============================================================================
 * Không cần mạng, không chạm Base: chỉ gọi những đường trả lời được ngay, và
 * gọi thẳng các hàm thuần. Base có hỏng thì bộ này vẫn phải chạy được, vì nó
 * đang gác chuyện quyền — thứ mà "hôm nay Base lỗi nên bỏ qua" là cách tốt nhất
 * để một lỗ hổng đi thẳng lên bản chạy thật.
 *
 * Chạy: node test/server.test.js
 */
const http = require('http');
const path = require('path');
const fs = require('fs');

const S = require('../server');
const cfg = require('../config');
const K = require('../ky');

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

const CONG = 5199;   // cổng riêng cho test, không đụng bản đang chạy

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
  'x-hub-user-id': 'ou_nhan_su_gia',
  'x-hub-user-name': encodeURIComponent('Nhân sự thử'),
  'x-hub-user-email': encodeURIComponent('nhansu@rootytrip.com'),
};
const QUAN_LY = Object.assign({}, NHAN_SU, { 'x-hub-user-manager': '1' });

(async () => {
  await new Promise((r) => S.server.listen(CONG, '127.0.0.1', r));

  group('Danh tính — hub quyết, app con không tự quyết lại');
  {
    const a = await goi('/api/meta', { headers: NHAN_SU });
    ok('nhận đúng người từ header hub', a.d.toi.id === 'ou_nhan_su_gia');
    ok('giải mã được tên có dấu', a.d.toi.ten === 'Nhân sự thử',
      'đang ra: ' + a.d.toi.ten);
    ok('nhận cả email', a.d.toi.email === 'nhansu@rootytrip.com',
      'email là khoá người ổn định duy nhất giữa các app Lark — thiếu nó thì ' +
      'mở bản trên Render ra là thấy mình thành người lạ');
    ok('không có header quản lý thì KHÔNG phải quản lý', a.d.toi.quanLy === false,
      'mặc định phải là mức chặt nhất');

    const b = await goi('/api/meta', { headers: QUAN_LY });
    ok('có header quản lý thì là quản lý', b.d.toi.quanLy === true);

    /* Header tự bịa "x-hub-user-manager" chỉ đi được từ hub sang app con qua
     * mạng nội bộ 127.0.0.1. Nếu app này lộ ra ngoài thì bất kỳ ai cũng tự
     * phong quản lý — nên server chỉ nghe loopback, và bài kiểm dưới gác đúng
     * chuyện đó. */
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    ok('máy chủ mặc định chỉ nghe 127.0.0.1',
      /BIND = process\.env\.BIND \|\| '127\.0\.0\.1'/.test(src),
      'mở ra 0.0.0.0 thì header quản lý thành thứ ai cũng tự gắn được');
  }

  group('Quyền — nhân sự không được với sang người khác');
  {
    const r = await goi('/api/theo-doi', { headers: NHAN_SU });
    ok('nhân sự gọi bảng theo dõi -> 403', r.ma === 403, 'đang ra: ' + r.ma);
    ok('403 kèm mã máy đọc được', r.d && r.d.code === 'CHI_QUAN_LY');

    /* nguoiXem là cái chốt: `?nguoi=` là thứ ai cũng sửa được trong thanh địa
     * chỉ, nên nhân sự truyền vào phải bị bỏ qua, không phải bị báo lỗi — báo
     * lỗi thì lộ ra rằng có tham số đó. */
    const q = (s) => new URL('http://x/?' + s).searchParams;
    const ns = { id: 'ou_toi', ten: 'Tôi', email: 't@x.vn', quanLy: false };
    const ql = { id: 'ou_sep', ten: 'Sếp', email: 's@x.vn', quanLy: true };
    ok('nhân sự truyền ?nguoi= vẫn chỉ là chính mình',
      S.nguoiXem(ns, q('nguoi=ou_nguoi_khac')).id === 'ou_toi',
      'đây là đường rò dữ liệu người khác, và nó im lặng tuyệt đối');
    ok('quản lý thì xem được người khác',
      S.nguoiXem(ql, q('nguoi=ou_nguoi_khac')).id === 'ou_nguoi_khac');
    ok('không truyền gì thì là chính mình', S.nguoiXem(ql, q('')).id === 'ou_sep');
    ok('truyền email thì nhận ra là email',
      S.nguoiXem(ql, q('nguoi=ai@do.vn')).email === 'ai@do.vn');
  }

  group('/api/meta — đủ thứ giao diện cần để dựng màn');
  {
    const d = (await goi('/api/meta', { headers: NHAN_SU })).d;
    ok('có ba loại kỳ', d.ky && d.ky.ngay && d.ky.tuan && d.ky.thang);
    ok('có hạn nộp của cả ba', d.han && d.han.ngay && d.han.tuan && d.han.thang);
    ok('ca cả ngày là 480', (d.ca.find((c) => c.ma === 'ngay') || {}).phut === 480);
    ok('ca nửa ngày là 240', (d.ca.find((c) => c.ma === 'nua') || {}).phut === 240);
    ok('nhóm việc lấy từ config, không bịa trong giao diện',
      JSON.stringify(d.nhomViec) === JSON.stringify(cfg.chon.nhomViec));

    /* Hạn tháng phải nằm SAU khi tháng đóng. Sai chiều này thì cả phòng bị chấm
     * trễ oan mỗi tháng một lần. */
    ok('hạn tháng nằm sau ngày cuối tháng', d.han.thang > d.ky.thang.den);
    /* Quy định của phòng: kỳ tuần đo Thứ 7 → Thứ 6, còn BÁO CÁO làm ngày Thứ 7.
     * Nên hạn nằm sau khi kỳ đóng đúng một ngày, y như tháng. */
    ok('hạn tuần nằm SAU khi kỳ tuần đóng', d.han.tuan > d.ky.tuan.den,
      'để hạn đúng vào Thứ 6 là đòi báo cáo tuần khi ngày cuối tuần chưa hết');
    ok('hạn tuần đúng một ngày sau kỳ', d.han.tuan === K.cuoiNgay(d.ky.tuan.den + 1));
  }

  group('vePhieu — dịch bản ghi Base sang thứ giao diện hiểu');
  {
    const homQua = K.dauNgay(Date.now() - K.NGAY);
    const tho = {
      id: 'rec1', ma: 'ngay-x', loaiKy: 'Ngày',
      tuNgay: homQua, denNgay: homQua + K.NGAY - 1,
      nguoi: 'ou_a', email: 'a@x.vn', tenNguoi: 'A',
      ca: 'Cả ngày', dinhMuc: 480, tongPhut: 240, phanTram: 50,
      trangThai: 'Đã nộp', nopLuc: homQua + 17 * K.GIO, hanNop: homQua + K.NGAY - 1,
    };
    const p = S.vePhieu(tho);
    ok('nhận ra là phiếu ngày', p.loaiKy === 'ngay');
    ok('nhãn có tên thứ', /^Thứ |^Chủ nhật/.test(p.nhan), 'đang ra: ' + p.nhan);
    ok('đổi phút sang giờ cho người đọc', p.tongGio === '4 giờ', 'đang ra: ' + p.tongGio);
    ok('nộp 17:00 trong ngày là đúng hạn', p.trangThaiHan === 'dung-han');
    ok('câu trạng thái đọc được', p.veHan === 'Đúng hạn');

    /* Nộp sau nửa đêm = trễ. Đây là mốc mà cách cắt ngày theo giờ UTC sẽ chấm
     * sai, vì 00:30 giờ VN vẫn là 17:30 hôm trước theo UTC. */
    const tre = S.vePhieu(Object.assign({}, tho, { nopLuc: homQua + K.NGAY + 30 * K.PHUT }));
    ok('nộp 00:30 hôm sau là trễ', tre.trangThaiHan === 'tre', 'đang ra: ' + tre.trangThaiHan);
    ok('nói rõ trễ bao lâu', /^trễ /.test(tre.veHan), 'đang ra: ' + tre.veHan);

    const nhap = S.vePhieu(Object.assign({}, tho, { trangThai: 'Nháp' }));
    ok('nháp thì chưa tính là đã nộp', nhap.daNop === false);
    ok('nháp quá hạn thì là "thiếu", không phải "trễ"', nhap.trangThaiHan === 'thieu',
      'trễ là đã nộp muộn; thiếu là chưa nộp gì cả — hai chuyện khác nhau');

    ok('không có phiếu thì trả null, không nổ', S.vePhieu(null) === null);
  }

  group('Ô checkbox — chuỗi "false" là TRUTHY, và nó vừa cắn một lần');
{
  const kho = require('../kho');
  /* Không có nhánh riêng thì ô checkbox đi qua asText() và thành chuỗi
   * "true"/"false". Chuỗi "false" là truthy, nên MỌI phiếu đều đếm là đã tick —
   * phiếu trễ 18 giờ nhảy sang cột "nộp bù". Đúng cái bẫy đã ghi trong test
   * xem-tai của hub, và nó tái diễn ở app này. */
  ok('chuỗi "false" đọc ra false', kho.asTick('false') === false,
    'đây là cả lý do hàm này tồn tại');
  ok('chuỗi "true" đọc ra true', kho.asTick('true') === true);
  ok('boolean thật thì giữ nguyên', kho.asTick(true) === true && kho.asTick(false) === false);
  ok('số 1/0 cũng hiểu', kho.asTick(1) === true && kho.asTick(0) === false);
  ok('rỗng là false', kho.asTick(null) === false && kho.asTick('') === false &&
    kho.asTick(undefined) === false);

  const F = cfg.fields.phieu.nopBu;
  ok('cột Nộp bù khai kiểu checkbox để đi qua đường đó', F.type === 'checkbox');
}

group('Giữ lần nộp ĐẦU TIÊN — sửa phiếu không được biến thành trễ');
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'kho.js'), 'utf8');
  /* Bản trước ghi `[F.phieu.nopLuc.id]: luc` mỗi lần bấm Nộp, nên người nộp
   * đúng hạn hôm qua mà hôm nay mở ra sửa một chữ lập tức bị chấm "trễ 18 giờ"
   * — hỏng đúng cái bảng kỷ luật mà nó sinh ra để phục vụ. */
  ok('có hàm gom các ô kỷ luật nộp', /function oKyLuat\(/.test(src));
  ok('Nộp lúc lấy từ phiếu CŨ nếu đã có',
    /const nopDau = \(cu && cu\.nopLuc\) \|\| luc;/.test(src),
    'ghi đè bằng giờ hiện tại là biến người sửa chính tả thành người nộp trễ');
  ok('chấm hạn theo lần nộp đầu, không theo lần sửa',
    /K\.chamHan\(k, nopDau\)/.test(src));
  ok('lần sửa ghi vào ô RIÊNG', /suaLuc\.id\]: luc/.test(src));
  ok('không còn chỗ nào ghi nopLuc bằng giờ hiện tại',
    !/nopLuc\.id\]: luc\b/.test(src),
    'còn một chỗ là còn nguyên lỗi cũ');
}

group('Lỗi của Lark phải nói được người dùng làm gì tiếp');
{
  /* Anh Hùng nộp báo cáo trên Render và nhận đúng dòng này:
   *     "Base không nhận: Lark API 91403: you don't have permission"
   * Đúng, nhưng vô dụng — không biết AI thiếu quyền gì, càng không biết nhờ ai.
   * Base do một người tạo, còn bản trên Render ghi bằng danh nghĩa APP Lark, mà
   * app đó chưa được mời vào Base. */
  const q = S.dichLoiBase(new Error("Lark API 91403: you don't have permission"));
  ok('không ném mã số vào mặt người dùng', !/91403/.test(q), 'đang ra: ' + q);
  ok('nói rõ ai thiếu quyền', /App Lark chưa được cấp quyền/.test(q));
  ok('chỉ đúng chỗ bấm để sửa', /Chia sẻ/.test(q) && /thêm ứng dụng/.test(q));
  ok('trấn an là chưa mất bài đang gõ', /vẫn còn trên màn hình/.test(q),
    'gõ mười phút rồi thấy lỗi đỏ thì câu đầu tiên người ta cần nghe là "chưa mất"');
  ok('kèm mã máy đọc được',
    S.maLoiBase(new Error('Lark API 91403: ...')) === 'THIEU_QUYEN_BASE');

  const b = S.dichLoiBase(new Error('1254291 ghi đồng thời'));
  ok('lỗi bận thì bảo thử lại', /thử lại/.test(b) && !/quyền/.test(b));

  const t = S.dichLoiBase(new Error('dial tcp: i/o timeout'));
  ok('lỗi mạng thì nói là lỗi mạng', /Không nối được tới Lark/.test(t));

  const la = S.dichLoiBase(new Error('chuyện gì đó rất lạ'));
  ok('lỗi chưa biết thì giữ nguyên văn, không nuốt mất',
    la.includes('chuyện gì đó rất lạ'),
    'nuốt lỗi lạ là lần sau không ai lần ra được nguyên nhân');
}

group('Ô kiểu URL — gỡ lớp Markdown ngay lúc đọc');
{
  const kho = require('../kho');
  /* Base trả ô URL về dạng `[địa chỉ](địa chỉ)`. Đổ thẳng chuỗi đó vào ô nhập
   * rồi lưu lần nữa thì nó tự bọc thêm một lớp — mỗi lần mở ra sửa lại dài gấp
   * đôi, và sau vài lần thì link không bấm được nữa. */
  ok('gỡ được liên kết Markdown trùng địa chỉ',
    kho.asLink('[https://a.vn/x](https://a.vn/x)') === 'https://a.vn/x');
  ok('gỡ được cả khi phần chữ khác địa chỉ',
    kho.asLink('[Xem tại đây](https://c.vn/z)') === 'https://c.vn/z');
  ok('địa chỉ trần thì giữ nguyên', kho.asLink('https://b.vn/y') === 'https://b.vn/y');
  ok('rỗng vẫn là rỗng, không nổ', kho.asLink('') === '' && kho.asLink(null) === '');
  ok('chuỗi có ngoặc nhưng không phải link thì để yên',
    kho.asLink('ghi chú [quan trọng] gì đó') === 'ghi chú [quan trọng] gì đó');

  const F = cfg.fields.phieu.linkVideo;
  ok('cột Link video khai kiểu url để đi qua đường gỡ đó', F.type === 'url',
    'khai là text thì doiRa() không gỡ, và lớp Markdown chui thẳng vào ô nhập');
}

group('Tệp tĩnh — cùng bài học vừa vá ở hub');
  {
    const t = await goi('/');
    ok('trang chủ trả về được', t.ma === 200);
    ok('trang chủ KHÔNG nằm trong cache', /no-store/.test(t.headers['cache-control'] || ''),
      'index.html giữ số bản của mọi file khác; nó cũ thì cả cơ chế ?v= vô nghĩa');
    ok('BUILD đã được thay bằng số bản thật', !/v=BUILD/.test(t.raw),
      'còn chữ BUILD thì trình duyệt xin đúng một địa chỉ bất biến');

    const js = await goi('/app.js?v=' + S.VER);
    ok('file có số bản thì cho cache lâu',
      /max-age=31536000/.test(js.headers['cache-control'] || ''));
    const tran = await goi('/app.js');
    ok('file xin trần thì không cache', /no-store/.test(tran.headers['cache-control'] || ''));

    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    const ref = [...html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css)[^"]*)"/g)].map((m) => m[1]);
    ok('có bắt được file tĩnh để soi', ref.length >= 2);
    ok('mọi .js/.css đều kèm ?v=BUILD', ref.every((r) => /[?&]v=BUILD\b/.test(r)),
      'khai trần: ' + ref.filter((r) => !/[?&]v=BUILD\b/.test(r)).join(', '));

    const x = await goi('/../config.js');
    ok('không ra ngoài được thư mục public', x.ma === 404, 'đang ra: ' + x.ma);
  }

  group('Đường lạ và thân hỏng');
  {
    const a = await goi('/api/khong-co-dau', { headers: NHAN_SU });
    ok('đường lạ trả 404 kèm câu tiếng Việt', a.ma === 404 && /Không có đường/.test(a.d.error));

    /* Người gọi không có cả id lẫn email thì không được ghi: phiếu phải đứng
     * tên ai đó, chứ không phải "khuyết". */
    const b = await goi('/api/phieu', {
      method: 'POST', headers: { 'x-hub-user-id': '' }, body: { loaiKy: 'ngay' },
    });
    ok('không rõ người thì không cho nộp', b.ma === 401 || b.ma === 404,
      'đang ra: ' + b.ma + ' ' + JSON.stringify(b.d));
  }

  await new Promise((r) => S.server.close(r));

  console.log('\n' + '─'.repeat(56));
  console.log('  ' + pass + ' pass · ' + fail + ' fail');
  if (fail) { console.log('\n  Không đạt:'); fails.forEach((f) => console.log('   - ' + f)); }
  console.log('─'.repeat(56) + '\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('NỔ: ' + e.stack); process.exit(1); });
