'use strict';
/**
 * BA CHỖ LỚP NGUỒN ĐÃ ĐIỀN SAI, tìm ra khi soát tháng 10/2026 — `node test/nguon-lech.test.js`.
 *
 *  1. LIVE khớp kênh theo mỗi cái tên. 23 phiên LIVE Facebook của "Rooty Trip
 *     Phú Quốc" bị tính luôn cho LIVE TikTok cùng tên, trong khi TikTok không
 *     có phiên nào: Khánh được 84% LIVE-view TikTok bằng số của Facebook.
 *  2. Người không đăng bài nào trên một kênh CÓ bài bị coi là "chưa đo được",
 *     tiêu chí view bị loại và tỷ trọng dồn sang follow, lead của cả kênh.
 *  3. Đổ số lần sau không xoá số của lần trước. Follow TikTok lỡ ghi 0 thì con 0
 *     ấy nằm lì trong bảng lương dù nguồn đã nói "chưa đo được".
 */
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const Module = require('module');

let so = 0;
const t = async (ten, fn) => {
  try { await fn(); so++; console.log('  ✓ ' + ten); }
  catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};

const BAI = [
  { platform: 'Facebook', channel: 'Trang A', poster: 'Phương Ái', mucDich: 'Bán hàng', views: 5000, publishedAt: '2026-10-02T09:00:00+07:00' },
  /* Bài trống tên ở TikTok Rooty Trip chia đều ba bạn. */
  { platform: 'TikTok', channel: 'Rooty Trip Phú Quốc', mucDich: 'Bán hàng', views: 3000, publishedAt: '2026-10-04T09:00:00+07:00' },
  /* Video LIVE Facebook cũng nằm trong bảng Bài đăng — không được cộng làm bài viết. */
  { platform: 'Facebook', channel: 'Trang A', extId: 'pg_777', mucDich: 'Tương tác', views: 9000, publishedAt: '2026-10-03T20:00:00+07:00' },
];
const LIVE = [
  { platform: 'Facebook', channel: 'Trang A', extId: '777', views: 9000, newFollows: 0, comments: 7 },
  { platform: 'Facebook', channel: 'Trang A', views: 1000, newFollows: 0, comments: 3 },
];

const may = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  const tra = (o) => {
    const b = Buffer.from(JSON.stringify(o));
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': b.length });
    res.end(b);
  };
  if (p === '/api/bai') return tra({ bai: BAI });
  if (p === '/api/tong-quan') {
    return tra({
      kenh: [
        { platform: 'Facebook', name: 'Trang A', views: 5000, followUp: 10 },
        { platform: 'TikTok', name: 'Trang A', views: 0, followUp: 0 },
        { platform: 'TikTok', name: 'Rooty Trip Phú Quốc', views: 3000, followUp: 0 },
      ],
      live: LIVE,
      /* App Chỉnh ảnh dùng chung máy giả này: lô đã nghiệm thu theo người. */
      theoNguoi: [{ ten: 'Danh Minh Trường', dat: 9, canSua: 1 }, { ten: 'Người khác', dat: 0, canSua: 5 }],
      /* LIVE TikTok về bằng tệp LIVE Center, ghi theo ngày. */
      liveNgay: [
        { platform: 'TikTok', channel: 'Trang C', date: '2026-10-02', luotXem: 700, followerMoi: 9, nguoiBinhLuan: 4, soPhien: 2 },
        { platform: 'TikTok', channel: 'Trang C', date: '2026-10-03', luotXem: 300, followerMoi: 1, nguoiBinhLuan: 1, soPhien: 1 },
        /* Kênh đã có phiên thì bản theo ngày không được cộng thêm. */
        { platform: 'Facebook', channel: 'Trang A', date: '2026-10-02', luotXem: 99999, soPhien: 1 },
      ],
    });
  }
  if (p === '/api/tin-nhan') return tra({ rows: [], chuaNoi: [] });
  if (p === '/api/tasks') {
    const v = (owner, status, deadline) => ({ workType: 'Edit Video', status, deadline, owner: [{ name: owner }] });
    return tra({ tasks: [
      v('Nguyễn Long Khánh (Pinky)', 'Hoàn thành', '2026-10-05 17:00:00'),
      v('Nguyễn Long Khánh (Pinky)', 'Hoàn thành', '2026-10-31T23:00:00.000+07:00'),
      v('Nguyễn Long Khánh (Pinky)', 'Đang tiến hành', '2026-10-06 17:00:00'),
      v('Nguyễn Long Khánh (Pinky)', 'Hoàn thành', '2026-11-01 09:00:00'),
      v('Danh Minh Trường', 'Hoàn thành', '2026-10-07 17:00:00'),
    ] });
  }
  return tra({});
});

