'use strict';
/**
 * Test bộ luật phân phối công việc. Toàn hàm thuần, không cần mạng, không cần Base.
 *
 * Việc này quyết định công việc của người khác, nên mỗi luật phải có một phép thử
 * nói rõ nó làm gì — và vài phép thử nói rõ nó KHÔNG làm gì (không giao khi chưa
 * khai, không giao cho người tạm ngưng, không giao việc đã có chủ).
 *
 * Chạy: node test/phanphoi.test.js
 */
const P = require('../phanphoi');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else {
    fail++; fails.push(ten);
    console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + vi : ''));
  }
};
const group = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');

const NOW = Date.parse('2026-09-05T10:00:00+07:00');
const PHUT = 60000;

const ng = (id, ten) => ({ id, name: ten });
const viec = (o) => Object.assign({
  id: 'r' + Math.random().toString(36).slice(2, 8),
  title: 'việc', status: 'Chờ tiếp nhận', workType: 'Content', owner: [], requester: [],
}, o);

/** Cấu hình mẫu: Content chia 50/50 cho Ngọc và Thư. */
const CH = () => ({
  chung: { bat: true, phut: 5, trangThai: ['Chờ tiếp nhận'] },
  luong: [{ loai: 'Content', bat: true, cach: 'tai' }],
  nguoi: [
    { loai: 'Content', id: 'u-ngoc', ten: 'Hồng Ngọc', trongSo: 50 },
    { loai: 'Content', id: 'u-thu', ten: 'Anh Thư', trongSo: 50 },
  ],
});

