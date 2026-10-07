/**
 * Độ tin của số — app phải tự nói ra chỗ nào nó không đáng tin.
 *
 * Anh Hùng, 07/10/2026: "anh muốn biết tính chính xác của số liệu."
 *
 * Lần soát tay hôm ấy lòi ra chuyện tệ hơn là số sai: app đang NÓI MỘT ĐIỀU NÓ
 * KHÔNG BIẾT. Màn hình ghi "888 đơn: Không có lead Tourwell nào của khách này" —
 * nghe như một phát hiện về kinh doanh. Thật ra kho lead xuất từ Excel bị cắt ở
 * đúng 1.000 dòng, nên lead của 888 khách kia chưa bao giờ được nạp. Đo được:
 * chỉ 112/1.000 đơn có mã khách khớp một lead, tức trần ghi công là 11,2%.
 *
 * Người đọc không có cách nào biết điều đó, nên sẽ kết luận "quảng cáo không ra
 * đơn" — kết luận SAI rút ra từ một con số ĐÚNG. Đó là kiểu hỏng tệ nhất, vì
 * không có gì trông như đang hỏng cả.
 *
 * Luật của module: chỉ nói những gì ĐO ĐƯỢC. Không ước lượng, không chấm một
 * điểm tổng — "độ tin 72%" nghe gọn nhưng che mất đúng phần cần thấy.
 */
const dt = require('../sync/dotin');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};
const ten = (r) => r.diem.map((x) => x.ten);
const co = (r, s) => r.diem.some((x) => x.ten === s);
const lay = (r, s) => r.diem.find((x) => x.ten === s);

/* Kho đầy đủ, mọi thứ sạch — dùng làm nền để thấy rõ từng ca hỏng. */
const NGAY_NAY = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const khoSach = (n = 777) => ({
  luc: new Date().toISOString(),
  tuApi: true,
  lead: { rows: Array.from({ length: n }, (_, i) => ({ kh: 'KH' + i })) },
  don: { rows: Array.from({ length: n }, (_, i) => ({ kh: 'KH' + i, ma: 'RT' + i })) },
});
const confSach = {
  pancakePos: { enabled: true, shops: [{ shopId: '1', apiKey: 'a'.repeat(32) }] },
  tourwell: { enabled: true, host: 'https://x.tourwell.net', token: 'abc' },
};
const dataSach = {
  ads: [], daily: [
    { adId: 'a1', date: NGAY_NAY, spend: 1000, platform: 'Facebook' },
    { adId: 'a2', date: NGAY_NAY, spend: 2000, platform: 'TikTok' },
  ],
};

console.log('— mọi thứ sạch thì KHÔNG bịa ra lo lắng');
{
  const r = dt.danhGia({ kho: khoSach(), kq: null, data: dataSach, conf: confSach });
  t('không có điểm nào', r.diem.length === 0, JSON.stringify(ten(r)));
  t('trần ghi công 100%', r.tomTat.tranGhiCong === 100, String(r.tomTat.tranGhiCong));
}

