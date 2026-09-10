'use strict';
/* `node test/api.test.js` — CHỈ ĐỌC, không ghi một dòng nào lên Base.
 *
 * Hai phần: hàm lọc/tổng hợp chạy trên dữ liệu bịa (nhanh, chắc), và một lượt
 * gọi thật vào Base để chắc là table/field ID trong config.js còn đúng. Phần gọi
 * thật tự bỏ qua nếu máy chưa đăng nhập lark-cli, để test vẫn chạy được ở CI. */
const assert = require('assert');
const http = require('http');

const { loc, tongHop, thamSo, nhomChat, nguoiDaLam, server } = require('../server');
const cfg = require('../config');
const ttm = require('../ten-thu-muc');

let so = 0;
const t = (ten, fn) => {
  try { fn(); so++; console.log('  ✓ ' + ten); }
  catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};
const ta = async (ten, fn) => {
  try { await fn(); so++; console.log('  ✓ ' + ten); }
  catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};

/* ---------------- dữ liệu bịa ---------------- */
const N = (id, name) => ({ id, name });
const DS = [
  { id: 'r1', thuMuc: 'TOUR ĐẢO · Ghép · 10.09.2026', tour: 'TOUR ĐẢO', loai: 'Ghép',
    ngay: '2026-09-10', hangMuc: ['Chỉnh ảnh'], soAnh: 100, soVideo: 0,
    nguoiLam: [N('ou_a', 'An'), N('ou_b', 'Bình')], trangThai: 'Chờ nghiệm thu',
    daGui: true, ghiChu: '', nhanXet: '' },
  { id: 'r2', thuMuc: 'LAND TOUR · VIP · 09.09.2026', tour: 'LAND TOUR', loai: 'VIP',
    ngay: '2026-09-09', hangMuc: ['Chỉnh ảnh', 'Edit video'], soAnh: 60, soVideo: 2,
    nguoiLam: [N('ou_a', 'An')], trangThai: 'Đạt', daGui: true, ghiChu: 'khách VIP', nhanXet: '' },
  { id: 'r3', thuMuc: 'GRAND WORLD · Ghép · 01.08.2026', tour: 'GRAND WORLD', loai: 'Ghép',
    ngay: '2026-08-01', hangMuc: ['Edit video'], soAnh: 0, soVideo: 5,
    nguoiLam: [N('ou_c', 'Cường')], trangThai: 'Cần sửa lại', daGui: false,
    ghiChu: '', nhanXet: 'màu bị lệch' },
  { id: 'r4', thuMuc: 'PHÁO HOA · Khác · 10.09.2026', tour: 'PHÁO HOA', loai: 'Khác',
    ngay: '2026-09-10', hangMuc: ['Chỉnh ảnh'], soAnh: 30, soVideo: 0,
    nguoiLam: [], trangThai: 'Chờ nghiệm thu', daGui: false, ghiChu: '', nhanXet: '' },
];
const KHOANG = { tu: '2026-09-01', den: '2026-09-30' };

console.log('\nlọc');

t('lọc theo khoảng ngày bỏ đúng dòng ngoài khoảng', () => {
  const r = loc(DS, { ...KHOANG });
  assert.deepStrictEqual(r.map((x) => x.id), ['r1', 'r2', 'r4']);
});

t('lọc theo Tour, Trạng thái, Hạng mục', () => {
  assert.strictEqual(loc(DS, { ...KHOANG, tour: 'LAND TOUR' }).length, 1);
  assert.strictEqual(loc(DS, { tu: '2026-01-01', den: '2026-12-31', trangThai: 'Cần sửa lại' }).length, 1);
  assert.strictEqual(loc(DS, { ...KHOANG, hangMuc: 'Edit video' }).length, 1);
});

t('lọc "chỉ của tôi" đếm cả khi mình là người thứ hai trong lô', () => {
  const r = loc(DS, { tu: '2026-01-01', den: '2026-12-31', nguoi: 'ou_b' });
  assert.deepStrictEqual(r.map((x) => x.id), ['r1']);
});

