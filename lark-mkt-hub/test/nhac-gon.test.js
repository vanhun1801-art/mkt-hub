'use strict';
/**
 * Luật nhắc gọn (06/11/2026). Anh Hùng: "chỉ nhắc cần thiết thôi".
 *
 *   1. lark-chung/nhac-gon.js nhớ "đã báo" trên Base, nên deploy lại không báo lại.
 *      Chiều 06/11 thẻ "Đồng bộ quảng cáo có vấn đề" đến 3 lần, mỗi lần sau một deploy.
 *   2. Thẻ lỗi API chỉ báo lỗi hỏng thật (hết khoá, mất quyền), mỗi lỗi tối đa một
 *      thẻ một ngày. Gọi quá dày (429) chiều 06/11 nổ khoảng 8 thẻ: không nhắn nữa.
 *   3. Nhắc lần 2 có giới hạn: báo, quá hạn thì nhắc đúng một lần nữa, rồi thôi.
 *
 * Không chạm Lark: bảng Base là bản giả trong bộ nhớ.
 * Chạy: node test/nhac-gon.test.js
 */
const path = require('path');

let pass = 0, fail = 0;
/* in thẳng ra stdout: đoạn thử thẻ lỗi API tạm bịt console.log của bao-loi-api */
const ok = (dieu, ten) => { if (dieu) { pass++; process.stdout.write('  ✓ ' + ten + '\n'); } else { fail++; process.stdout.write('  ✗ ' + ten + '\n'); } };

function bangGia() {
  const dong = [];
  let id = 0;
  return {
    dong,
    async docHet() { return dong.map((d) => ({ ...d })); },
    async tao(o) { const r = { ...o, recordId: 'rec' + (++id) }; dong.push(r); return r.recordId; },
    async ghi(rid, o) { const r = dong.find((d) => d.recordId === rid); Object.assign(r, o); return rid; },
    async xoa(rid) { const i = dong.findIndex((d) => d.recordId === rid); if (i >= 0) dong.splice(i, 1); },
  };
}