console.log('— KHO BỊ CẮT: ca đã làm cả bảng số hiểu sai');
{
  /* 1.000 chằn chặn + nguồn Excel = bị cắt. Đây đúng là dữ liệu thật hôm ấy. */
  const kho = {
    luc: new Date().toISOString(), tuApi: false,
    lead: { rows: Array.from({ length: 1000 }, (_, i) => ({ kh: 'KH' + i })) },
    don: { rows: Array.from({ length: 1000 }, (_, i) => ({ kh: 'KH' + (i < 112 ? i : 9000 + i) })) },
  };
  const r = dt.danhGia({ kho, data: dataSach, conf: confSach });
  t('nhận ra kho bị cắt', co(r, 'Kho bị cắt ngang'));
  t('và xếp mức NẶNG', lay(r, 'Kho bị cắt ngang').nang === true);
  t('nói rõ đó là giới hạn xuất file, không phải số thật',
    /giới hạn xuất file/.test(lay(r, 'Kho bị cắt ngang').chu));
  /* Câu quan trọng nhất: giải thích vì sao "không có lead" là lời nói dối. */
  t('nói trước cái bẫy "không có lead"',
    /sẽ bị báo là "không có lead" dù lead có thật/.test(lay(r, 'Kho bị cắt ngang').chu));

  t('tính đúng trần ghi công', r.tomTat.tranGhiCong === 11.2, String(r.tomTat.tranGhiCong));
  t('nêu trần thành một mục riêng', co(r, 'Trần ghi công'));
  t('viết phần trăm theo lối Việt (dấu phẩy)',
    /11,2%/.test(lay(r, 'Trần ghi công').chu), lay(r, 'Trần ghi công').chu);
  t('KHÔNG viết 11.2% kiểu Anh', !/11\.2%/.test(lay(r, 'Trần ghi công').chu));
  t('nói rõ không phải ghép sai', /không phải ghép sai/.test(lay(r, 'Trần ghi công').chu));

  /* Kho từ API thì 1.000 dòng là số thật, không được kêu. */
  const api = dt.danhGia({ kho: { ...kho, tuApi: true }, data: dataSach, conf: confSach });
  t('kho từ API thì 1.000 dòng là bình thường', !co(api, 'Kho bị cắt ngang'));
  t('nhưng trần thấp vẫn phải nói', co(api, 'Trần ghi công'));
}

console.log('— ĐƯỜNG GHÉP ĐANG TẮT');
{
  const r = dt.danhGia({
    kho: khoSach(), data: dataSach,
    conf: { pancakePos: { enabled: true, shops: [{ shopId: '454586', apiKey: '' }] },
      tourwell: { enabled: false } },
  });
  t('nhận ra POS tắt', co(r, 'Đường POS đang tắt'));
  t('nêu đúng gian còn thiếu khoá', /454586/.test(lay(r, 'Đường POS đang tắt').chu));
  t('giải thích vì sao POS quan trọng',
    /khoá cứng/.test(lay(r, 'Đường POS đang tắt').chu));
  t('nhận ra chưa nối Tourwell', co(r, 'Chưa nối Tourwell API'));
  t('cả hai đều NẶNG',
    lay(r, 'Đường POS đang tắt').nang && lay(r, 'Chưa nối Tourwell API').nang);
  t('mỗi mục đều nói làm gì', r.diem.every((x) => x.lamGi && x.lamGi.length > 10));
}

console.log('— KÊNH CHI TIÊU ĐỨNG SỐ');
{
  const cu = (ngay) => ({ ads: [], daily: [
    { adId: 'a1', date: NGAY_NAY, spend: 1000, platform: 'Facebook' },
    { adId: 'a2', date: ngay, spend: 2000, platform: 'Google Ads' },
  ] });
  const truoc = (n) => new Date(Date.now() + 7 * 3600 * 1000 - n * 86400000).toISOString().slice(0, 10);

  const r = dt.danhGia({ kho: khoSach(), data: cu(truoc(14)), conf: confSach });
  const m = r.diem.find((x) => /Google Ads đứng số/.test(x.ten));
  t('nhận ra kênh đứng số', !!m, JSON.stringify(ten(r)));
  t('đếm đúng số ngày thiếu', /thiếu 14 ngày/.test(m.chu), m.chu);
  /* Điểm người đọc hay hiểu ngược: thiếu chi tiêu thì ROAS ĐẸP lên, không xấu đi. */
  t('nói rõ ROAS bị thổi, không phải tụt', /ĐẸP HƠN thực tế/.test(m.chu));

  /* Trễ 1–2 ngày là bình thường, nền tảng chốt số có độ trễ — đừng kêu. */
  const om = dt.danhGia({ kho: khoSach(), data: cu(truoc(2)), conf: confSach });
  t('trễ 2 ngày thì im', !om.diem.some((x) => /đứng số/.test(x.ten)), JSON.stringify(ten(om)));
}

