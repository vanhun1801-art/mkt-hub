'use strict';
/**
 * ============================================================================
 * ĐỒNG HỒ NHỊP GỌI LARK — một hạn mức, mười hai app con
 * ============================================================================
 * Lark tính hạn mức theo APP, mà cả phòng chỉ còn MỘT app Lark dùng chung cho
 * mười hai app con. Ngày 25/09/2026 lúc 11:21, Lịch tác nghiệp và KOL cùng báo
 * 99991400 trong cùng một phút — không app nào gọi quá tay, chúng cộng lại mới
 * quá.
 *
 * Phép thử này canh ba điều, theo đúng thứ tự quan trọng:
 *   1. Gộp lại KHÔNG vượt hạn mức — đó là lý do có cả cái luồng này.
 *   2. Hub hỏng thì app con vẫn gọi được — thà dính 99991400 rồi thử lại còn
 *      hơn treo việc vì một cái đồng hồ đếm nhịp.
 *   3. Chờ quá lâu thì cho đi luôn — không để ai đứng chờ hàng chục giây.
 *
 * Chạy: node test/nhip.test.js
 */
const http = require('http');
const path = require('path');
const nhip = require('../nhip');

let pass = 0;
let fail = 0;
const ok = (dieu, ten) => {
  if (dieu) { pass += 1; console.log('  PASS ' + ten); }
  else { fail += 1; console.log('  FAIL ' + ten); }
};