t('tìm chữ quét cả tên thư mục, ghi chú, nhận xét và tên người', () => {
  assert.strictEqual(loc(DS, { tu: '2026-01-01', den: '2026-12-31', q: 'khách vip' }).length, 1);
  assert.strictEqual(loc(DS, { tu: '2026-01-01', den: '2026-12-31', q: 'lệch' }).length, 1);
  assert.strictEqual(loc(DS, { tu: '2026-01-01', den: '2026-12-31', q: 'cường' }).length, 1);
});

t('dòng chưa có ngày không bị bộ lọc thời gian ném đi', () => {
  const co = loc([{ ...DS[0], id: 'x', ngay: '' }], { ...KHOANG });
  assert.strictEqual(co.length, 1, 'lô chưa ghi ngày mà bị lọc mất thì không ai thấy để sửa');
});

console.log('\ntổng hợp');

t('cộng đúng số lô, ảnh, video', () => {
  const s = tongHop(DS);
  assert.strictEqual(s.soBaoCao, 4);
  assert.strictEqual(s.soAnh, 190);
  assert.strictEqual(s.soVideo, 7);
});

t('đếm đúng ba trạng thái và số chưa gửi nhóm', () => {
  const s = tongHop(DS);
  assert.strictEqual(s.choNghiemThu, 2);
  assert.strictEqual(s.dat, 1);
  assert.strictEqual(s.canSua, 1);
  assert.strictEqual(s.chuaGui, 2);
});

t('một lô hai người thì đếm cho TỪNG người — tổng lượt > tổng lô', () => {
  const s = tongHop(DS);
  const luot = s.theoNguoi.reduce((a, u) => a + u.lo, 0);
  assert.strictEqual(luot, 5, 'phải là 5 lượt trên 4 lô (r1 có hai người)');
  const an = s.theoNguoi.find((u) => u.ten === 'An');
  assert.strictEqual(an.lo, 2);
  assert.strictEqual(an.anh, 160);
});

t('lô không có người làm vào hàng "Chưa ghi người", không mất tích', () => {
  const s = tongHop(DS);
  assert.ok(s.theoNguoi.some((u) => u.ten === 'Chưa ghi người'));
});

t('hàng người xếp giảm dần theo số lô — ai bị dồn nằm trên cùng', () => {
  const s = tongHop(DS);
  for (let i = 1; i < s.theoNguoi.length; i++) {
    assert.ok(s.theoNguoi[i - 1].lo >= s.theoNguoi[i].lo);
  }
});

t('theoTour cộng đúng và có nhãn cho lô chưa ghi Tour', () => {
  const s = tongHop([...DS, { ...DS[0], id: 'r5', tour: '', soAnh: 10 }]);
  assert.ok(s.theoTour.some((x) => x.ten === '(chưa ghi Tour)'));
  assert.strictEqual(s.theoTour.find((x) => x.ten === 'TOUR ĐẢO').anh, 100);
});

console.log('\ntham số & cấu hình');

t('không truyền gì thì mặc định 30 ngày gần nhất', () => {
  const p = thamSo(new URL('http://x/api/bao-cao'));
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(p.tu) && /^\d{4}-\d{2}-\d{2}$/.test(p.den));
  const ngay = (Date.parse(p.den) - Date.parse(p.tu)) / 86400000;
  assert.strictEqual(ngay, 29);
});

t('tìm chữ được hạ về chữ thường ngay ở tầng tham số', () => {
  const p = thamSo(new URL('http://x/api/bao-cao?q=TOUR%20%C4%90%E1%BA%A2O'));
  assert.strictEqual(p.q, 'tour đảo');
});

t('chưa có cài đặt trên Base thì nhóm chat rơi về hằng trong config', () => {
  const n = nhomChat({ caiDat: {} });
  assert.strictEqual(n.id, cfg.chatMacDinh);
  assert.strictEqual(n.tuBase, false);
});