const cs = (ma, nguon) => ({ ma, ten: ma, mucTieu: 1, tyTrong: 1, nguon });
const LUAT = {
  heSo: { macDinh: { 'Bán hàng': 1, 'Tương tác': 0.2 }, theoNhom: {} },
  nhom: [
    { kenh: 'FB', tenKenh: 'Trang A', loai: 'Live', tieuChi: [
      cs('lv', 'FB|Trang A|Live#liveView'),
      cs('lf', 'FB|Trang A|Live#liveFollow'),
    ] },
    { kenh: 'Thiết kế', tenKenh: 'Rooty Trip Phú Quốc', loai: 'Chung', tieuChi: [
      cs('tyLe', 'ChinhAnh|Rooty Trip Phú Quốc|Lô|truong#tyLeDat'),
    ] },
    { kenh: 'Tiktok', tenKenh: 'Trang C', loai: 'Live', tieuChi: [
      cs('lv', 'Tiktok|Trang C|Live#liveView'),
      cs('lf', 'Tiktok|Trang C|Live#liveFollow'),
    ] },
    { kenh: 'Tiktok', tenKenh: 'Trang A', loai: 'Live', tieuChi: [
      cs('lv', 'Tiktok|Trang A|Live#liveView'),
    ] },
    { kenh: 'FB', tenKenh: 'Trang A', loai: 'Bài viết', tieuChi: [
      cs('thu', 'FB|Trang A|Bài viết|thu#viewQuyDoi'),
      cs('ngoc', 'FB|Trang A|Bài viết|ngoc#viewQuyDoi'),
      cs('ngocBan', 'FB|Trang A|Bài viết|ngoc#viewBanHang'),
    ] },
    { kenh: 'Fanpage + Tiktok', tenKenh: 'Rooty Trip Phú Quốc', loai: 'Chung', tieuChi: [
      cs('soVideo', 'CongViec|Edit Video|Việc|khanh#viecXong'),
    ] },
    { kenh: 'Tiktok', tenKenh: 'Rooty Trip Phú Quốc', loai: 'Bài viết', tieuChi: [
      cs('hang', 'Tiktok|Rooty Trip Phú Quốc|Bài viết|hang#viewBanHang'),
    ] },
  ],
  nguoi: [],
};

