/**
 * Google từ chối thì app phải chỉ ĐÚNG chỗ sai.
 *
 * Anh Hùng, 07/10/2026: "Google bị vấn đề, anh thực hiện như cũ cũng đâu có làm
 * sao." Anh làm đúng các bước cũ. App mới là chỗ bảo sai.
 *
 * Google trả `invalid_client` — "The provided client secret is invalid". App in
 * lại câu đó rồi nói thêm: "Mã code chỉ dùng được một lần và hết hạn sau ~10
 * phút — bấm lấy link mới rồi làm lại." Câu khuyên ấy đúng cho MỘT lỗi khác.
 * Mã code không phải chỗ sai, nên làm theo bao nhiêu lần cũng không bao giờ
 * xong. Kênh Google Ads chết từ 23/09/2026, im 14 ngày.
 *
 * Chỗ sai thật: Client Secret lưu trong app không thuộc Client ID đang khai. Ô
 * đó ghi "đã lưu" nên trông như không phải đụng tới, và dòng gợi ý bảo "để
 * trống nếu không đổi" — nên anh để trống, đúng như app dặn.
 *
 * Lời khuyên sai tệ hơn không có lời khuyên: nó bắt người ta lặp lại một việc
 * không bao giờ xong, và làm họ tin chỗ hỏng nằm ở nơi khác.
 */
const fs = require('fs');
const path = require('path');
const gads = require('../sync/gads');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

const CID = '944289178542-tg3psdamorjucj89rumodj5beipv1187.apps.googleusercontent.com';

console.log('— secret không khớp: ca đã làm kênh chết 14 ngày');
{
  /* Nguyên văn Google trả về, đo thật 07/10/2026. */
  const s = gads.giaiThich(
    { error: 'invalid_client', error_description: 'The provided client secret is invalid.' },
    { clientId: CID, buoc: 'ma' });
  t('nhận ra là lỗi secret', /Client Secret/.test(s), s.slice(0, 60));
  t('nói thẳng lấy link mới KHÔNG cứu được', /không đổi gì/.test(s));
  t('chỉ đúng chỗ tạo secret mới', /ADD SECRET/.test(s));
  t('nhắc Google chỉ cho xem một lần', /chỉ cho xem một lần/.test(s));
  /* Quan trọng với anh: đổi secret không phải làm lại toàn bộ uỷ quyền. */
  t('trấn an refresh token vẫn còn', /KHÔNG làm mất refresh token/.test(s));
  /* Nêu Client ID để vào đúng client giữa nhiều client. ID là thông tin công
   * khai, đang hiện sẵn trên màn hình — không phải bí mật. */
  t('nêu client nào', /944289178542/.test(s));
  t('không in cả chuỗi client id dài', !s.includes(CID));

  /* ĐÚNG CÁI SAI CŨ: không được khuyên đi lấy link mới nữa. */
  t('KHÔNG còn khuyên lấy link mới rồi làm lại', !/bấm lấy link mới rồi làm lại/.test(s), s);
}

console.log('— các lỗi khác vẫn có lời khuyên riêng, không gộp một câu chung');
{
  const het = gads.giaiThich({ error: 'invalid_grant', error_description: 'Bad Request' }, { buoc: 'ma' });
  t('mã code hết hạn → bảo lấy link mới', /link MỚI|mỗi mã chỉ dùng được một lần/.test(het), het);
  const thu = gads.giaiThich({ error: 'invalid_grant' }, { buoc: 'lamMoi' });
  t('refresh token bị thu hồi → bảo cấp lại', /thu hồi/.test(thu), thu);
  t('hai ca invalid_grant khác nhau tuỳ bước', het !== thu);

  const rd = gads.giaiThich({ error: 'redirect_uri_mismatch' }, { clientId: CID });
  t('thiếu redirect URI → chỉ đúng chỗ khai', /127\.0\.0\.1:47123/.test(rd), rd);

  const sc = gads.giaiThich({ error: 'invalid_scope' }, {});
  t('thiếu quyền → nói bật API', /Google Ads API/.test(sc), sc);

  /* Không nhận ra thì trả rỗng, để nơi gọi dùng câu mặc định. Bịa ra một lời
   * khuyên cho lỗi lạ là lặp lại đúng sai lầm cũ. */
  t('lỗi lạ thì không bịa lời khuyên', gads.giaiThich({ error: 'abcxyz' }, {}) === '');
  t('không có gì cũng không vỡ', gads.giaiThich(null, {}) === '' && gads.giaiThich({}, {}) === '');
}

console.log('— Google nhận uỷ quyền nhưng không cấp refresh token');
{
  /* Ca này KHÔNG có `error` nào để dịch: HTTP 200, có access_token, thiếu mỗi
   * refresh_token. Xảy ra khi tài khoản đã đồng ý từ trước. */
  t('nhận ra', gads.thieuRefreshToken({ access_token: 'x' }) === true);
  t('không nhầm với lỗi thật', gads.thieuRefreshToken({ error: 'invalid_client' }) === false);
  t('không nhầm với lượt thành công',
    gads.thieuRefreshToken({ access_token: 'x', refresh_token: 'y' }) === false);
}

console.log('— cả hai đường gọi Google đều dùng chung lời giải thích');
{
  const g = fs.readFileSync(path.join(__dirname, '..', 'sync', 'gads.js'), 'utf8');
  const sv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  /* Đường 1: lượt đồng bộ hằng ngày đổi refresh token lấy access token. */
  t('accessToken dùng giaiThich', /buoc: 'lamMoi'/.test(g));
  /* Đường 2: nút "Đổi lấy token" trên giao diện — chỗ anh vừa bấm. */
  t('bước đổi mã code dùng giaiThich', /gads\.giaiThich\(d, nc\)/.test(sv));
  t('và xét cả ca thiếu refresh token', /gads\.thieuRefreshToken\(d\)/.test(sv));
  /* Câu khuyên sai cũ chỉ còn được dùng làm ĐƯỜNG LÙI khi không nhận ra lỗi. */
  const i = sv.indexOf('Mã code chỉ dùng được một lần');
  t('câu cũ chỉ còn là đường lùi', i > 0 && sv.lastIndexOf('gads.thieuRefreshToken(d)', i) > 0);
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