t('có cài đặt trên Base thì cài đặt thắng hằng', () => {
  const n = nhomChat({ caiDat: { chat_id: 'oc_khac', chat_ten: 'Nhóm khác' } });
  assert.strictEqual(n.id, 'oc_khac');
  assert.strictEqual(n.ten, 'Nhóm khác');
  assert.strictEqual(n.tuBase, true);
});

t('mọi field ID trong config đều là fld… và không trùng nhau trong một bảng', () => {
  Object.entries(cfg.tables).forEach(([ten, b]) => {
    assert.ok(/^tbl/.test(b.id), ten + ': table id lạ');
    const ids = Object.values(b.f);
    ids.forEach((x) => assert.ok(/^fld/.test(x), ten + ': field id lạ ' + x));
    assert.strictEqual(new Set(ids).size, ids.length, ten + ': có field ID bị khai hai lần');
  });
});

t('tin gửi bằng danh tính bot, còn Base đọc/ghi bằng danh tính người', () => {
  /* Đổi identityTin về 'user' là mỗi nhân sự phải tự đăng nhập Lark thêm một lần
   * để có scope im:message.send_as_user. Chốt lại bằng phép thử để đừng ai đổi
   * cho "nhất quán" rồi cả luồng gửi tin chết ở máy người khác. */
  assert.strictEqual(cfg.identityTin, 'bot');
  assert.strictEqual(cfg.identity, 'user');
});

t('KHÔNG cắm sẵn App ID gửi tin — phải khai trong .env', () => {
  /* Đã có lần cắm sẵn cli_aa04305ecd385ed1 vì tưởng đó là "Marketing Hub"; thật ra
   * đó là app "Tracking". Phòng có 5 app trong Console. Cắm mặc định sai mà người
   * dùng chỉ dán SECRET của app khác thì id/secret lệch nhau → lỗi token khó hiểu.
   * Nên mặc định là RỖNG, và bắt khai cả hai. */
  assert.strictEqual(cfg.tinAppId, process.env.ANH_TIN_APP_ID || '');
  assert.notStrictEqual(cfg.tinAppId, 'cli_aaeafc646039ded1', 'không được là app của lark-cli');
});

t('khai NỬA VỜI (có secret, thiếu App ID) cũng phải tự tắt và nói ra', () => {
  /* Trạng thái này có thật: anh Hùng dán secret trước, App ID sau. Nếu chỉ xét
   * secret thì app tưởng đã cấu hình xong và đi gọi Lark với App ID rỗng — lỗi
   * trả về không nói gì về việc thiếu App ID. Điều kiện đúng là co() = ĐỦ CẢ HAI. */
  const tinApp = require('../tin-app');
  const g = tinApp.nguoiGui();
  assert.strictEqual(tinApp.co(), Boolean(cfg.tinAppId && cfg.tinAppSecret));

  if (tinApp.co()) {
    assert.strictEqual(g.appId, cfg.tinAppId);
    assert.notStrictEqual(g.qua, 'cli');
  } else {
    assert.strictEqual(g.qua, 'cli', 'phải khai ra là đang dùng bot khác, không im lặng');
    assert.strictEqual(g.nen.ten, cfg.tinAppTen, 'và nêu bot đáng lẽ phải dùng');
  }
});

t('tiêu đề tin khai trong config, đổi câu chữ không phải sửa code', () => {
  assert.ok(cfg.tieuDeTin && cfg.tieuDeTin.length > 3, 'thiếu tieuDeTin');
  /* Tiêu đề là thứ Media và CSKH đọc, nên anh Hùng sẽ còn chỉnh câu chữ. Để trong
   * config + .env (ANH_TIEU_DE_TIN) thì đổi là xong, không phải sửa tin.js. */
  assert.strictEqual(cfg.tieuDeTin, process.env.ANH_TIEU_DE_TIN || 'Media khách hàng Rooty Trip');
});