(async () => {
  group('1. Đếm việc — mở và tổng lượt là hai con số khác nhau');
  {
    const ts = [
      viec({ owner: [ng('u-ngoc', 'Hồng Ngọc')], status: 'Đang tiến hành' }),
      viec({ owner: [ng('u-ngoc', 'Hồng Ngọc')], status: 'Hoàn thành' }),
      viec({ owner: [ng('u-thu', 'Anh Thư')], status: 'Đang tiến hành' }),
      viec({ owner: [ng('u-thu', 'Anh Thư')], status: 'Đang tiến hành', workType: 'Thiết kế' }),
    ];
    const mo = P.demViec(ts, 'Content', 'mo');
    const tat = P.demViec(ts, 'Content', 'tatCa');
    ok('việc đã Hoàn thành không tính vào việc mở', mo.get('u-ngoc') === 1, String(mo.get('u-ngoc')));
    ok('nhưng vẫn tính vào tổng lượt', tat.get('u-ngoc') === 2, String(tat.get('u-ngoc')));
    ok('việc loại khác không lọt vào', mo.get('u-thu') === 1, String(mo.get('u-thu')));
    ok('bỏ emoji dẫn đầu của trạng thái',
      P.dong({ status: '✅ Hoàn thành' }), 'nhan="' + P.nhan('✅ Hoàn thành') + '"');
  }

  group('2. Tỷ lệ + cân tải');
  {
    const ung = CH().nguoi;
    const dem = (a, b) => new Map([['u-ngoc', a], ['u-thu', b]]);
    ok('một người đang nhiều hơn thì chọn người kia',
      P.chonNguoi(ung, dem(3, 1), 'tai').id === 'u-thu');

    /* Hai người CÙNG tỷ lệ, CÙNG tải: phải cho ra cùng kết quả ở mọi lần chạy.
     * Không thì hai lần bấm trên cùng dữ liệu lại ra hai người khác nhau, và
     * người ta hết tin cái bảng. Chốt bằng tên. */
    ok('hoà tuyệt đối thì chốt theo tên, không ngẫu nhiên',
      P.chonNguoi(ung, dem(0, 0), 'tai').ten === 'Anh Thư',
      P.chonNguoi(ung, dem(0, 0), 'tai').ten);
    ok('chạy 5 lần cùng dữ liệu vẫn ra đúng một người',
      new Set([0, 0, 0, 0, 0].map(() => P.chonNguoi(ung, dem(2, 2), 'tai').id)).size === 1);

    /* Tỷ lệ lệch: người trọng số cao nhận trước nhưng KHÔNG nhận hết. Mốc đổi
     * lượt theo phép chia dư lớn nhất — 90/10 ở việc thứ 6 thì phần lý tưởng là
     * 5,4/0,6; giao cho B ra 5/1 (lệch 0,4) gần hơn giao cho A ra 6/0 (lệch 0,6). */
    const lech = [
      { id: 'a', ten: 'A', trongSo: 90 },
      { id: 'b', ten: 'B', trongSo: 10 },
    ];
    ok('90/10 — chưa ai có việc thì A nhận',
      P.chonNguoi(lech, new Map(), 'tai').id === 'a');
    ok('90/10 — A giữ 3, B giữ 0 thì vẫn A (chưa tới lượt B)',
      P.chonNguoi(lech, new Map([['a', 3], ['b', 0]]), 'tai').id === 'a');

    /* Ở việc thứ 5 (A=4, B=0) chỉ tiêu là 4,5/0,5 — HOÀ đúng bằng nhau. Luật chốt
     * là "ai đang ít hơn thì nhận", nên B tới lượt ở đây. Chuỗi 10 việc vẫn ra
     * đúng 9/1 (xem nhóm 3); chốt kiểu này chỉ làm lượt của người ít việc tới
     * SỚM hơn, thay vì để họ chờ tới việc thứ 10. */
    ok('90/10 — hoà chỉ tiêu thì ai đang ít hơn nhận',
      P.chonNguoi(lech, new Map([['a', 4], ['b', 0]]), 'tai').id === 'b');
    ok('90/10 — B đã có 1 rồi thì quay lại A',
      P.chonNguoi(lech, new Map([['a', 5], ['b', 1]]), 'tai').id === 'a');
    ok('90/10 — chia 10 việc vẫn đúng 9/1 (đây mới là điều phải đúng)',
      (() => { const d = new Map(); const r = { a: 0, b: 0 };
        for (let i = 0; i < 10; i++) { const c = P.chonNguoi(lech, d, 'tai');
          r[c.id]++; d.set(c.id, (d.get(c.id) || 0) + 1); }
        return r.a === 9 && r.b === 1; })());

    const c = P.chonNguoi(ung, dem(3, 1), 'tai');
    ok('có câu giải thích đọc được', /tỷ lệ 50%.*đang giữ 1\/4/.test(c.vi), c.vi);
  }

  group('3. Chia đủ 10 việc thì đúng tỷ lệ');
  {
    const chay = (trongSo, soViec, cach) => {
      const ung = trongSo.map((w, i) => ({ id: 'p' + i, ten: 'P' + i, trongSo: w }));
      const dem = new Map();
      const ra = trongSo.map(() => 0);
      for (let i = 0; i < soViec; i++) {
        const c = P.chonNguoi(ung, dem, cach);
        const k = Number(c.id.slice(1));
        ra[k]++; dem.set(c.id, (dem.get(c.id) || 0) + 1);
      }
      return ra;
    };
    ok('50/50 × 10 việc -> 5 và 5', JSON.stringify(chay([50, 50], 10, 'tai')) === '[5,5]',
      JSON.stringify(chay([50, 50], 10, 'tai')));
    ok('70/30 × 10 việc -> 7 và 3', JSON.stringify(chay([70, 30], 10, 'tai')) === '[7,3]',
      JSON.stringify(chay([70, 30], 10, 'tai')));
    ok('50/25/15/10 × 20 việc -> 10/5/3/2',
      JSON.stringify(chay([50, 25, 15, 10], 20, 'tai')) === '[10,5,3,2]',
      JSON.stringify(chay([50, 25, 15, 10], 20, 'tai')));
    ok('luân phiên theo tỷ lệ cho cùng kết quả khi bắt đầu từ 0',
      JSON.stringify(chay([70, 30], 10, 'luot')) === '[7,3]');
  }

  group('4. Ít việc nhất — bỏ qua tỷ lệ');
  {
    const lech = [{ id: 'a', ten: 'A', trongSo: 90 }, { id: 'b', ten: 'B', trongSo: 10 }];
    ok('A đang 5 việc, B đang 1 thì chọn B dù A trọng số 90',
      P.chonNguoi(lech, new Map([['a', 5], ['b', 1]]), 'it').id === 'b');
    ok('câu giải thích nói đúng lý do',
      /ít việc nhất/.test(P.chonNguoi(lech, new Map([['a', 5], ['b', 1]]), 'it').vi));
  }

  group('5. Trọng số 0 = tạm ngưng (chỗ để tạm dừng một người khi nghỉ)');
  {
    const ung = [
      { id: 'a', ten: 'A', trongSo: 0 },
      { id: 'b', ten: 'B', trongSo: 50 },
    ];
    ok('người trọng số 0 không bao giờ được chọn',
      P.chonNguoi(ung, new Map([['b', 99]]), 'tai').id === 'b');
    ok('cả nhóm trọng số 0 thì không chọn ai',
      P.chonNguoi([{ id: 'a', ten: 'A', trongSo: 0 }], new Map(), 'tai') === null);
    const ch = CH();
    ch.nguoi.forEach((x) => { x.trongSo = 0; });
    const dx = P.deXuat(viec({}), [], ch);
    ok('và nói rõ vì sao không đề xuất', /tạm ngưng/.test(dx.khong), dx.khong);
  }

  group('6. Không đề xuất bừa');
  {
    const ch = CH();
    ok('việc chưa điền loại thì chịu',
      /chưa điền Loại/.test(P.deXuat(viec({ workType: '' }), [], ch).khong));
    ok('loại chưa khai trong bảng thì chịu',
      /chưa khai trong bảng/.test(P.deXuat(viec({ workType: 'Khác' }), [], ch).khong));
    const ch2 = CH(); ch2.nguoi = [];
    ok('khai loại nhưng chưa khai người thì chịu',
      /chưa khai người nhận/.test(P.deXuat(viec({}), [], ch2).khong));
  }

  group('7. Hàng đợi chờ phân công');
  {
    const ch = CH();
    const a = viec({ id: 'ra', title: 'Bài viết A' });
    const b = viec({ id: 'rb', title: 'Đã có chủ', owner: [ng('u-thu', 'Anh Thư')] });
    const c = viec({ id: 'rc', title: 'Đã xong', status: 'Hoàn thành' });
    const ds = P.dangCho([a, b, c], ch, NOW, new Map([['ra', NOW - 2 * PHUT]]));
    ok('chỉ lấy việc chưa có chủ và chưa đóng', ds.length === 1 && ds[0].id === 'ra',
      JSON.stringify(ds.map((x) => x.id)));
    ok('đếm ngược đúng: thấy 2 phút trước, chờ 5 phút -> còn 3', ds[0].conLaiPhut === 3,
      String(ds[0].conLaiPhut));
    ok('chưa tới hạn thì chưa được tự giao', ds[0].denHan === false);

    const ds2 = P.dangCho([a], ch, NOW, new Map([['ra', NOW - 6 * PHUT]]));
    ok('quá 5 phút thì tới hạn', ds2[0].denHan === true && ds2[0].conLaiPhut === 0);
    // 70/30 để người được chọn là rõ ràng, không rơi vào luật chốt-theo-tên
    const ch70 = CH();
    ch70.nguoi[0].trongSo = 70; ch70.nguoi[1].trongSo = 30;
    const ds70 = P.dangCho([a], ch70, NOW, new Map([['ra', NOW - 6 * PHUT]]));
    ok('và có tên người được đề xuất',
      ds70[0].deXuat && ds70[0].deXuat.ten === 'Hồng Ngọc',
      JSON.stringify(ds70[0].deXuat));

    /* Việc máy chủ CHƯA thấy bao giờ (vừa khởi động lại) phải được cấp trọn N
     * phút, không bị giao ngay. */
    const ds3 = P.dangCho([a], ch, NOW, new Map());
    ok('việc chưa từng thấy thì cấp trọn 5 phút, không giao ngay',
      ds3[0].conLaiPhut === 5 && ds3[0].denHan === false);
  }

  group('7b. Chỉ việc "Chờ tiếp nhận" mới cần phân phối');
  {
    const ch = CH();
    const cua = viec({ id: 'r1', status: 'Chờ tiếp nhận' });
    const dangLam = viec({ id: 'r2', status: 'Đang tiến hành' });
    const lamLai = viec({ id: 'r3', status: 'Làm lại' });
    const tamDung = viec({ id: 'r4', status: 'Tạm dừng' });

    ok('việc ở cửa vào thì nhận', P.canPhanPhoi(cua, ch));

    /* Ba trạng thái dưới đây cũng chưa có chủ, nhưng KHÔNG phải việc mới đặt —
     * đang làm dở mà bị gỡ người, hoặc dữ liệu cũ. Tự giao mấy cái đó là xen vào
     * việc quản lý đang xử lý tay. */
    ok('việc đang tiến hành mà trống người thì KHÔNG tự giao', !P.canPhanPhoi(dangLam, ch));
    ok('việc làm lại thì KHÔNG tự giao', !P.canPhanPhoi(lamLai, ch));
    ok('việc tạm dừng thì KHÔNG tự giao', !P.canPhanPhoi(tamDung, ch));
    ok('việc đã đóng thì KHÔNG tự giao',
      !P.canPhanPhoi(viec({ status: 'Hoàn thành' }), ch));
    ok('việc đã có chủ thì KHÔNG tự giao',
      !P.canPhanPhoi(viec({ owner: [ng('u-thu', 'Anh Thư')] }), ch));

    const ds = P.dangCho([cua, dangLam, lamLai, tamDung], ch, NOW, new Map());
    ok('hàng đợi chỉ có đúng việc ở cửa vào', ds.length === 1 && ds[0].id === 'r1',
      JSON.stringify(ds.map((x) => x.id)));

    /* Không khai trạng thái nào thì nhận hết — để đổi tên trạng thái trên Base
     * mà quên sửa config thì hệ thống rộng tay chứ không câm lặng bỏ sót. */
    const moRong = CH(); delete moRong.chung.trangThai;
    ok('chưa khai trạng thái thì nhận mọi việc chưa có chủ',
      P.canPhanPhoi(dangLam, moRong));
  }

  group('8. Công tắc — mặc định phải AN TOÀN');
  {
    const a = viec({ id: 'ra' });
    const thay = new Map([['ra', NOW - 9 * PHUT]]);

    const tat = CH(); tat.chung.bat = false;
    ok('tắt công tắc chung thì không tự giao',
      P.denLuotTuGiao([a], tat, NOW, thay).length === 0);

    const tatLoai = CH(); tatLoai.luong[0].bat = false;
    ok('tắt riêng một loại thì loại đó không tự giao',
      P.denLuotTuGiao([a], tatLoai, NOW, thay).length === 0);

    ok('bật cả hai mới tự giao', P.denLuotTuGiao([a], CH(), NOW, thay).length === 1);

    /* Vẫn phải ĐỀ XUẤT dù đang tắt tự động — đó là phần "hỗ trợ quản lý". */
    const ds = P.dangCho([a], tat, NOW, thay);
    ok('tắt tự động nhưng vẫn có đề xuất để bấm tay',
      !!ds[0].deXuat && ds[0].tuDong === false);
  }

  group('9. Bảng tải hiện tại');
  {
    const ts = [
      viec({ owner: [ng('u-ngoc', 'Hồng Ngọc')], status: 'Đang tiến hành' }),
      viec({ owner: [ng('u-ngoc', 'Hồng Ngọc')], status: 'Đang tiến hành' }),
      viec({ owner: [ng('u-thu', 'Anh Thư')], status: 'Đang tiến hành' }),
      viec({ owner: [ng('u-thu', 'Anh Thư')], status: 'Hủy' }),
    ];
    const b = P.bangTai(ts, CH())[0];
    ok('tổng việc mở đúng', b.tongMo === 3, String(b.tongMo));
    const ngoc = b.nguoi.find((x) => x.id === 'u-ngoc');
    ok('tỷ lệ khai là 50%', ngoc.tyLe === 50, String(ngoc.tyLe));
    ok('thực tế đang 67%', ngoc.thucTe === 67, String(ngoc.thucTe));
    ok('việc đã Hủy không tính vào đang mở',
      b.nguoi.find((x) => x.id === 'u-thu').dangMo === 1);
  }

  console.log('\n' + '─'.repeat(52));
  console.log('  ' + pass + ' pass · ' + fail + ' fail');
  if (fail) { console.log('\n  Không đạt:'); fails.forEach((f) => console.log('   - ' + f)); }
  console.log('─'.repeat(52) + '\n');
  process.exit(fail ? 1 : 0);
})();
