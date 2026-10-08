/**
 * Nối TAY hội thoại quảng cáo với lead Tourwell — đường duy nhất chạm được tới
 * 97% hội thoại TikTok không có số điện thoại.
 *
 * Anh Hùng, 28/09/2026: "Oke làm đi, xong thì đẩy lên, kiểm tra lỗi thật kỹ."
 *
 * Đây là tính năng GHI VÀO TOURWELL THẬT của công ty, nên bộ test này nặng về
 * chỗ NÓ PHẢI TỪ CHỐI hơn là chỗ nó làm được: một gợi ý sai ở đây dẫn người
 * dùng gán doanh thu cho nhầm quảng cáo, và cái sai đó được GHI LẠI nên sống
 * lâu hơn mọi con số trên màn hình.
 */
const nq = require('../sync/noiquangcao');
const roas = require('../sync/roas');
const tw = require('../sync/tourwellapi');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

const ht = (o) => ({ type: 'INBOX', sdt: [], coSdt: false, pageId: 'pg', khachId: 'kh', ...o });
const lead = (o) => ({ apiId: 1, ma: 'LU1', kh: 'KH-A', ngay: '2026-09-05', ghiChu: '', nguon: 'Tiktok', ...o });

console.log('— đọc lại mã đã ghi');
{
  t('đọc được QC= trong ghi chú', nq.docMaQC('abc\nQC=12345\nxyz') === '12345');
  t('ghi chú rỗng thì trả rỗng', nq.docMaQC('') === '' && nq.docMaQC(null) === '');
  t('không có QC= thì trả rỗng', nq.docMaQC('khách hẹn gọi lại chiều mai') === '');
  /* Ai đó sửa tay khoảng trắng vẫn phải đọc được — đòi đúng khối mốc thì một
   * lần sửa vô hại cũng làm mất quyết định đã ghi. */
  t('chịu được khoảng trắng lạ', nq.docMaQC('QC=  98765 ') === '98765', nq.docMaQC('QC=  98765 '));
  t('bắt được id chữ lẫn số', nq.docMaQC('QC=ttm_ab-12') === 'ttm_ab-12');
}

console.log('— thân ghi chú: máy đọc được, người đọc cũng hiểu');
{
  const than = nq.thanGhiChu({ adId: '111', tenQC: 'IS_Fomo', hoiThoaiId: 'h1',
    nenTang: 'TikTok', nguoiNoi: 'Lê Văn Hùng', luc: '2026-09-28T10:00:00.000Z' });
  t('có QC=', /QC=111/.test(than), than);
  t('có tên quảng cáo cho người đọc', /TEN=IS_Fomo/.test(than));
  t('ghi lại ai nối', /NGUOI=Lê Văn Hùng/.test(than));
  t('ghi lại lúc nào', /LUC=2026-09-28/.test(than));
  t('đọc ngược lại ra đúng mã', nq.docMaQC(than) === '111');

  /* Ghép vào ghi chú cũ phải GIỮ chữ cũ. Xoá ghi chú của sales là mất thông tin
   * không lấy lại được. */
  const cu = 'Khách hẹn gọi lại chiều mai, đang so giá với bên khác.';
  const moi = tw.ghepGhiChu(cu, than);
  t('giữ nguyên ghi chú cũ', moi.includes(cu), moi.slice(0, 80));
  t('và thêm được khối máy ghi', nq.docMaQC(moi) === '111');
  /* Ghi lần hai phải THAY khối cũ, không chồng hai khối. */
  const lan2 = tw.ghepGhiChu(moi, nq.thanGhiChu({ adId: '222', luc: 'x' }));
  t('ghi lần hai không chồng khối', (lan2.match(/QC=/g) || []).length === 1, lan2);
  t('vẫn giữ ghi chú của người', lan2.includes(cu));
}

console.log('— gợi ý: chỉ đưa ra cặp thật sự đáng ngờ');
{
  const kq = nq.goiY({
    hoiThoai: [ht({ id: 'h1', adIds: ['111'], ngay: '2026-09-05', tenKhachDs: ['Cô 2 Họ Đào'], soTinNhan: 12 })],
    leads: [lead({ khach: '(Quý khách) Cô 2 Họ Đào' })],
    don: [{ ma: 'RT1', kh: 'KH-A', ngay: '2026-09-07', tien: 6000000 }],
  });
  t('ra đúng một cặp', kq.capDoi.length === 1, JSON.stringify(kq.capDoi.length));
  const c = kq.capDoi[0];
  t('mang theo id lead để ghi', c.leadApiId === 1);
  t('mang theo mã quảng cáo', c.adId === '111');
  t('mang theo ghi chú cũ để không ghi đè', c.ghiChuCu === '');
  t('nói tiền lead đó đã ra', c.tien === 6000000, String(c.tien));
  t('lý do nói rõ vì sao ghép', /Tên khách trùng khớp/.test(c.lyDo), c.lyDo);
  t('kèm id hội thoại để bấm Xem chat', c.hoiThoaiId === 'h1' && c.pageId === 'pg');
}

