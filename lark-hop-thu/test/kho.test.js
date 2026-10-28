'use strict';
/**
 * Sổ riêng từng người (kho.js) với một bảng Base GIẢ trong bộ nhớ:
 *   - sổ đọc từ Base, ghi lại lên Base (gom lần bấm sát nhau);
 *   - luật, hẹn của bản trước (tệp trên máy) được chép sang sổ mới;
 *   - đọc Base hỏng thì dùng bản trên máy và KHÔNG ghi đè Base;
 *   - hai người không lẫn sổ.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

process.env.HOP_THU_DU_LIEU = fs.mkdtempSync(path.join(os.tmpdir(), 'hop-thu-kho-'));
process.env.HOP_THU_KHO = 'base';

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dk, vi) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; fails.push(ten + (vi ? ' — ' + vi : '')); console.log('  ✗ ' + ten + (vi ? '  ' + vi : '')); }
};
const ngu = (ms) => new Promise((r) => setTimeout(r, ms));

/* Bảng giả: dòng { recordId, 'Ô', 'Tệp': [{ file_token, name }] }, tệp theo token. */
const dong = [];
const tep = new Map();
let soGhi = 0, hong = false;
const bangGia = {
  bl: {
    laApi: () => true,
    docOTep: (v) => (v || []).map((x) => ({ token: x.file_token, ten: x.name })),
  },
  t: {
    docHet: async () => { if (hong) throw new Error('Lark API 800004135'); return dong.map((d) => Object.assign({}, d)); },
    taiTep: async (id, token) => ({ buf: tep.get(token) }),
    tao: async (o) => { const id = 'rec' + (dong.length + 1); dong.push(Object.assign({ recordId: id, 'Tệp': [] }, o)); return id; },
    upMedia: async (ten, kieu, buf) => { const t = 'tok' + (tep.size + 1); tep.set(t, buf); return t; },
    ghi: async (id, o) => { soGhi++; const d = dong.find((x) => x.recordId === id); d['Tệp'] = o['Tệp'].map((x) => ({ file_token: x.file_token, name: 'hop-thu.json.gz' })); },
  },
};

(async () => {
  try {
    /* Bản trước để luật trên máy theo khoá cũ. */
    fs.writeFileSync(path.join(process.env.HOP_THU_DU_LIEU, 'luat.json'), JSON.stringify({ 'a@b.vn': 'biet' }));
    const kho = require('../kho');
    kho._datBang(bangGia);

    console.log('\nNgười mới, chưa có sổ trên Base');
    await kho.nap('u:hung', '');
    ok('chép luật của bản trước sang', kho.luat('u:hung')['a@b.vn'] === 'biet');
    await ngu(1700); await kho._choGhi();
    ok('sổ được đẩy lên Base', dong.length === 1 && soGhi === 1, JSON.stringify(dong));

    console.log('\nBấm nhiều lần sát nhau');
    soGhi = 0;
    kho.datTT('sales@x.vn', 'm1', { xong: true }, 'u:hung');
    kho.datTT('sales@x.vn', 'm2', { sao: true }, 'u:hung');
    kho.datTT('sales@x.vn', 'm2', { daDoc: true }, 'u:hung');
    await ngu(1700); await kho._choGhi();
    ok('gom thành một lần ghi', soGhi === 1, 'ghi ' + soGhi + ' lần');
    const tok = dong[0]['Tệp'][0].file_token;
    const tren = JSON.parse(zlib.gunzipSync(tep.get(tok)).toString('utf8'));
    ok('trên Base có đủ trạng thái', tren.tt['sales@x.vn|m1'].x > 0 && tren.tt['sales@x.vn|m2'].s === 1 && tren.tt['sales@x.vn|m2'].d === 1);

    console.log('\nMáy chủ khởi động lại (Render deploy): đọc lại từ Base');
    kho._quen();
    fs.rmSync(process.env.HOP_THU_DU_LIEU, { recursive: true, force: true });
    await kho.nap('u:hung', '');
    ok('trạng thái còn nguyên', kho.tt('u:hung')['sales@x.vn|m1'].x > 0 && kho.luat('u:hung')['a@b.vn'] === 'biet');

    console.log('\nHai người');
    await kho.nap('u:lan', '');
    ok('chị Lan không thấy sổ anh Hùng', !kho.tt('u:lan')['sales@x.vn|m1'] && !kho.luat('u:lan')['a@b.vn']);

    console.log('\nĐọc Base hỏng');
    kho._quen();
    hong = true; soGhi = 0;
    await kho.nap('u:hung', '');
    kho.datTT('sales@x.vn', 'm9', { xong: true }, 'u:hung');
    await ngu(1700); await kho._choGhi();
    ok('không ghi đè Base bằng bản thiếu', soGhi === 0);
    ok('vẫn dùng được trong lúc chờ', kho.tt('u:hung')['sales@x.vn|m9'].x > 0);
  } catch (e) {
    ok('chạy hết không lỗi', false, e.stack);
  }
  console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
  if (fail) { console.log(fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
  process.exit(0);
})();