(async () => {
  await new Promise((r) => may.listen(0, '127.0.0.1', r));
  const dc = 'http://127.0.0.1:' + may.address().port;
  const nguon = require('../nguon');
  nguon.DIA_CHI.social = dc;
  nguon.DIA_CHI['quang-cao'] = dc;
  nguon.DIA_CHI['cong-viec'] = dc;
  nguon.DIA_CHI['chinh-anh'] = dc;

  const r = await nguon.docTuApp('2026-10', LUAT);
  const s = r.soLieu;
  const dong = (ma) => r.nhatKy.find((x) => x.ma === ma) || {};

  console.log('\nLIVE khớp theo cả nền tảng');

  await t('LIVE Facebook vẫn cộng đủ các phiên', () => {
    assert.strictEqual(s['FB|Trang A|Live#liveView'], 10000);
  });

  await t('LIVE TikTok cùng tên kênh KHÔNG ăn số của Facebook', () => {
    assert.ok(!('Tiktok|Trang A|Live#liveView' in s),
      'TikTok không có phiên nào mà vẫn có số ' + s['Tiktok|Trang A|Live#liveView']);
    assert.strictEqual(dong('Tiktok|Trang A|Live#liveView').trangThai, 'thieu');
  });

  await t('người theo dõi mới của LIVE toàn 0 mà có người xem thì là chưa đo được', () => {
    assert.ok(!('FB|Trang A|Live#liveFollow' in s), 'ghi 0 là chấm oan');
    assert.strictEqual(dong('FB|Trang A|Live#liveFollow').trangThai, 'thieu');
  });

  console.log('\nngười không đăng bài trên kênh có bài');

  await t('người có bài vẫn ra đúng số', () => {
    assert.strictEqual(s['FB|Trang A|Bài viết|thu#viewQuyDoi'], 5000);
  });

  await t('người không có bài nào ra số 0 thật, không bị loại', () => {
    assert.strictEqual(s['FB|Trang A|Bài viết|ngoc#viewQuyDoi'], 0);
    assert.strictEqual(s['FB|Trang A|Bài viết|ngoc#viewBanHang'], 0);
    assert.strictEqual(dong('FB|Trang A|Bài viết|ngoc#viewQuyDoi').trangThai, 'lay-duoc');
  });

  await t('bài là phiên LIVE không cộng vào view bài viết của kênh', () => {
    assert.strictEqual(s['FB|Trang A|Bài viết#viewQuyDoi'], 5000);
  });

  await t('bài trống tên ở kênh chia đều thì mỗi bạn một phần ba', () => {
    assert.strictEqual(s['Tiktok|Rooty Trip Phú Quốc|Bài viết|hang#viewBanHang'], 1000);
  });

  await t('số video của Khánh: task Edit Video hoàn thành, đến hạn trong tháng, đúng người', () => {
    assert.strictEqual(s['CongViec|Edit Video|Việc|khanh#viecXong'], 2);
  });

  await t('LIVE TikTok đọc được từ bảng theo ngày (tệp LIVE Center)', () => {
    assert.strictEqual(s['Tiktok|Trang C|Live#liveView'], 1000);
    assert.strictEqual(s['Tiktok|Trang C|Live#liveFollow'], 10);
  });

  await t('chỉnh ảnh của Trường: % lô Đạt trên lô đã nghiệm thu, chỉ của Trường', () => {
    assert.strictEqual(s['ChinhAnh|Rooty Trip Phú Quốc|Lô|truong#tyLeDat'], 90);
  });

  may.close();

  console.log('\nđổ số lần sau');

  /* Chặn Base và chặn ghi tệp: phép thử không được đụng sua-tay.json của máy. */
  const nap = Module._load;
  Module._load = function (yc) {
    if (yc === './lark') return { listAll: async () => [], createMany: async () => [], updateMany: async () => 0 };
    return nap.apply(this, arguments);
  };
  const store = require('../store');
  Module._load = nap;
  const ghiThat = fs.writeFileSync;
  const taoThat = fs.mkdirSync;
  fs.writeFileSync = () => {};
  fs.mkdirSync = () => {};
  try {
    const TH = '2099-07';
    store.luuLuat(TH, { nhom: [], nguoi: [] });
    const soCua = () => store.thang(TH).soLieu;
    await t('ô nguồn báo chưa đo được thì số cũ bị bỏ, ô khác giữ nguyên', () => {
      store.luuSoLieu(TH, { 'a#follow': 0, 'a#view': 100 }, 'app');
      store.luuSoLieu(TH, { 'a#view': 120 }, 'app', ['a#follow']);
      const sl = soCua();
      assert.ok(!('a#follow' in sl), 'con 0 cũ vẫn còn: ' + sl['a#follow']);
      assert.strictEqual(sl['a#view'], 120);
    });

    await t('không truyền danh sách bỏ thì gộp đè như cũ', () => {
      store.luuSoLieu(TH, { 'b#x': 5 }, 'file');
      store.luuSoLieu(TH, { 'a#view': 130 }, 'app');
      assert.strictEqual(soCua()['b#x'], 5);
    });

    await t('đổ số từ app không xoá ô chỉ vào được bằng tải tệp', () => {
      const src = fs.readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8');
      const than = src.slice(src.indexOf("p === '/api/dong-bo'"), src.indexOf("p === '/api/tai-file'"));
      assert.match(than, /x\.trangThai === 'thieu' && x\.cach !== 'file'/,
        'app lỗi (loi) hay ô tải tệp (file) mà bị xoá là mất số thật');
    });
  } finally {
    fs.writeFileSync = ghiThat;
    fs.mkdirSync = taoThat;
  }

  console.log('\n' + so + ' phép thử đạt' + (process.exitCode ? ' — CÓ LỖI' : '') + '\n');
})().catch((e) => { console.error('LỖI:', e.message); process.exit(1); });
