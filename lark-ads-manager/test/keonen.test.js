/**
 * Test bộ chạy nền cho lượt kéo Tourwell.
 *
 * Vì sao cần: lượt kéo 60 ngày mất vài phút. Tôi đã hai lần đi sai hướng —
 * lần đầu nới hạn chờ của hub lên 4 phút, lần sau đi sửa danh sách việc-lâu vì
 * câu thông báo nói dối là "30s". Việc dài vài phút thì không được là một lời gọi
 * HTTP đơn, bất kể nới bao nhiêu: giữ kết nối treo thì người dùng nhìn màn hình
 * trắng, và bấm lại là chạy hai lượt song song — chính thứ đã gây 429.
 */
const keo = require('../sync/keonen');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};
const nghi = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('— chưa đặt việc nào');
  keo.xoa();
  let s = keo.trangThai();
  t('báo là chưa có việc', s.dangChay === false && s.coViec === false, JSON.stringify(s));

  console.log('— đặt việc thì TRẢ LỜI NGAY, không chờ việc xong');
  let daChay = false;
  const cham = async (conf, from, to, ghi) => {
    ghi('đang làm');
    await nghi(400);
    daChay = true;
    return { lead: { dong: 7 }, don: { dong: 3, tongTien: 5000000 }, coSdt: false };
  };
  const truoc = Date.now();
  const r = keo.dat({ conf: {}, from: '2026-07-03', to: '2026-09-01', chay: cham });
  const mat = Date.now() - truoc;
  t('trả về trong vòng vài chục mili-giây', mat < 100, mat + 'ms');
  t('việc CHƯA xong lúc trả về', daChay === false);
  t('báo đang chạy', r.dangChay === true, JSON.stringify(r));
  t('không phải "đã có lượt khác"', r.daChay === false);
  t('giữ khoảng ngày', Array.isArray(r.khoang) && r.khoang[0] === '2026-07-03');
  t('có dòng log đầu tiên', (r.log || []).length >= 1, JSON.stringify(r.log));

  console.log('— bấm thêm thì nhận lại lượt ĐANG chạy, không sinh lượt thứ hai');
  const r2 = keo.dat({ conf: {}, from: 'x', to: 'y', chay: () => { throw new Error('không được gọi'); } });
  t('báo đã có lượt đang chạy', r2.daChay === true, JSON.stringify(r2));
  t('vẫn là khoảng ngày của lượt đầu', r2.khoang[0] === '2026-07-03', JSON.stringify(r2.khoang));

  console.log('— hỏi tiến độ trong lúc chạy');
  /* Phải chờ một nhịp: dat() cố ý KHÔNG gọi chay() ngay trong thân hàm mà đẩy qua
   * microtask, để lỗi ném đồng bộ cũng bị bắt vào viec.loi thay vì nổ ra chỗ gọi.
   * Nên dòng log đầu của việc chỉ có sau một nhịp. Bản đầu của bài kiểm này hỏi
   * ngay lập tức rồi báo FAIL — lỗi ở bài kiểm, không ở code. */
  await nghi(20);
  s = keo.trangThai();
  t('vẫn đang chạy', s.dangChay === true);
  t('có đếm giây', typeof s.giay === 'number' && s.giay >= 0, String(s.giay));
  t('log nhận được từ việc đang chạy', s.log.some((x) => x.includes('đang làm')), JSON.stringify(s.log));
  t('chưa có kết quả', s.kq === null);

  console.log('— xong việc');
  await nghi(600);
  s = keo.trangThai();
  t('hết chạy', s.dangChay === false, JSON.stringify(s));
  t('có mốc kết thúc', !!s.xong);
  t('trả kết quả của việc', s.kq && s.kq.lead.dong === 7, JSON.stringify(s.kq));
  t('không có lỗi', s.loi === null);
  t('có dòng "xong"', s.log.includes('xong'), JSON.stringify(s.log));

  console.log('— việc lỗi: phải bắt lại, KHÔNG được thành unhandled rejection');
  keo.xoa();
  keo.dat({ conf: {}, from: 'a', to: 'b', chay: async () => { throw new Error('Tourwell chặn'); } });
  await nghi(120);
  s = keo.trangThai();
  t('hết chạy', s.dangChay === false);
  t('giữ nguyên câu lỗi', s.loi === 'Tourwell chặn', String(s.loi));
  t('không có kết quả', s.kq === null);
  t('lỗi cũng vào log', s.log.some((x) => x.includes('Tourwell chặn')));

  console.log('— lỗi rồi thì đặt lại được ngay, không bị kẹt');
  const r3 = keo.dat({ conf: {}, from: 'c', to: 'd', chay: async () => ({ lead: { dong: 1 } }) });
  t('đặt được lượt mới', r3.daChay === false && r3.dangChay === true, JSON.stringify(r3));
  await nghi(80);

  console.log('— xoá: chỉ được xoá khi KHÔNG có việc đang chạy');
  keo.xoa();
  keo.dat({ conf: {}, from: 'e', to: 'f', chay: async () => { await nghi(300); return {}; } });
  t('đang chạy thì không cho xoá', keo.xoa() === false);
  await nghi(400);
  t('xong rồi thì xoá được', keo.xoa() === true);
  t('xoá xong thì về trạng thái trắng', keo.trangThai().coViec === false);

  console.log('— trạng thái KHÔNG được kèm dòng thô');
  keo.xoa();
  keo.dat({ conf: {}, from: 'g', to: 'h',
    chay: async () => ({ lead: { dong: 2, rows: [{ id: 1 }, { id: 2 }] } }) });
  await nghi(120);
  /* Kho thật có hàng nghìn dòng; lọt vào phản hồi tiến độ là mỗi 3 giây tải về
   * vài MB — trên Render đó là tiền băng thông thật. */
  const chuoi = JSON.stringify(keo.trangThai());
  t('kết quả trả về nhưng người gọi phải tự lo phần thô',
    chuoi.length < 4000, chuoi.length + ' ký tự');

  console.log(`\n${pass} pass · ${fail} fail`);
  process.exitCode = fail ? 1 : 0;
})();
