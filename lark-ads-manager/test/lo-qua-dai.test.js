/**
 * Lô ghi quá dài cho dòng lệnh Windows.
 *
 * BẮT ĐƯỢC 07/10/2026 khi ghi 1.000 lead Tourwell lên bảng mới:
 *
 *     Lead → Base: tạo 1000, sửa 0 dòng
 *     LOI: spawn ENAMETOOLONG
 *
 * Ở chế độ cli, cả một lô đi vào MỘT tham số `--json` của dòng lệnh. Windows
 * giới hạn cả dòng lệnh ở 32.767 ký tự. Lô 200 lead (tên khách tiếng Việt dài,
 * ghi chú dài) ra khoảng 60.000 ký tự — vỡ ngay lô đầu.
 *
 * Chia theo SỐ DÒNG không cứu được: một dòng có thể dài gấp mười dòng khác.
 * Phải đo bằng chính thứ bị giới hạn, là độ dài chuỗi JSON.
 *
 * Lỗi này không chỉ thuộc bảng lead — bảng "Báo cáo Sales" có ô Ghi chú tới 900
 * ký tự, nên 200 dòng ở đó cũng vượt ngưỡng. Chỉ là chưa ai ghi đủ 200 dòng dài
 * cùng lúc. Sửa ở lark.js nên cả hai bảng cùng được.
 */
const lark = require('../lark');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

console.log('— chia lô theo độ dài, không chỉ theo số dòng');
{
  t('có ngưỡng và chừa chỗ cho phần đầu lệnh',
    lark.NGUONG_JSON > 0 && lark.NGUONG_JSON < 32767, String(lark.NGUONG_JSON));

  /* 200 dòng ngắn thì vẫn đi một lô — đừng chia vụn vô cớ, mỗi lô là một lượt
   * gọi mạng. */
  const ngan = Array.from({ length: 200 }, (_, i) => i);
  const a = lark.chiaLo(ngan, () => 10);
  t('200 dòng ngắn vẫn đi một lô', a.length === 1 && a[0].length === 200,
    JSON.stringify(a.map((x) => x.length)));

  /* Quá 200 dòng thì chia, vì Lark chỉ nhận 200 bản ghi mỗi lần. */
  const nhieu = Array.from({ length: 450 }, (_, i) => i);
  const b = lark.chiaLo(nhieu, () => 10);
  t('quá 200 dòng thì chia theo giới hạn của Lark',
    b.map((x) => x.length).join() === '200,200,50', JSON.stringify(b.map((x) => x.length)));

  /* Dòng dài thì chia sớm hơn 200 — đây là ca đã làm hỏng lượt ghi thật. */
  const dai = Array.from({ length: 200 }, (_, i) => i);
  const c = lark.chiaLo(dai, () => 300);
  t('dòng dài thì chia trước khi chạm 200', c.length > 1, String(c.length));
  const max = Math.max(...c.map((x) => x.reduce((s) => s + 300, 0)));
  t('không lô nào vượt ngưỡng', max <= lark.NGUONG_JSON, String(max));
  t('không mất dòng nào', c.reduce((s, x) => s + x.length, 0) === 200);

  /* Một dòng tự nó đã quá dài thì vẫn phải gửi, một mình. Bỏ nó đi là mất dữ
   * liệu âm thầm; để lark-cli báo lỗi thật của nó thì còn đọc được. */
  const khong = lark.chiaLo([1, 2], () => lark.NGUONG_JSON * 2);
  t('dòng quá dài vẫn được gửi, mỗi lô một dòng',
    khong.length === 2 && khong.every((x) => x.length === 1),
    JSON.stringify(khong));

  t('danh sách rỗng ra lô rỗng', lark.chiaLo([], () => 1).length === 0);
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exitCode = fail ? 1 : 0;