(async () => {
  const nhacGon = require(path.join(__dirname, '..', '..', 'lark-chung', 'nhac-gon'));
  const GIO = 3600e3;

  console.log('\nnhớ trên Base: tiến trình mới (sau deploy) vẫn biết đã báo');
  {
    let t = Date.parse('2026-11-06T04:49:00Z');
    const bang = bangGia();
    const a = nhacGon.tao({ bang, bayGio: () => t });
    ok(await a.nenBao('qc:du-lieu:Google Ads', 12 * GIO), 'chưa báo lần nào thì báo');
    await a.ghi('qc:du-lieu:Google Ads');
    ok(bang.dong.length === 1 && bang.dong[0]['Ô'] === 'da-bao:qc:du-lieu:Google Ads', 'ghi một dòng da-bao:<khoá> lên bảng kho');
    t += 70 * 60e3;                                       // 12:59, vừa deploy xong
    const b = nhacGon.tao({ bang, bayGio: () => t });
    ok(!(await b.nenBao('qc:du-lieu:Google Ads', 12 * GIO)), 'tiến trình mới không báo lại trong 12 giờ');
    t += 12 * GIO;
    const c = nhacGon.tao({ bang, bayGio: () => t });
    ok(await c.nenBao('qc:du-lieu:Google Ads', 12 * GIO), 'quá 12 giờ thì được nhắc lại');
    await c.ghi('qc:du-lieu:Google Ads');
    ok(bang.dong.length === 1, 'nhắc lại thì sửa dòng cũ, không đẻ dòng mới');
    ok((await c.danhSach('qc:')).length === 1, 'danhSach lọc theo tiền tố');
    await c.quen('qc:du-lieu:Google Ads');
    ok(bang.dong.length === 0, 'hết sự cố thì quên: xoá dòng');
  }

  console.log('\nnhắc lần 2 có giới hạn');
  {
    let t = 0;
    const n = nhacGon.tao({ bang: null, bayGio: () => t });
    ok(await n.buocNhac('viec:1', 24 * GIO) === 1, 'chưa báo: gửi lần đầu');
    await n.ghi('viec:1', 1);
    t = 5 * GIO;
    ok(await n.buocNhac('viec:1', 24 * GIO) === 0, 'chưa tới hạn: im');
    t = 25 * GIO;
    ok(await n.buocNhac('viec:1', 24 * GIO) === 2, 'quá hạn: nhắc lần 2');
    await n.ghi('viec:1', 2);
    t = 80 * GIO;
    ok(await n.buocNhac('viec:1', 24 * GIO) === 0, 'đã nhắc đủ hai lần: thôi hẳn');
    await n.quen('viec:1');
    ok(await n.buocNhac('viec:1', 24 * GIO) === 1, 'việc mới cùng khoá sau khi quên: lại là lần đầu');
  }

  console.log('\nBase hỏng: vẫn báo lần đầu, không ném');
  {
    const hong = { docHet: async () => { throw new Error('Lark 500'); }, tao: async () => { throw new Error('Lark 500'); }, ghi: async () => {}, xoa: async () => {} };
    const n = nhacGon.tao({ bang: hong });
    const goc = console.error; console.error = () => {};
    try {
      ok(await n.nenBao('x', GIO), 'đọc Base hỏng: coi như chưa báo');
      await n.ghi('x');
      ok(!(await n.nenBao('x', GIO)), 'ghi Base hỏng: vẫn nhớ trong tiến trình');
    } finally { console.error = goc; }
  }

  console.log('\nthẻ lỗi API chỉ báo lỗi hỏng thật, mỗi lỗi một ngày một thẻ');
  {
    const baoLoi = require('../bao-loi-api');
    const daGui = [];
    baoLoi._datGui(async (o) => { daGui.push(o); return { ok: true }; }, async () => [{ nguoi: 'Lê Văn Hùng', openId: 'ou_thu' }]);
    let t = Date.now();
    const bang = bangGia();
    baoLoi._datBoNho(nhacGon.tao({ bang, bayGio: () => t }));
    const goc = console.log; console.log = () => {};
    try {
      const su = (x) => ({ app: 'ads', host: 'business-api.tiktok.com', pt: 'GET', duong: '/report', kieu: 'http', luc: t, ...x });
      baoLoi.nhan(su({ status: 429 }));
      baoLoi.nhan(su({ status: 200, ma: 40100, loi: 'reaches the QPS limit' }));
      baoLoi.nhan(su({ status: 400, ma: 99991400, host: 'open.larksuite.com' }));
      baoLoi.nhan(su({ kieu: 'mang', loi: 'UND_ERR_CONNECT_TIMEOUT' }));
      baoLoi.nhan(su({ status: 503 }));
      await baoLoi._xa();
      ok(daGui.length === 0, 'gọi dày, QPS, 5xx, mạng chập: không nhắn');
      ok(baoLoi.ganDay().length === 5, 'nhưng vẫn ghi vào danh sách gần đây để soi');

      baoLoi.nhan(su({ status: 401, host: 'graph.facebook.com' }));
      baoLoi.nhan(su({ status: 401, host: 'graph.facebook.com' }));
      await baoLoi._xa();
      ok(daGui.length === 1, 'token hỏng: một thẻ cho cả chùm');
      const chu = JSON.stringify(daGui[0].card);
      ok(/cấp lại/.test(chu) && /2 lần/.test(chu), 'thẻ nói việc cần làm và số lần');

      t += 3 * 3600e3;
      baoLoi._datBoNho(nhacGon.tao({ bang, bayGio: () => t }));  // như vừa deploy lại
      baoLoi.nhan(su({ status: 401, host: 'graph.facebook.com' }));
      await baoLoi._xa();
      ok(daGui.length === 1, 'cùng lỗi trong 24 giờ, kể cả sau deploy: im');

      baoLoi.nhan(su({ status: 400, ma: 99991672, host: 'open.larksuite.com' }));
      await baoLoi._xa();
      ok(daGui.length === 2, 'lỗi thiếu quyền khác: báo');
    } finally { console.log = goc; }
  }

  console.log('\ngiám sát quảng cáo: lỗi gọi quá dày không tính là kênh hỏng');
  {
    const { laTamThoi } = require('../../lark-ads-manager/giam-sat');
    ok(laTamThoi('App 7678987984670031892 reaches the QPS limit 10, current QPS is 11.'), 'TikTok QPS');
    ok(laTamThoi('HTTP 429 Too Many Requests'), '429');
    ok(!laTamThoi('The provided client secret is invalid'), 'sai client secret vẫn là hỏng thật');
  }

  console.log('\n' + pass + ' pass · ' + fail + ' fail\n');
  process.exitCode = fail ? 1 : 0;
})();