console.log('— TỪ CHỐI: lead đã nối rồi thì không đụng tới');
{
  const kq = nq.goiY({
    hoiThoai: [ht({ id: 'h1', adIds: ['999'], ngay: '2026-09-05', tenKhachDs: ['Cô 2 Họ Đào'] })],
    leads: [lead({ khach: 'Cô 2 Họ Đào', ghiChu: 'QC=111' })],
  });
  t('không gợi ý lead đã có mã', kq.capDoi.length === 0, JSON.stringify(kq.capDoi));
  t('và đếm riêng ra', kq.boQua.daCoMaQC === 1);
}

console.log('— TỪ CHỐI: hội thoại dính hai quảng cáo');
{
  /* Nối vào chỉ là đẩy chỗ đoán xuống một tầng — và tầng dưới thì được GHI LẠI. */
  const kq = nq.goiY({
    hoiThoai: [ht({ id: 'h1', adIds: ['111', '222'], ngay: '2026-09-05', tenKhachDs: ['Cô 2 Họ Đào'] })],
    leads: [lead({ khach: 'Cô 2 Họ Đào' })],
  });
  t('không gợi ý', kq.capDoi.length === 0);
  t('và nói rõ vì sao bỏ', kq.boQua.nhieuQuangCao === 1);
}

console.log('— TỪ CHỐI: hai khách trùng tên');
{
  const kq = nq.goiY({
    hoiThoai: [ht({ id: 'h1', adIds: ['111'], ngay: '2026-09-05', tenKhachDs: ['Trần Văn Nam'] })],
    leads: [lead({ apiId: 1, kh: 'KH-A', khach: 'Trần Văn Nam' }),
      lead({ apiId: 2, ma: 'LU2', kh: 'KH-B', khach: 'Trần Văn Nam' })],
  });
  t('không chọn bừa một trong hai', kq.capDoi.length === 0, JSON.stringify(kq.capDoi));
}

console.log('— TỪ CHỐI: lead có TRƯỚC hội thoại (khách cũ quay lại)');
{
  /* Chạy thử trên dữ liệu thật 28/09/2026 mới lòi ra: trong 18 hội thoại tháng 8
   * khớp TÊN với một lead, 17 cái có lead sinh ra TRƯỚC hội thoại 38–62 ngày.
   * Khách mua từ tháng 6–7, nay bấm quảng cáo rồi nhắn lại. Gợi ý những cặp đó
   * là dẫn người dùng gán doanh thu cũ cho quảng cáo mới — rồi GHI LẠI cái sai. */
  const kq = nq.goiY({
    hoiThoai: [ht({ id: 'h1', adIds: ['111'], ngay: '2026-08-26', tenKhachDs: ['Cô 2 Họ Đào'] })],
    leads: [lead({ khach: 'Cô 2 Họ Đào', ngay: '2026-07-07' })],
  });
  t('không gợi ý ngược thời gian', kq.capDoi.length === 0, JSON.stringify(kq.capDoi));
  /* Và phải đếm vào ô RIÊNG. Gộp chung với "không tìm được lead" là màn hình nói
   * sai hẳn lý do — đúng chỗ giấu mất phát hiện quan trọng nhất của phép đo. */
  t('đếm riêng ô lệch ngày', kq.boQua.leadLechNgay === 1, JSON.stringify(kq.boQua));
  t('và KHÔNG đếm vào ô không tìm thấy lead', kq.boQua.khongThayLead === 0);
}

console.log('— TỪ CHỐI: lead quá xa hội thoại');
{
  const gan = nq.goiY({ cuaSo: 3,
    hoiThoai: [ht({ id: 'h1', adIds: ['111'], ngay: '2026-09-05', tenKhachDs: ['Cô 2 Họ Đào'] })],
    leads: [lead({ khach: 'Cô 2 Họ Đào', ngay: '2026-09-08' })] });
  t('trong cửa sổ thì nhận', gan.capDoi.length === 1);
  const xa = nq.goiY({ cuaSo: 3,
    hoiThoai: [ht({ id: 'h1', adIds: ['111'], ngay: '2026-09-05', tenKhachDs: ['Cô 2 Họ Đào'] })],
    leads: [lead({ khach: 'Cô 2 Họ Đào', ngay: '2026-09-20' })] });
  t('ngoài cửa sổ thì bỏ', xa.capDoi.length === 0);
}

