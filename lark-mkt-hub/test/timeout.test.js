/**
 * Kiểm mốc thời gian chờ mà hub cho từng loại đường dẫn.
 *
 * Vì sao có bộ này: anh Hùng bấm "Tính ROAS" và nhận
 *   "Không kết nối được module Quản lý quảng cáo (cổng 5176):
 *    Module không trả lời trong 30s"
 * Câu đó đọc như module đã chết. Thật ra module vẫn chạy bình thường — nó đang
 * đọc toàn bộ Base qua API Lark rồi kéo đơn POS của 2 gian và hội thoại của 2
 * page, và việc đó lâu hơn 30 giây. Hub cắt ngang rồi báo một câu sai bản chất.
 *
 * Ba mốc phải giữ đúng, mỗi mốc có lý do riêng:
 *   - tải tệp        300000  nhận tệp rồi đẩy tiếp lên Lark
 *   - luồng sự kiện        0  SSE cố ý mở vô hạn, cắt là hỏng chế độ Trực tiếp
 *   - việc lâu        goiLauMs  gọi nhiều API bên ngoài rồi mới trả lời được
 *   - còn lại      goiTimeoutMs
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

const src = fs.readFileSync(path.join(__dirname, '..', 'proxy.js'), 'utf8');
const cfg = require('../config');

/* Dựng lại biểu thức từ CHÍNH nhóm trong proxy.js, không chép lại một bản ở đây —
 * chép lại thì hai bên trôi xa nhau mà test vẫn xanh. */
const mNh = src.match(/const VIEC_LAU_NHOM = (\[[\s\S]*?\]);/);
t('proxy.js có khai VIEC_LAU_NHOM', !!mNh);
const VIEC_LAU_NHOM = mNh ? eval(mNh[1]) : [];          // eslint-disable-line no-eval
const dongRe = src.match(/const VIEC_LAU = .*/)[0].replace('const VIEC_LAU = ', '');
const VIEC_LAU = eval(dongRe);                          // eslint-disable-line no-eval
t('nới theo NHÓM, không liệt kê từng đường', src.includes('VIEC_LAU_NHOM.join'));

console.log('— những đường vốn dĩ lâu phải được nới giờ');
[
  ['/api/roas/tinh', 'tính ROAS: đọc cả Base + POS + hội thoại'],
  ['/api/pancake-pos/ghep', 'ghép đơn POS với chi tiêu'],
  ['/api/pancake/phu', 'đếm phủ 14 ngày'],
  ['/api/sync', 'đồng bộ chi tiêu mọi kênh'],
  ['/api/import-csv', 'nhập CSV rồi ghi hàng loạt'],
  /* Hai đường này viết SAU danh sách nên đã bị bỏ sót một lần: người dùng bấm
   * "Kiểm tra kết nối" và nhận đúng câu "module không trả lời trong 30s" mà bản
   * vá trước đó vừa đi sửa. */
  ['/api/tourwell/test', 'thử Tourwell: 3 endpoint, mỗi lượt giãn hơn 1 giây'],
  ['/api/roas/keo-api', 'kéo lead + đơn + khách từ Tourwell, hàng trăm lời gọi'],
  /* Ba đường này đã bị bỏ sót ba lần liên tiếp khi danh sách còn liệt kê từng
   * đường. Nay nới theo nhóm nên đường mới trong nhóm tự được, khỏi phải nhớ. */
  ['/api/roas/ghi-base', 'ghi doanh thu lên Base'],
  ['/api/roas/keo-api/trang-thai', 'hỏi tiến độ — nằm trong nhóm nên cũng được nới'],
  ['/api/pancake-pos/test', 'thử từng gian hàng POS'],
  ['/api/tourwell', 'lưu cấu hình — cùng nhóm, nới cũng không sao vì mốc là TRẦN'],
  /* Nhóm điều khiển quảng cáo. Chỗ này nguy hơn mọi đường trên: lệnh bật/tắt và
   * đổi ngân sách GHI ra nền tảng. Bị cắt ở 30 giây thì người dùng thấy "module
   * không trả lời" trong khi lệnh có thể ĐÃ GỬI — bấm lại lần nữa là tắt rồi bật,
   * hoặc đổi ngân sách hai lượt. */
  ['/api/dieu-khien/kha-nang', 'dò quyền ghi của cả ba nền tảng'],
  ['/api/dieu-khien/xem-truoc', 'đọc trạng thái + ngân sách thật, 2-3 lời gọi nối tiếp'],
  ['/api/dieu-khien/lam', 'ghi thật lên nền tảng rồi đọc lại để đối chiếu'],
  ['/api/dieu-khien/nhat-ky', 'cùng nhóm — mốc là TRẦN nên nới không sao'],
].forEach(([p, vi]) => t(`${p} — ${vi}`, VIEC_LAU.test(p)));