(async () => {
  console.log('\nđồng hồ nhịp gọi Lark');

  /* ---------------- phần tính toán ---------------- */
  nhip.datLai();
  const t0 = 1000000;
  const dau = nhip.xin(t0);
  ok(dau.cho === 0 && !dau.tran, 'lúc rảnh thì đi ngay, không chờ');

  nhip.datLai();
  /* Xin dồn 30 lượt trong cùng một tích tắc — giống lúc vài app cùng nạp Base. */
  const cho = [];
  for (let i = 0; i < 30; i += 1) cho.push(nhip.xin(t0).cho);
  const tre = cho[cho.length - 1];
  ok(cho[0] === 0, 'lượt đầu vẫn đi ngay');
  ok(tre > 0, 'lượt sau bị giãn ra (' + Math.round(tre) + 'ms)');
  /* Điều cốt lõi: trong bất kỳ một giây nào cũng không quá QPS lời gọi. */
  const trongGiayDau = cho.filter((x) => x < 1000).length;
  ok(trongGiayDau <= nhip.QPS,
    'giây đầu chỉ cho ' + trongGiayDau + ' lượt, không quá hạn mức ' + nhip.QPS);
  ok(cho.every((x, i) => i === 0 || x >= cho[i - 1]),
    'đến trước được trước, không ai chen ngang');

  nhip.datLai();
  /* Lúc rảnh, mốc phải lùi về hiện tại chứ không tích luỹ lượt ảo — nếu không
     thì nghỉ một phút xong sẽ xả được cả trăm lời gọi một lúc. */
  nhip.xin(t0);
  ok(nhip.xin(t0 + 60000).cho === 0, 'nghỉ lâu rồi quay lại thì không tích luỹ lượt ảo');

  nhip.datLai();
  /* Xin thật nhiều để vượt trần chờ. */
  let coTran = false;
  let nhichThem = false;
  for (let i = 0; i < 5000; i += 1) {
    const r = nhip.xin(t0);
    if (r.tran) {
      coTran = true;
      /* Người quá trần KHÔNG giữ chỗ: xin tiếp vẫn phải quá trần, chứ mốc
         không được nhích thêm vì một lượt đã bỏ hàng. */
      const sau = nhip.xin(t0);
      nhichThem = !sau.tran;
      break;
    }
  }
  ok(coTran, 'chờ quá trần thì trả "đi đi" thay vì bắt đứng chờ');
  ok(!nhichThem, 'lượt bỏ hàng không đẩy lùi người xin sau');

  const tt = nhip.tinhTrang();
  ok(tt.tong > 0 && tt.qps === nhip.QPS, 'có số liệu để trang Kiểm tra hệ thống soi');

  /* ---------------- phía app con, qua HTTP thật ---------------- */
  const KHOA = 'khoa-kiem-thu';
  nhip.datLai();
  const may = http.createServer((req, res) => {
    if (req.url !== '/_noi-bo/nhip' || req.headers['x-hub-khoa'] !== KHOA) {
      res.writeHead(404); return res.end();
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(nhip.xin()));
  });
  await new Promise((r) => may.listen(0, '127.0.0.1', r));
  const cong = may.address().port;

  const nap = (env) => {
    const p = require.resolve('../../lark-chung/nhip-lark');
    delete require.cache[p];
    const cu = { ...process.env };
    Object.assign(process.env, env);
    const m = require(p);
    process.env = cu;
    return m;
  };

  const khach = nap({
    HUB_NHIP_URL: 'http://127.0.0.1:' + cong + '/_noi-bo/nhip',
    HUB_KHOA_NOI_BO: KHOA,
  });

  ok(khach.bat(), 'app con thấy hub thì bật');
  ok(khach.thuocHanMuc('open.larksuite.com'), 'Lark thì phải xin lượt');
  ok(!khach.thuocHanMuc('graph.facebook.com'), 'Facebook thì không — hạn mức khác');
  ok(await khach.xinLuot('graph.facebook.com') === 0, 'và không tốn một lượt hỏi nào');

  /* Mười hai app con cùng xin một lúc, đúng cảnh 11:21 ngày 25/09. */
  const batDau = Date.now();
  const daCho = await Promise.all(
    Array.from({ length: 12 }, () => khach.xinLuot('open.larksuite.com')),
  );
  const troi = Date.now() - batDau;
  ok(daCho.filter((x) => x > 0).length >= 1, 'có app bị giãn ra thật (' + daCho.filter((x) => x > 0).length + '/12)');
  ok(troi >= (11 / nhip.QPS) * 1000 - 120,
    'mười hai lượt trải ra ít nhất ' + Math.round((11 / nhip.QPS) * 1000) + 'ms (thật: ' + troi + 'ms)');

  may.close();

  /* ---------------- hub hỏng thì app con vẫn phải chạy ---------------- */
  const hong = nap({
    HUB_NHIP_URL: 'http://127.0.0.1:1/_noi-bo/nhip',   // cổng không ai nghe
    HUB_KHOA_NOI_BO: KHOA,
    HUB_NHIP_HAN_HOI: '80',
  });
  const t1 = Date.now();
  const r1 = await hong.xinLuot('open.larksuite.com');
  ok(r1 === 0 && Date.now() - t1 < 1500, 'hub chết thì cho đi ngay, không treo việc');
  /* Hỏng mấy lần liên tiếp thì nghỉ hỏi — không thì hub sập biến thành mọi lời
     gọi Lark phải chờ hết hạn một lần nữa. */
  await hong.xinLuot('open.larksuite.com');
  await hong.xinLuot('open.larksuite.com');
  const t2 = Date.now();
  await hong.xinLuot('open.larksuite.com');
  ok(Date.now() - t2 < 30, 'hỏng liên tiếp thì nghỉ hỏi, không cộng thêm độ trễ nữa');

  const tat = nap({ HUB_NHIP_URL: '', HUB_KHOA_NOI_BO: '' });
  ok(!tat.bat() && await tat.xinLuot('open.larksuite.com') === 0,
    'chạy dưới máy (không có hub) thì im hẳn');

  /* ---------------- đường HTTP của hub ---------------- */
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'bao-loi-api.js'), 'utf8');
  ok(src.includes("'/_noi-bo/nhip'"), 'hub có mở đường xin lượt');
  ok(src.includes('HUB_NHIP_URL'), 'và có báo địa chỉ đó cho app con');
  const canhSrc = require('fs').readFileSync(
    path.join(__dirname, '..', '..', 'lark-chung', 'canh-api.js'), 'utf8');
  ok(canhSrc.includes('nhip.xinLuot(u.hostname)'),
    'bộ bọc fetch THẬT SỰ xin lượt — khai mà không gọi thì cả luồng này vô nghĩa');

  console.log('\n' + pass + ' pass · ' + fail + ' fail\n');
  process.exitCode = fail ? 1 : 0;
})();