console.log('— TỪ CHỐI: hội thoại đã có số điện thoại');
{
  /* Đường số điện thoại mạnh hơn và tự chạy — không lôi người vào làm tay việc
   * máy đã làm được. */
  const kq = nq.goiY({
    hoiThoai: [ht({ id: 'h1', adIds: ['111'], ngay: '2026-09-05', sdt: ['0900000001'], tenKhachDs: ['Cô 2 Họ Đào'] })],
    leads: [lead({ khach: 'Cô 2 Họ Đào' })],
  });
  t('để đường tự động lo', kq.capDoi.length === 0 && kq.boQua.coSoDienThoai === 1);
}

console.log('— MỘT lead chỉ nhận MỘT gợi ý');
{
  /* Bày ba lựa chọn cho một lead là bắt người dùng đoán hộ máy. Giữ cái gần
   * ngày nhất. */
  const kq = nq.goiY({
    hoiThoai: [
      ht({ id: 'h1', adIds: ['111'], ngay: '2026-09-02', tenKhachDs: ['Cô 2 Họ Đào'] }),
      ht({ id: 'h2', adIds: ['222'], ngay: '2026-09-05', tenKhachDs: ['Cô 2 Họ Đào'] }),
    ],
    leads: [lead({ khach: 'Cô 2 Họ Đào', ngay: '2026-09-05' })],
    cuaSo: 7,
  });
  t('chỉ một gợi ý cho lead đó', kq.capDoi.length === 1, JSON.stringify(kq.capDoi.map((x) => x.adId)));
  t('và giữ cái gần ngày nhất', kq.capDoi[0].adId === '222', kq.capDoi[0].adId);
}

console.log('— vòng khép kín: nối xong thì ROAS đọc được ngay');
{
  /* Đây là phép kiểm quan trọng nhất của cả tính năng: ghi vào Tourwell mà
   * phần tính ROAS không đọc lại được thì công nối là công cốc. */
  const than = nq.thanGhiChu({ adId: '111', luc: 'x' });
  const ghiChu = tw.ghepGhiChu('ghi chú cũ của sales', than);
  const kq = roas.tinh({
    data: { ads: [{ id: 'r1', extId: '111', name: 'QC A', platform: 'TikTok' }],
      daily: [{ adId: 'r1', date: '2026-09-10', spend: 2000000 }] },
    from: '2026-09-01', to: '2026-09-30', cuaSo: 60,
    hoiThoaiRows: [], posRows: [],
    leadRows: [{ id: 1, ma: 'LU1', kh: 'KH-A', ngay: '2026-09-05', ghiChu }],
    donRows: [{ ma: 'RT1', kh: 'KH-A', ngay: '2026-09-07', tien: 8000000, thu: 6000000 }],
  });
  t('ghi công được nhờ ghi chú', kq.tong.don === 1 && kq.tong.tien === 8000000, JSON.stringify(kq.tong));
  const row = (kq.rows || []).find((r) => r.duong === 'người nối') || {};
  t('và ghi rõ đi đường "người nối"', row.don === 1, JSON.stringify(kq.rows.map((r) => r.duong)));
  t('ROAS tính ra đúng', Math.round(kq.tong.roas * 100) === 400, String(kq.tong.roas));
}