console.log('— DÒNG CHI TIÊU BỊ GÕ HAI LẦN');
{
  const data = { ads: [], daily: [
    { adId: 'a1', date: NGAY_NAY, spend: 100000, platform: 'Facebook' },
    { adId: 'a1', date: NGAY_NAY, spend: 30000, platform: 'Facebook' },
    { adId: 'a2', date: NGAY_NAY, spend: 70000, platform: 'TikTok' },
  ] };
  const r = dt.danhGia({ kho: khoSach(), data, conf: confSach });
  const m = lay(r, 'Có dòng chi tiêu bị đếm hai lần');
  t('nhận ra dòng trùng', !!m);
  /* Giữ dòng LỚN NHẤT, phần thừa là 30.000 — không phải cộng cả hai. */
  t('tính đúng phần thừa', /30\.000đ/.test(m.chu), m.chu);
  t('xếp mức nhẹ, vì nó nhỏ và sửa được ngay', m.nang === false);
  t('nói rõ số từ API không gây ra chuyện này', /API không sinh dòng trùng/.test(m.chu));
}

console.log('— HỘI THOẠI KHÔNG CÓ SỐ ĐIỆN THOẠI');
{
  const ht = (rac, tong) => ({ hoiThoaiPhanLoai: Array.from({ length: tong },
    (_, i) => ({ nhom: i < rac ? 'rac' : 'tiem-nang' })) });
  const r = dt.danhGia({ kho: khoSach(), kq: ht(905, 941), data: dataSach, conf: confSach });
  const m = lay(r, 'Phần lớn hội thoại không để lại số điện thoại');
  t('nhận ra', !!m);
  t('nêu đúng tỉ lệ kiểu Việt', /96,2%/.test(m.chu), m.chu);
  /* Đây là giới hạn nền tảng, KHÔNG phải lỗi app — nói rõ để khỏi đi sửa nhầm. */
  t('nói rõ không phải lỗi app', /không phải lỗi app/.test(m.chu));
  t('và chỉ đường đi vòng', /POS/.test(m.lamGi));

  /* Dưới ngưỡng thì im, đừng kêu một chuyện bình thường. */
  const it = dt.danhGia({ kho: khoSach(), kq: ht(10, 100), data: dataSach, conf: confSach });
  t('10% thì không kêu', !co(it, 'Phần lớn hội thoại không để lại số điện thoại'));
}

console.log('— không có dữ liệu thì không vỡ, và không bịa');
{
  const r = dt.danhGia({});
  t('gọi rỗng vẫn chạy', Array.isArray(r.diem), JSON.stringify(r));
  t('không bịa trần ghi công', r.tomTat.tranGhiCong === null);
  t('không bịa điểm nào', r.diem.length === 0);
}

console.log('— app có gọi tới, và nói đúng giọng');
{
  const fs = require('fs');
  const path = require('path');
  const sv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  t('có cửa API', /'\/api\/roas\/do-tin'/.test(sv));
  t('màn hình có khối', /function doTinHtml/.test(app));
  t('khối nằm ngay dưới dải độ tươi',
    app.indexOf('${doTinHtml(RS.doTin)}') > app.indexOf('${doTuoiHtml(r)}'));
  t('nạp riêng, hỏng thì để trống chứ không nói "ổn"',
    /RS\.doTin = null;/.test(app));
  /* Mặc định gấp lại: mở sẵn mỗi lần vào trang thì thành tiếng ồn, mà tiếng ồn
   * thì người ta học cách bỏ qua — kể cả khi có chuyện thật. */
  t('mặc định gấp lại', /<details class="help"/.test(app));
  t('sạch thì nói sạch, không im lặng', /Không thấy chỗ nào đáng ngờ/.test(app));
  /* KHÔNG chấm một điểm tổng — xem ghi chú đầu file. */
  t('không có điểm tổng kiểu "độ tin 72%"', !/độ tin \$\{|diemTong/.test(app));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
