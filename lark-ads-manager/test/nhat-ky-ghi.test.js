/**
 * Nhật ký các lệnh app ghi ra nền tảng.
 *
 * Vì sao đáng có test riêng: đây là bằng chứng duy nhất cho những lệnh tiêu tiền.
 * Ba hôm sau thấy một chiến dịch tắt mà không ai nhớ vì sao, câu hỏi đầu tiên là
 * "app tắt hay người tắt" — không có nhật ký thì không trả lời được.
 *
 * Ghi vào file TẠM, không phải file thật: bộ test mà ghi vào nhật ký thật thì nó
 * làm bẩn đúng thứ nó đang bảo vệ.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TAM = path.join(os.tmpdir(), `nhat-ky-test-${process.pid}.jsonl`);
/* Module tính đường dẫn từ biến môi trường lúc nạp, nên phải đặt TRƯỚC require.
 * Và đặt tên tương đối: module ghép với thư mục gốc của app. */
process.env.ADS_NHAT_KY_FILE = path.relative(path.join(__dirname, '..'), TAM).split(path.sep).join('/');
const nk = require('../sync/nhatkyghi');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};
const don = () => { try { fs.unlinkSync(nk.FILE); } catch (_) {} };

don();

console.log('— ghi và đọc lại');
{
  t('file chưa có thì đọc ra mảng rỗng, không nổ', Array.isArray(nk.doc()) && nk.doc().length === 0);

  nk.ghi({ ai: 'Lê Văn Hùng', nenTang: 'Facebook', viec: 'tat', adExtId: '888', ok: true });
  nk.ghi({ ai: 'Lê Văn Hùng', nenTang: 'Google Ads', viec: 'ngan-sach', cu: 500000, moi: 600000, ok: true });

  const r = nk.doc();
  t('đọc ra đủ hai dòng', r.length === 2, String(r.length));
  /* Mới nhất lên đầu: người tra nhật ký hầu như luôn muốn biết "vừa rồi ai làm gì". */
  t('dòng mới nhất lên đầu', r[0].viec === 'ngan-sach', r[0].viec);
  t('giữ đủ ai · nền tảng · việc', r[0].ai === 'Lê Văn Hùng' && r[0].nenTang === 'Google Ads');
  t('giữ cả số cũ và số mới', r[0].cu === 500000 && r[0].moi === 600000);
  t('tự đóng dấu thời điểm', /^\d{4}-\d{2}-\d{2}T/.test(r[0].luc), r[0].luc);
}

console.log('— ghi cả lệnh THẤT BẠI');
{
  /* Một lệnh bị nền tảng từ chối cũng là điều cần biết — nhất là khi bị từ chối
   * vì thiếu quyền, vì đó là việc phải đi làm chứ không phải lỗi ngẫu nhiên. */
  nk.ghi({ ai: 'ai đó', nenTang: 'TikTok', viec: 'bat', ok: false, loi: 'thiếu nhóm quyền' });
  const r = nk.doc();
  t('lệnh thất bại vẫn vào nhật ký', r[0].ok === false);
  t('và giữ lại câu lỗi', /thiếu nhóm quyền/.test(r[0].loi));
}

console.log('— một dòng hỏng không được làm mất cả nhật ký');
{
  /* JSONL: nếu một dòng bị cắt giữa (đĩa đầy, tiến trình chết) thì các dòng khác
   * vẫn phải đọc được. Đọc cả file bằng một JSON.parse thì mất sạch. */
  fs.appendFileSync(nk.FILE, '{"luc":"2026-09-10T00:00:00Z","viec":"bat"\n');
  nk.ghi({ ai: 'sau dòng hỏng', nenTang: 'Facebook', viec: 'tat', ok: true });
  const r = nk.doc();
  t('bỏ dòng hỏng, giữ các dòng lành', r.length === 4, String(r.length));
  t('dòng ghi sau dòng hỏng vẫn đọc được', r[0].ai === 'sau dòng hỏng', JSON.stringify(r[0]));
}

console.log('— không ghi được nhật ký thì KHÔNG làm hỏng lệnh chính');
{
  /* Lệnh đã gửi lên nền tảng rồi. Ném lỗi ở bước ghi nhật ký chỉ làm người dùng
   * tưởng lệnh chưa chạy — rồi bấm lại lần nữa, tức là tắt/bật hai lượt.
   *
   * Dựng hỏng THẬT: xoá file rồi tạo một THƯ MỤC trùng tên. appendFileSync vào
   * một thư mục thì hệ điều hành trả EISDIR — đúng loại lỗi cần nuốt. */
  don();
  fs.mkdirSync(nk.FILE, { recursive: true });
  let no = false; let ban = null;
  try { ban = nk.ghi({ ai: 'x', nenTang: 'Facebook', viec: 'bat' }); } catch (_) { no = true; }
  t('ghi nhật ký không ném lỗi ra ngoài dù đĩa hỏng', no === false);
  t('vẫn trả về bản ghi cho bên gọi dùng', !!(ban && ban.luc && ban.viec === 'bat'));
  t('và đọc lại thì ra rỗng chứ không nổ', Array.isArray(nk.doc()) && nk.doc().length === 0);
  fs.rmdirSync(nk.FILE);
}

console.log('— giới hạn số dòng đọc ra');
{
  don();
  for (let i = 0; i < 250; i += 1) nk.ghi({ ai: 'x', viec: 'bat', thu: i });
  t(`mặc định đọc tối đa ${nk.SO_DONG_DOC} dòng`, nk.doc().length === nk.SO_DONG_DOC,
    String(nk.doc().length));
  t('và là những dòng MỚI nhất', nk.doc()[0].thu === 249, String(nk.doc()[0].thu));
  t('xin ít hơn thì được ít hơn', nk.doc(5).length === 5);
}

don();

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
