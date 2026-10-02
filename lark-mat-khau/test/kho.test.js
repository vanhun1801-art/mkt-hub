'use strict';
/** Bộ đệm kho: trả bản cũ ngay + đọc nền; quá 10 phút thì chờ; moi=1 luôn đọc tươi. Chạy: node test/kho.test.js */
const path = require('path');
const Module = require('module');
let pass = 0, fail = 0;
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + vi : '')); }
};

process.env.LARK_MODE = 'cli';
let lanDoc = 0;
let ten = 'Bản 1';
const cfg = require('../config');
const lark = {
  listAllRecords: async (t) => {
    if (t === cfg.tkTableId) lanDoc++;
    await new Promise((r) => setTimeout(r, 50));
    return t === cfg.tkTableId ? [{ record_id: 'rec1', cells: { [cfg.f.tk.nenTang]: ten } }] : [];
  },
};
const goc = Module._load;
Module._load = function (req, parent, ...r) {
  if (parent && parent.filename && parent.filename.startsWith(path.join(__dirname, '..')) && /^\.\/lark(api)?$/.test(req)) return lark;
  return goc.call(this, req, parent, ...r);
};
const kho = require('../kho');
const thatNow = Date.now;
let lech = 0;
Date.now = () => thatNow() + lech;

(async () => {
  let d = await kho.tatCa();
  ok('lần đầu đọc Base', lanDoc === 1 && d.tk[0].nenTang === 'Bản 1');
  d = await kho.tatCa();
  ok('trong 60 giây: dùng đệm, không đọc lại', lanDoc === 1);

  ten = 'Bản 2';
  lech = 2 * 60000;
  const t0 = thatNow();
  d = await kho.tatCa();
  ok('quá 60 giây: trả bản CŨ ngay, không chờ Base', d.tk[0].nenTang === 'Bản 1' && thatNow() - t0 < 40, (thatNow() - t0) + 'ms');
  await new Promise((r) => setTimeout(r, 120));
  ok('…và đã đọc mới ở nền', lanDoc === 2);
  d = await kho.tatCa();
  ok('lần sau thấy bản mới', d.tk[0].nenTang === 'Bản 2');

  ten = 'Bản 3';
  lech += 11 * 60000;
  d = await kho.tatCa();
  ok('quá 10 phút: CHỜ đọc mới, không đưa bản quá cũ', d.tk[0].nenTang === 'Bản 3');

  ten = 'Bản 4';
  d = await kho.tatCa({ moi: true });
  ok('moi=1 (sau khi ghi): luôn đọc tươi', d.tk[0].nenTang === 'Bản 4');

  const dem = lanDoc;
  await Promise.all([kho.tatCa({ moi: true }), kho.tatCa({ moi: true }), kho.tatCa({ moi: true })]);
  ok('ba lời gọi cùng lúc chỉ đọc Base một lần', lanDoc === dem + 1, 'đọc ' + (lanDoc - dem) + ' lần');

  Date.now = thatNow;
  console.log('\n' + pass + ' pass · ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