/* Điểm cốt lõi của cách làm mới: một đường CHƯA TỒN TẠI trong nhóm cũng phải khớp,
 * để lần sau thêm đường mới không phải sửa proxy.js nữa. */
t('đường tương lai trong nhóm roas tự được nới', VIEC_LAU.test('/api/roas/mot-duong-chua-co'));
t('đường tương lai trong nhóm pancake tự được nới', VIEC_LAU.test('/api/pancake/gi-do-moi'));
t('đường tương lai trong nhóm điều khiển tự được nới', VIEC_LAU.test('/api/dieu-khien/gi-do-moi'));

t('có tham số đuôi vẫn nhận', VIEC_LAU.test('/api/sync?days=14'));

console.log('— đường thường KHÔNG được nới, kẻo lỗi thật bị treo lâu mới lộ');
[
  '/api/connect',
  '/api/daily',
  '/api/entry',
  '/api/meta',
  '/api/campaigns',
  '/api/mapping',
  '/api/muc-tieu',
].forEach((p) => t(`${p} giữ mốc thường`, !VIEC_LAU.test(p), p));

/* Ba app đặt tên khác nhau cho cùng một việc là phục vụ tệp. Bản đầu chỉ nới cho
 * `upload` và `attachment`, nên riêng Tracking được 5 phút còn Lịch tác nghiệp và
 * Quỹ chi phí bị cắt ở 30 giây — anh Hùng bấm Tải và nhận một lần tải đứt giữa
 * chừng ("Site wasn't available", 12/09/2026). Rút biểu thức từ CHÍNH proxy.js,
 * không chép lại, kẻo hai bên trôi xa nhau mà test vẫn xanh. */