t('option select khai trong config khớp với thứ ten-thu-muc sinh ra', () => {
  // docLoai chỉ trả 'Ghép' hoặc 'VIP' — cả hai phải là option thật của cột Loại
  ['Ghép', 'VIP'].forEach((x) => assert.ok(cfg.loai.includes(x), 'thiếu option ' + x));
  assert.ok(cfg.trangThai.includes('Chờ nghiệm thu'));
});

console.log('\ndanh bạ người chỉnh');

t('nguoiDaLam gom đúng người từ bảng Báo cáo, không trùng, xếp theo tên', () => {
  const ds = nguoiDaLam(DS);
  assert.deepStrictEqual(ds.map((x) => x.ten), ['An', 'Bình', 'Cường']);
  assert.strictEqual(new Set(ds.map((x) => x.id)).size, 3);
});

t('lô chưa ghi người thì không sinh ra người rỗng trong danh bạ', () => {
  const ds = nguoiDaLam([{ nguoiLam: [] }, { nguoiLam: [{ id: '', name: 'x' }] }]);
  assert.strictEqual(ds.length, 0);
});

/* ---------------- gọi thật vào Base (chỉ đọc) ---------------- */
function get(port, duong) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: duong, headers: { 'x-hub-user-manager': '1' } }, (r) => {
      let s = '';
      r.on('data', (c) => { s += c; });
      r.on('end', () => {
        try { resolve({ code: r.statusCode, j: JSON.parse(s) }); }
        catch (e) { reject(new Error('phản hồi không phải JSON: ' + s.slice(0, 200))); }
      });
    }).on('error', reject);
  });
}

function post(port, duong, body) {
  return new Promise((resolve, reject) => {
    const b = Buffer.from(JSON.stringify(body), 'utf8');
    const r = http.request({
      host: '127.0.0.1', port, path: duong, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': b.length,
        'x-hub-user-manager': '1',
      },
    }, (res) => {
      let s2 = '';
      res.on('data', (c) => { s2 += c; });
      res.on('end', () => {
        try { resolve({ code: res.statusCode, j: JSON.parse(s2) }); }
        catch (e) { reject(new Error('phản hồi không phải JSON: ' + s2.slice(0, 200))); }
      });
    });
    r.on('error', reject);
    r.end(b);
  });
}

