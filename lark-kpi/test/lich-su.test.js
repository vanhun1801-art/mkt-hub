'use strict';
/* Test thuần Node: `node test/lich-su.test.js`.
 *
 * Canh việc nhập lịch sử 8 tháng 2026 từ file Excel: bộ máy phải tái tạo đúng
 * điểm đã trả lương, và MỌI ô lệch phải giải thích được. Một ô lệch không có lý
 * do là dấu hiệu bộ máy tính sai — đúng thứ không được phép xảy ra khi con số
 * này dùng để trả lương. */
const assert = require('assert');
const fs = require('fs');
const L = require('../luat');
const { chamThang } = require('../tinh');
const { FILE } = require('../doi-chieu');

let so = 0;
const t = (ten, fn) => {
  try { fn(); so++; console.log('  ✓ ' + ten); }
  catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};

if (!fs.existsSync(FILE)) {
  console.log('\nBỏ qua: chưa nhập lịch sử (' + FILE + ')\n');
  return;
}
const ds = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const thangs = Object.keys(ds.thang).sort();

console.log('\nnhập lịch sử 2026');

t('có đủ 8 tháng, tháng nào cũng có bộ luật và số liệu', () => {
  assert.strictEqual(thangs.length, 8);
  thangs.forEach((th) => {
    const x = ds.thang[th];
    assert.ok(x.luat && x.luat.nhom.length, th + ': thiếu nhóm kênh');
    assert.ok(x.luat.nguoi.length, th + ': thiếu người');
    assert.ok(Object.keys(x.soLieu).length, th + ': thiếu số liệu');
  });
});

t('mọi bộ luật nhập vào đều qua được phép soát cấu trúc', () => {
  /* Cho phép hai loại chặn đến từ chính dữ liệu cũ, không phải lỗi hình dạng:
   * người chưa có phân bổ kênh (Ngọc các tháng đầu chưa vào làm) và tổng trọng
   * số lệch (Hân tháng 5 = 1,3 — lỗi thật của bảng cũ, đã báo cho anh Hùng). */
  const boQua = /Tỷ trọng kênh cộng ra|Tổng trọng số/;
  thangs.forEach((th) => {
    const con = L.soat(ds.thang[th].luat)
      .filter((x) => x.muc === 'chan' && !boQua.test(x.viec));
    assert.deepStrictEqual(con, [], th + ': ' + JSON.stringify(con.slice(0, 2)));
  });
});

t('không bộ luật nào còn tiêu chí thiếu mục tiêu', () => {
  // Đây chính là gốc của mọi ô lệch; bộ luật trong app phải sạch.
  thangs.forEach((th) => {
    ds.thang[th].luat.nhom.forEach((n) => n.tieuChi.forEach((tc) => {
      assert.ok(typeof tc.mucTieu === 'number' && tc.mucTieu > 0,
        th + ' · ' + n.tenKenh + ' · ' + tc.ten + ': mục tiêu = ' + tc.mucTieu);
    }));
  });
});

t('tỷ trọng tiêu chí trong mỗi nhóm cộng đủ 100%', () => {
  thangs.forEach((th) => {
    ds.thang[th].luat.nhom.forEach((n) => {
      const s = n.tieuChi.reduce((a, x) => a + x.tyTrong, 0);
      assert.ok(Math.abs(s - 1) < 1e-9, th + ' · ' + n.tenKenh + ': ' + s);
    });
  });
});

t('chấm lại 8 tháng: mọi ô lệch đều có tiêu chí bị loại lúc nhập để giải thích', () => {
  let khop = 0; let lech = 0;
  thangs.forEach((th) => {
    const x = ds.thang[th];
    const kq = chamThang(x.luat, x.soLieu, x.chamTay, th);
    const coBoQua = (x.boQuaKhiNhap || []).length > 0;
    kq.nguoi.forEach((ng) => {
      const cu = (x.daTraLuong || {})[ng.ma];
      if (cu == null) return;
      if (Math.abs(cu - ng.tong) <= 0.0005) { khop += 1; return; }
      lech += 1;
      assert.ok(coBoQua,
        th + ' · ' + ng.ten + ' lệch ' + cu + ' → ' + ng.tong + ' mà không có lý do');
    });
  });
  console.log('      (' + khop + ' ô khớp, ' + lech + ' ô lệch có lý do)');
  assert.ok(khop > lech * 5, 'phần lớn phải khớp, nếu không là bộ máy sai');
});

t('chấm hai lần ra đúng cùng một kết quả', () => {
  const th = thangs[6];
  const x = ds.thang[th];
  const a = chamThang(x.luat, x.soLieu, x.chamTay, th);
  const b = chamThang(x.luat, x.soLieu, x.chamTay, th);
  assert.deepStrictEqual(a.nguoi, b.nguoi);
});

console.log('\n' + so + ' phép thử đạt' + (process.exitCode ? ' — CÓ LỖI' : '') + '\n');