console.log('— mọi đường CHẠM VÀO TỆP đều được mốc dài, dù app đặt tên gì');
const mTep = src.match(/const mocCho = (\/[^\n]*?\/)\.test\(duongDan/);
t('proxy.js còn nhánh nhận diện đường tệp', !!mTep);
const TEP_RE = mTep ? eval(mTep[1]) : /$^/;             // eslint-disable-line no-eval
[
  ['/api/attachment?record=recX&token=T', 'Tracking · xem tệp'],
  ['/api/tasks/recX/upload?cot=ket-qua', 'Tracking · nộp tệp'],
  ['/api/items/recX/file/TOKEN', 'Lịch tác nghiệp · xem tệp'],
  ['/api/items/recX/attachment/files', 'Lịch tác nghiệp · nộp tệp'],
  ['/api/chi/recX/tep/TOKEN/tai', 'Quỹ chi phí · xem chứng từ'],
].forEach(([p, vi]) => t(`${p} — ${vi}`, TEP_RE.test(p), p));

[
  '/api/meta',
  '/api/items',
  '/api/tasks',
  '/api/cua-so',
].forEach((p) => t(`${p} KHÔNG phải đường tệp`, !TEP_RE.test(p), p));

console.log('— các mốc thời gian');
t('goiTimeoutMs là số dương', Number.isFinite(cfg.goiTimeoutMs) && cfg.goiTimeoutMs > 0,
  String(cfg.goiTimeoutMs));
t('goiLauMs là số dương', Number.isFinite(cfg.goiLauMs) && cfg.goiLauMs > 0,
  String(cfg.goiLauMs));
t('việc lâu phải được cho NHIỀU thời gian hơn việc thường',
  cfg.goiLauMs > cfg.goiTimeoutMs, `${cfg.goiLauMs} vs ${cfg.goiTimeoutMs}`);
t('nhưng không vô hạn — treo mãi thì người dùng không biết chuyện gì',
  cfg.goiLauMs <= 600000, String(cfg.goiLauMs));

console.log('— ba nhánh trong proxy.js còn nguyên');
t('tải tệp vẫn 5 phút', /upload\|attachment.*\n?.*300000/.test(src) || src.includes('300000'));
t('luồng su-kien vẫn không giới hạn', /su-kien\\b\/\.test\(duongDan \|\| ''\) \? 0/.test(src));
t('nhánh việc lâu dùng cfg.goiLauMs', src.includes('cfg.goiLauMs'));
t('mọi nhóm đều khớp được', VIEC_LAU_NHOM.every((x) => VIEC_LAU.test('/api/' + x + '/gi-do')));
t('nhánh còn lại vẫn dùng cfg.goiTimeoutMs', src.includes('cfg.goiTimeoutMs'));

console.log('\n— hạn chờ một base ở lượt đọc NGUỘI (trang Tổng quan)');
{
  /* Đo trên máy: lượt /api/tongquan ĐẦU TIÊN sau khi hub khởi động mất 11,6
   * giây, còn khi chín app con đã sẵn sàng thì đọc lại toàn bộ chỉ 2,1 giây.
   * Chênh gần mười giây là lúc app con còn đang nạp Base của nó — tongQuan()
   * dùng Promise.all nên app CHẬM NHẤT quyết định cả trang. Trên Render service
   * còn ngủ, nên lượt mở đầu nào cũng rơi vào cảnh đó.
   *
   * Chữa bằng hạn giờ cho riêng lượt đọc nguội: quá hạn thì base đó trả cờ
   * `dangNap`, trang hiện ngay 8/9 base có số, base còn lại giữ khung xương và
   * được xin lại sau 2,5 giây. Đo sau khi sửa: 11,6s xuống 5,0s; lúc đã sẵn
   * sàng vẫn 0,001s và không base nào chạm hạn. */
  const kpiSrc = fs.readFileSync(path.join(__dirname, '..', 'kpi.js'), 'utf8');
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  t('có hạn giờ khai trong config', typeof cfg.kpiHanMs === 'number' && cfg.kpiHanMs > 0,
    String(cfg.kpiHanMs));
  t('hạn đủ rộng để lượt đọc bình thường (2,1s) không chạm', cfg.kpiHanMs >= 4000,
    String(cfg.kpiHanMs));
  t('nhưng không vô hạn', cfg.kpiHanMs <= 20000, String(cfg.kpiHanMs));
  t('kpi.js có hàm hanGio', /function hanGio\(/.test(kpiSrc));
  t('lượt đọc nguội đi qua hanGio',
    /hanGio\(lamMoi\(mod, khoang, nguoi, kh\), cfg\.kpiHanMs\)/.test(kpiSrc));
  /* KHÔNG huỷ lượt đọc khi quá hạn: nó phải chạy tiếp và ghi vào đệm, nếu không
   * lượt xin lại cũng quá hạn và base đó không bao giờ có số. */
  t('quá hạn nhưng không huỷ lượt đọc đang bay', /p\.catch\(\(\) => \{\}\);/.test(kpiSrc));
  t('quá hạn trả cờ dangNap, không phải lỗi',
    /e\.quaGio\) return \{ ok: false, dangNap: true \}/.test(kpiSrc));
  /* Cờ này KHÔNG được rơi vào nhánh vẽ băng đỏ "Không đọc được chỉ số" kèm nút
   * Bật lại module — lúc đó base đang khoẻ, mời người ta bật lại là sai hẳn. */
  const iNap = appSrc.indexOf('r.dangNap');
  const iLoi = appSrc.indexOf('} else if (!r.ok) {');
  t('giao diện xét dangNap TRƯỚC nhánh lỗi', iNap > 0 && iLoi > 0 && iNap < iLoi);
  t('dangNap vẽ khung xương của chính base đó',
    /r\.dangNap\) \{[\s\S]{0,400}?KX\.theTheo\(hinhCu\.get\(m\.id\)\)/.test(appSrc));
  t('thấy dangNap thì xin lại sớm, không đợi hết nhịp 60 giây',
    /some\(\(m\) => m\.dangNap\)/.test(appSrc) && /napTongQuan\(\);[\s\S]{0,40}\}, 2500\)/.test(appSrc));
  /* Thẻ đang là khung xương thì chiều cao của nó KHÔNG được ghi vào trí nhớ —
   * ghi vào là tự dạy mình hình sai cho lần mở sau. */
  t('không ghi nhớ chiều cao của thẻ đang dở', /if \(h\.boQua\) return;/.test(appSrc));
  t('… mà vẫn push để chỉ số khớp với thẻ trên trang',
    /boQua: !!\(r && r\.dangNap\)/.test(appSrc));
}

console.log('\n— /healthz cho người CHƯA đăng nhập');
{
  /* Mọi đường của bản chạy thật đều 302 về đăng nhập Lark, kể cả tệp tĩnh, nên
   * không ai kiểm được "bản mới lên chưa" mà không mở trình duyệt và đăng nhập.
   * Anh Hùng chốt đưa số bản ra ngoài — nhưng CHỈ số bản. */
  const svSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  t('người chưa đăng nhập nhận được build',
    /!laQuanLy\(nguoiH\)\) return ok\(res, \{ ok: true, build: cfg\.build \}\)/.test(svSrc));
  /* Chế độ chạy và danh sách base nói ra phòng này có base nào, base nào đang
   * chết — giữ sau tường đăng nhập. */
  const i = svSrc.indexOf("if (p === '/healthz')");
  const than = svSrc.slice(i, i + 1800);
  const congKhai = than.slice(0, than.indexOf('return ok(res, {'));
  t('không lộ chế độ chạy cho người ngoài', !/che_do/.test(congKhai));
  t('không lộ danh sách base cho người ngoài', !/modules:/.test(congKhai));
  t('không lộ commit cho người ngoài', !/RENDER_GIT_COMMIT/.test(congKhai));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
