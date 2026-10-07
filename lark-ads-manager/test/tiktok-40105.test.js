/**
 * `(40105) Access token is incorrect or has been revoked` — câu này nói thiếu,
 * và nói thiếu đúng chỗ khiến người ta chữa sai.
 *
 * Anh Hùng, 07/10/2026: "Anh có kết nối Access Token mới rồi đó, sao vẫn bị lỗi
 * thế này." Đo ra: token trên máy anh hỏi TỪNG tài khoản một thì cả năm đều trả
 * code 0 kèm tên — token hoàn toàn tốt.
 *
 * Phép kiểm hỏi CẢ NĂM trong một lời gọi, nên chỉ cần một tài khoản chưa được
 * uỷ quyền là TikTok từ chối cả lượt, và câu trả về nghe như token hỏng hẳn.
 * Hai chuyện khác nhau, cách chữa cũng khác hẳn:
 *   · token hỏng thật → phải lấy token mới
 *   · token còn tốt   → chỉ cần uỷ quyền thêm tài khoản đó, hoặc bỏ nó khỏi ô
 *
 * Đi lấy token mới trong khi token đang tốt là mất công, và còn làm người ta
 * tưởng app hỏng.
 */
const tt = require('../sync/tiktok');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

/* TikTok giả: tài khoản trong `duoc` thì trả code 0, còn lại 40105.
 * Tiêm qua deps — module bắt getJson ngay lúc nạp nên gán đè không ăn, và bộ
 * test thì không được phụ thuộc vào token thật còn sống hay không. */
const gia = (duoc) => async (url) => {
  const m = String(url).match(/advertiser_ids=([^&]+)/);
  const ds = m ? JSON.parse(decodeURIComponent(m[1])) : [];
  const ok = ds.filter((x) => duoc.includes(String(x)));
  if (!ok.length) return { code: 40105, message: 'Access token is incorrect or has been revoked' };
  return { code: 0, data: { list: ok.map((x) => ({ advertiser_id: x, name: 'TK ' + x })) } };
};

const LOI = { code: 40105, message: 'Access token is incorrect or has been revoked' };
const conf = { accessToken: 'xxxxxxxxxxxx' };

(async () => {
  console.log('— token TỐT, một tài khoản chưa được uỷ quyền');
  {
    const ra = await tt.giaiThich(conf, ['111', '222', '999'], LOI, { getJson: gia(['111', '222']) });
    t('giữ nguyên văn lỗi gốc', /\(40105\)/.test(ra), ra.slice(0, 60));
    t('nói rõ token vẫn dùng được', /token vẫn dùng được với 2\/3/.test(ra), ra);
    /* Quan trọng nhất: CHỈ ĐÍCH DANH tài khoản hỏng. */
    t('chỉ đích danh tài khoản hỏng', /Hỏng ở: 999/.test(ra), ra);
    t('nói thẳng token KHÔNG sai', /Token KHÔNG sai/.test(ra));
    t('và chỉ hai cách xử lý', /uỷ quyền/.test(ra) && /bỏ nó khỏi ô/.test(ra));
  }

  console.log('\n— token HỎNG hẳn');
  {
    const ra = await tt.giaiThich(conf, ['111', '222'], LOI, { getJson: gia([]) });
    t('nói không dùng được với tài khoản nào', /KHÔNG dùng được với tài khoản nào/.test(ra), ra);
    /* Ba khả năng thật, không chỉ "token sai": token thuộc App khác là ca đã gặp
     * hai lần trong cùng một ngày — Meta cũng y hệt. */
    t('nêu cả khả năng token thuộc App khác', /TikTok App khác/.test(ra));
    t('chỉ cách lấy token mới', /ket-noi\.js --tiktok/.test(ra));
    t('không nói nhầm là tài khoản chưa uỷ quyền', !/chưa được uỷ quyền/.test(ra));
  }

  console.log('\n— lỗi KHÁC thì giữ nguyên, đừng dò lẻ cho tốn');
  {
    let soLanGoi = 0;
    const dem = async (...a) => { soLanGoi += 1; return gia(['111'])(...a); };
    const ra = await tt.giaiThich(conf, ['111'], { code: 40002, message: 'field is required' }, { getJson: dem });
    t('giữ nguyên văn', ra === '(40002) field is required', ra);
    t('và không gọi thêm lần nào', soLanGoi === 0, String(soLanGoi));
  }

  console.log('\n— một tài khoản duy nhất và nó hỏng: vẫn phải nói đúng');
  {
    /* Đúng ca của bản trên server: ô chỉ khai một Advertiser ID. */
    const ra = await tt.giaiThich(conf, ['7307841310147510274'], LOI, { getJson: gia([]) });
    t('không nói "2/3" gì cả', !/\d+\/\d+ tài khoản/.test(ra), ra.slice(0, 90));
    t('nói thẳng là token không dùng được', /KHÔNG dùng được với tài khoản nào/.test(ra));
  }

  console.log('\n— phép kiểm chính có đi qua bộ dịch không');
  {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'sync', 'tiktok.js'), 'utf8');
    t('test() gọi giaiThich', /message: await giaiThich\(conf, advs, res\)/.test(src));
    t('chỉ dò lẻ với mã lỗi về quyền', /ma !== 40105 && ma !== 40100 && ma !== 40001/.test(src));
    t('cho tiêm getJson để kiểm được', /deps\.getJson \|\| getJson/.test(src));
    t('ghi lại con số đã đo', /CẢ NĂM đều|cả năm đều/i.test(src));
  }

  console.log(`\n${pass} pass · ${fail} fail`);
  process.exitCode = fail ? 1 : 0;
})();