console.log('— đường "người nối" mạnh hơn máy đoán, không cộng chồng');
{
  const than = nq.thanGhiChu({ adId: '111', luc: 'x' });
  const kq = roas.tinh({
    data: { ads: [
      { id: 'r1', extId: '111', name: 'QC A', platform: 'TikTok' },
      { id: 'r2', extId: '222', name: 'QC B', platform: 'TikTok' }],
      daily: [{ adId: 'r1', date: '2026-09-10', spend: 1000000 }] },
    from: '2026-09-01', to: '2026-09-30', cuaSo: 60,
    /* Máy sẽ đoán đơn này về quảng cáo 222 qua số điện thoại. Nhưng người đã
     * nối nó với 111 — quyết định của người phải thắng. */
    hoiThoaiRows: [{ type: 'INBOX', id: 'h1', adIds: ['222'], ngay: '2026-09-05',
      sdt: ['0900000001'], coSdt: true }],
    posRows: [],
    leadRows: [{ id: 1, ma: 'LU1', sdt: '0900000001', kh: 'KH-A', ngay: '2026-09-05', ghiChu: than }],
    donRows: [{ ma: 'RT1', kh: 'KH-A', ngay: '2026-09-07', tien: 8000000, thu: 6000000 }],
  });
  t('đơn chỉ được ghi công một lần', kq.tong.don === 1, JSON.stringify(kq.tong));
  t('tiền không nhân đôi', kq.tong.tien === 8000000, String(kq.tong.tien));
  const co = (kq.rows || []).filter((r) => r.don > 0);
  t('và thuộc về đường người nối', co.length === 1 && co[0].duong === 'người nối',
    JSON.stringify(co.map((r) => r.duong + ':' + r.adId)));
}

console.log('— giao diện và server: những chắn không được bỏ');
{
  const fs = require('fs');
  const path = require('path');
  const sv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

  const i = sv.indexOf("'/api/noi-qc/goi-y'");
  const j = sv.indexOf("'/api/noi-qc/ghi'");
  t('có đường dẫn gợi ý', i > 0);
  t('có đường dẫn ghi', j > 0);
  /* Hai đầu đều phải gác quyền: gợi ý mang tên khách thật, ghi thì đụng Tourwell. */
  t('gợi ý gác sau vai quản lý', /laQuanLy\(req\)/.test(sv.slice(i, i + 300)));
  t('ghi gác sau vai quản lý', /laQuanLy\(req\)/.test(sv.slice(j, j + 300)));
  const than = sv.slice(j, j + 4000);
  t('có chế độ xem trước', /body\.xemTruoc/.test(than));
  t('không ghi đè lead đã nối', /không ghi đè/.test(than));
  t('ghi nhật ký cả lệnh hỏng', /ok: false, loi: e\.message/.test(than));
  t('chặn lượt quá lớn', /tối đa 200 cặp/.test(than));
  t('báo Tourwell chưa bật thay vì ném lỗi khó hiểu', /Tourwell API chưa bật/.test(than));
  /* Nhưng chỉ chặn ở bước GHI: xem trước là đọc thuần, chặn nó là lấy mất đúng
   * cái màn hình dùng để kiểm trước khi quyết. */
  t('xem trước không đòi token Tourwell', /!body\.xemTruoc && \(!tw\.enabled/.test(than));

  t('giao diện hỏi lại trước khi ghi', /Tourwell thật/.test(app));
  t('gọi xem trước trước khi gọi ghi', app.indexOf('xemTruoc: true') > 0);
  t('nhắc số chỉ đổi sau lượt kéo sau', /lượt kéo Tourwell kế tiếp/.test(sv));
  /* Kho nhập từ Excel không có apiId — bấm ghi sẽ hỏng hết. Phải chặn từ giao diện.
   * Câu chữ đổi sau khi sửa lỗi "0 cặp thì màn hình im"; phép kiểm đầy đủ nằm ở
   * ba dòng coApiId phía dưới. */
  t('chặn khi lead chưa có id API', /chưa có id API/.test(app));
  /* Màn hình phải nói đúng lý do bỏ qua, vì đây là ô đông nhất trên dữ liệu thật. */
  t('giải thích ô khách cũ quay lại', /khách cũ quay lại, không phải quảng cáo này sinh ra/.test(app));

  /* Lỗi bắt được lúc chạy thử: kho lead cũ không có id API thì không nối được gì,
   * mà bản đầu chỉ cảnh báo ở nhánh CÓ cặp — đúng lúc hỏng nhất thì màn hình im,
   * và người đọc nhìn mấy con số "bỏ qua" rồi đi sai hướng. */
  t('server trả về số lead có id API', /coApiId: leads\.filter/.test(sv));
  t('giao diện chặn ngay khi kho không có id API', /!d\.coApiId/.test(app));
  t('và nói rõ phải kéo lại từ Tourwell', /Kho lead đang có chưa kèm id API/.test(app));
  /* Chặn phải đứng TRƯỚC nhánh "không tìm thấy cặp nào", nếu không nó không bao
   * giờ chạy tới — đúng loại lỗi thứ tự điều kiện. */
  t('chặn đứng trước nhánh 0 cặp',
    app.indexOf('!d.coApiId') > 0 && app.indexOf('!d.coApiId') < app.indexOf('Không tìm thấy cặp nào'));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