async function goiThat() {
  console.log('\ngọi thật vào Base (chỉ đọc)');
  /* Cổng 0 = để hệ điều hành chọn cổng rảnh, rồi đọc lại cổng thật.
   * Trước đây cắm cứng 5199: một lần chạy bị ngắt giữa đường là cổng còn treo, và
   * mọi lần chạy sau đó chết bằng EADDRINUSE — trông như test hỏng chứ không phải
   * cổng bận. */
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  try {
    const meta = await get(port, '/api/meta');
    if (meta.code !== 200) {
      console.log('  – bỏ qua: ' + (meta.j.error || meta.code)
        + '\n    (máy chưa đăng nhập lark-cli thì phần này không chạy được)');
      return;
    }

    await ta('/api/meta trả danh mục Tour đọc từ Base', () => {
      assert.ok(Array.isArray(meta.j.tours) && meta.j.tours.length > 0, 'không có Tour nào');
      assert.ok(meta.j.tours.every((x) => x.ten), 'có Tour không tên');
    });

    await ta('danh mục Tour trên Base sinh ra khoá chống trùng KHÔNG bị đụng nhau', () => {
      /* Từ 10/09/2026 tên sản phẩm ghép từ danh mục Tour trong Base, không gõ tay.
       * Nên rủi ro chuyển sang chính danh mục: hai Tour mà `gon()` ra cùng chuỗi
       * (VD "TOUR ĐẢO" và "Tour đảo") sẽ dùng CHUNG một khoá, và lô của tour này
       * đè lô của tour kia trên Base. Kiểm ngay trên danh mục thật. */
      const ds = meta.j.toursAll.map((x) => x.ten);
      assert.ok(ds.length > 0, 'danh mục Tour rỗng');
      assert.ok(ds.every((x) => x && x.trim()), 'có Tour tên rỗng');

      const theoGon = new Map();
      ds.forEach((ten) => {
        const g = ttm.gon(ten);
        assert.ok(g, 'Tour "' + ten + '" gọn hoá ra chuỗi rỗng — khoá sẽ lửng');
        if (theoGon.has(g)) {
          throw new Error('hai Tour đụng khoá: "' + theoGon.get(g) + '" và "' + ten + '"');
        }
        theoGon.set(g, ten);
      });

      /* Và tên thư mục ghép ra phải khác nhau giữa các Tour. */
      const ten = ds.map((x) => ttm.dat({ tour: x, loai: 'Ghép', ngay: '2026-09-10' }));
      assert.strictEqual(new Set(ten).size, ten.length, 'hai Tour ghép ra cùng một tên thư mục');
    });

    await ta('/api/meta nói rõ nhóm chat đang dùng', () => {
      assert.ok(/^oc_/.test(meta.j.nhom.id), 'chat_id lạ: ' + meta.j.nhom.id);
    });

    await ta('/api/bao-cao đọc được bảng Báo cáo và trả tổng hợp', async () => {
      const r = await get(port, '/api/bao-cao?tu=2026-01-01&den=2026-12-31');
      assert.strictEqual(r.code, 200);
      assert.ok(Array.isArray(r.j.baoCao));
      assert.strictEqual(r.j.tong.soBaoCao, r.j.baoCao.length);
    });

    await ta('/api/tong-quan trả đúng bộ khoá mà hub cần', async () => {
      const r = await get(port, '/api/tong-quan');
      assert.strictEqual(r.code, 200);
      ['soBaoCao', 'soAnh', 'soVideo', 'choNghiemThu', 'canSua', 'chuaGui', 'ngoaiKhoang']
        .forEach((k) => assert.ok(k in r.j, 'thiếu khoá ' + k));
    });

    await ta('đường dẫn quản lý chặn người không có vai', async () => {
      const r = await new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port, path: '/api/quan-ly/nhom' }, (res) => {
          let s = '';
          res.on('data', (c) => { s += c; });
          res.on('end', () => resolve({ code: res.statusCode, body: s }));
        }).on('error', reject);
      });
      /* Ở chế độ cli (máy cá nhân) ai cũng là quản lý — chốt chỉ có nghĩa ở chế độ
       * api. Nên phép thử chấp nhận cả hai, miễn là KHÔNG lỗi 500. */
      assert.ok(r.code === 200 || r.code === 403, 'mã lạ: ' + r.code);
    });

    await ta('/api/nhan-su không có q thì trả người đã từng làm, không lỗi', async () => {
      const r = await get(port, '/api/nhan-su');
      assert.strictEqual(r.code, 200);
      assert.ok(Array.isArray(r.j.nguoi));
    });

    await ta('nghiệm thu: trạng thái lạ bị chặn TRƯỚC khi ghi', async () => {
      const r = await post(port, '/api/quan-ly/nghiem-thu',
        { id: 'recKhongCo', trangThai: 'Đang xem' });
      assert.strictEqual(r.code, 400);
      assert.ok(/Đạt/.test(r.j.error), r.j.error);
    });

    await ta('nghiệm thu: "Chờ nghiệm thu" không phải kết quả nghiệm thu', async () => {
      /* Gửi lại chính trạng thái đang chờ thì chẳng quyết gì cả, nhưng vẫn ghi
       * "Nghiệm thu lúc" và bắn tin về nhóm — phải chặn. */
      const r = await post(port, '/api/quan-ly/nghiem-thu',
        { id: 'recKhongCo', trangThai: 'Chờ nghiệm thu' });
      assert.strictEqual(r.code, 400);
    });

    await ta('nghiệm thu: trả về sửa mà KHÔNG ghi nhận xét thì bị chặn', async () => {
      /* Đây là chốt quan trọng nhất của nghiệm thu: "xấu thì sửa lại" mà không nói
       * sửa gì là đúng cái tình trạng cũ mà app này ra đời để bỏ. Và nhận xét cũng
       * là nguyên liệu cho phần AI sau này. */
      const r = await post(port, '/api/quan-ly/nghiem-thu',
        { id: 'recKhongCo', trangThai: 'Cần sửa lại', nhanXet: '   ' });
      assert.strictEqual(r.code, 400);
      assert.ok(/sửa gì/.test(r.j.error), r.j.error);
    });

    await ta('POST nhiều mục: chặn hai mục cùng Tour + Loại + ngày TRƯỚC khi ghi', async () => {
      const tour = meta.j.toursAll[0];
      const r = await post(port, '/api/bao-cao', {
        gui: false,
        muc: [
          { tourId: tour.id, loai: 'Ghép', ngay: '2026-01-02', hangMuc: ['Chỉnh ảnh'], linkAnh: 'https://vi.du/1' },
          { tourId: tour.id, loai: 'Ghép', ngay: '2026-01-02', hangMuc: ['Chỉnh ảnh'], linkAnh: 'https://vi.du/2' },
        ],
      });
      assert.strictEqual(r.code, 400, 'phải bị chặn, nếu không mục 2 đè mục 1 trên Base');
      assert.ok(/trùng/.test(r.j.error), r.j.error);
    });

    await ta('POST nhiều mục: mục nào thiếu link thì báo rõ SỐ MỤC và không ghi gì', async () => {
      const tour = meta.j.toursAll[0];
      const truoc = (await get(port, '/api/bao-cao?tu=2026-01-01&den=2026-01-31')).j.baoCao.length;
      const r = await post(port, '/api/bao-cao', {
        gui: false,
        muc: [
          { tourId: tour.id, loai: 'Ghép', ngay: '2026-01-03', hangMuc: ['Chỉnh ảnh'], linkAnh: 'https://vi.du/1' },
          { tourId: tour.id, loai: 'VIP', ngay: '2026-01-03', hangMuc: ['Edit video'] },
        ],
      });
      assert.strictEqual(r.code, 400);
      assert.ok(/Mục 2/.test(r.j.error), r.j.error);
      const sau = (await get(port, '/api/bao-cao?tu=2026-01-01&den=2026-01-31&moi=1')).j.baoCao.length;
      assert.strictEqual(sau, truoc, 'mục 1 hợp lệ nhưng mục 2 lỗi → KHÔNG được ghi nửa vời');
    });

    await ta('POST quá 20 mục thì từ chối', async () => {
      const tour = meta.j.toursAll[0];
      const muc = Array.from({ length: 21 }, (_, k) => ({
        tourId: tour.id, loai: 'Ghép', ngay: '2026-02-' + String((k % 28) + 1).padStart(2, '0'),
        hangMuc: ['Chỉnh ảnh'], linkAnh: 'https://vi.du/' + k,
      }));
      const r = await post(port, '/api/bao-cao', { gui: false, muc });
      assert.strictEqual(r.code, 400);
      assert.ok(/20 mục/.test(r.j.error), r.j.error);
    });

    await ta('đường dẫn không có thì trả 404, không phải 500', async () => {
      const r = await get(port, '/api/khong-co-dau');
      assert.strictEqual(r.code, 404);
    });
  } finally {
    await new Promise((r) => server.close(r));
  }
}

goiThat()
  .catch((e) => { console.error('  ✗ gọi thật: ' + e.message); process.exitCode = 1; })
  .then(() => {
    console.log('\n' + so + ' phép thử đạt' + (process.exitCode ? ' — CÓ LỖI' : '') + '\n');
  });
