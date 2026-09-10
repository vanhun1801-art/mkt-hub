'use strict';
/* `node test/tin-app.test.js` — kiểm tầng gửi tin bằng danh tính app, KHÔNG gọi mạng.
 *
 * Thay `fetch` bằng bản giả để bắt đúng thứ dễ hỏng câm: gửi cho một NGƯỜI thì
 * receive_id_type phải là open_id, gửi vào NHÓM thì phải là chat_id. Sai một chữ
 * là Lark trả "receive_id invalid" và không ai hiểu vì sao — mà lỗi này chỉ hiện
 * khi gửi thật, tức là lúc đã muộn. */
const assert = require('assert');

const cfg = require('../config');
const tinApp = require('../tin-app');

let so = 0;
const ta = async (ten, fn) => {
  try { await fn(); so++; console.log('  ✓ ' + ten); }
  catch (e) { console.error('  ✗ ' + ten + '\n    ' + e.message); process.exitCode = 1; }
};

/* tin-app chỉ chạy khi đã khai App ID + Secret. Máy chưa khai thì bỏ qua phần
 * gọi, nhưng vẫn kiểm được nguoiGui() ở dưới. */
const fetchThat = global.fetch;

/** Bắt mọi lời gọi fetch; trả token giả rồi trả `dap` cho lời gọi gửi tin. */
function gia(dap) {
  const daGoi = [];
  global.fetch = async (url, opt) => {
    daGoi.push({ url: String(url), body: JSON.parse(opt.body) });
    if (String(url).includes('tenant_access_token')) {
      return { json: async () => ({ code: 0, tenant_access_token: 'tk-gia', expire: 7200 }) };
    }
    return { json: async () => dap };
  };
  return daGoi;
}

async function chay() {
  const idCu = cfg.tinAppId;
  const secretCu = cfg.tinAppSecret;
  cfg.tinAppId = 'cli_gia';
  cfg.tinAppSecret = 'secret-gia';

  console.log('\ngửi bằng danh tính app (fetch giả)');

  await ta('gửi cho một NGƯỜI thì receive_id_type = open_id', async () => {
    tinApp.xoaToken();
    const goi = gia({ code: 0, data: { message_id: 'om_1' } });
    const r = await tinApp.gui({ userId: 'ou_abc', text: 'chào' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.msgId, 'om_1');
    const g = goi.find((x) => x.url.includes('/im/v1/messages'));
    assert.ok(g.url.includes('receive_id_type=open_id'), g.url);
    assert.strictEqual(g.body.receive_id, 'ou_abc');
  });

  await ta('gửi vào NHÓM thì receive_id_type = chat_id', async () => {
    tinApp.xoaToken();
    const goi = gia({ code: 0, data: { message_id: 'om_2' } });
    await tinApp.gui({ chatId: 'oc_xyz', text: 'chào' });
    const g = goi.find((x) => x.url.includes('/im/v1/messages'));
    assert.ok(g.url.includes('receive_id_type=chat_id'), g.url);
    assert.strictEqual(g.body.receive_id, 'oc_xyz');
  });

  await ta('có thẻ thì msg_type = interactive, không thì text', async () => {
    tinApp.xoaToken();
    let goi = gia({ code: 0, data: {} });
    await tinApp.gui({ chatId: 'oc_1', card: { header: {} }, text: 'lùi' });
    assert.strictEqual(goi.find((x) => x.body.msg_type).body.msg_type, 'interactive');

    tinApp.xoaToken();
    goi = gia({ code: 0, data: {} });
    await tinApp.gui({ chatId: 'oc_1', text: 'chỉ chữ' });
    const g = goi.find((x) => x.body.msg_type);
    assert.strictEqual(g.body.msg_type, 'text');
    assert.strictEqual(JSON.parse(g.body.content).text, 'chỉ chữ');
  });

  await ta('khoá chống trùng đi vào trường uuid của Lark', async () => {
    tinApp.xoaToken();
    const goi = gia({ code: 0, data: {} });
    await tinApp.gui({ chatId: 'oc_1', text: 'x', khoa: 'bc-abc-123' });
    assert.strictEqual(goi.find((x) => x.body.uuid).body.uuid, 'bc-abc-123');
  });

  await ta('230002 được dịch thành "bot chưa ở trong hội thoại", không phải mã trần', async () => {
    tinApp.xoaToken();
    gia({ code: 230002, msg: 'Bot can NOT be out of the chat' });
    const r = await tinApp.gui({ chatId: 'oc_1', text: 'x' });
    assert.strictEqual(r.ok, false);
    assert.ok(/chưa ở trong hội thoại/.test(r.loi), r.loi);
    assert.ok(r.loi.includes('cli_gia'), 'phải nói rõ App ID nào');
  });

  await ta('99991672 nói rõ là thiếu scope hoặc chưa phát hành version', async () => {
    tinApp.xoaToken();
    gia({ code: 99991672, msg: 'access denied' });
    const r = await tinApp.gui({ chatId: 'oc_1', text: 'x' });
    assert.ok(/im:message/.test(r.loi), r.loi);
    assert.ok(/phát hành/.test(r.loi), r.loi);
  });

  await ta('KHÔNG BAO GIỜ throw — báo cáo đã ghi Base thì tin nhắn không được làm vỡ', async () => {
    tinApp.xoaToken();
    global.fetch = async () => { throw new Error('mạng chết'); };
    const r = await tinApp.gui({ chatId: 'oc_1', text: 'x' });
    assert.strictEqual(r.ok, false);
    assert.ok(/mạng chết/.test(r.loi));
  });

  await ta('token hết hạn (99991663) thì lấy token mới và thử lại ĐÚNG một lần', async () => {
    tinApp.xoaToken();
    const daGoi = [];
    let lan = 0;
    global.fetch = async (url, opt) => {
      daGoi.push(String(url));
      if (String(url).includes('tenant_access_token')) {
        return { json: async () => ({ code: 0, tenant_access_token: 'tk' + (++lan), expire: 7200 }) };
      }
      const soLanGui = daGoi.filter((x) => x.includes('/im/v1/messages')).length;
      return { json: async () => (soLanGui === 1
        ? { code: 99991663, msg: 'token expired' }
        : { code: 0, data: { message_id: 'om_lai' } }) };
    };
    const r = await tinApp.gui({ chatId: 'oc_1', text: 'x' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.msgId, 'om_lai');
    assert.strictEqual(daGoi.filter((x) => x.includes('/im/v1/messages')).length, 2,
      'phải gửi lại đúng 1 lần, không nhiều hơn');
    assert.strictEqual(daGoi.filter((x) => x.includes('tenant_access_token')).length, 2,
      'phải xin token mới trước khi thử lại');
  });

  global.fetch = fetchThat;
  cfg.tinAppId = idCu;
  cfg.tinAppSecret = secretCu;

  console.log('\nchế độ api (bản online) — server gửi bằng bot NÀO');

  await ta('trên server, tin vẫn đi qua Marketing Hub chứ không phải app nền tảng', async () => {
    /* Đây là rủi ro lớn nhất của bản deploy: chế độ api có sẵn tenant token của
     * LARK_APP_ID (app "Tracking"), nên rất dễ vô tình gửi bằng bot đó. Nhóm sẽ
     * thấy hai người gửi khác nhau tuỳ app chạy ở máy hay trên server, và phải mời
     * hai bot vào nhóm. Chốt lại: tinAppId khác appId thì PHẢI đi qua tin-app. */
    const modeCu = cfg.mode;
    const appIdCu = cfg.appId;
    const idCu2 = cfg.tinAppId;
    const secretCu2 = cfg.tinAppSecret;
    try {
      cfg.mode = 'api';
      cfg.appId = 'cli_aa04305ecd385ed1';          // Tracking — app nền tảng khi deploy
      cfg.tinAppId = 'cli_aa1a8ae21a78ded2';       // Marketing Hub — app đứng tên gửi
      cfg.tinAppSecret = 'secret-gia';

      delete require.cache[require.resolve('../larkapi')];
      const larkapi = require('../larkapi');
      tinApp.xoaToken();
      const goi = gia({ code: 0, data: { message_id: 'om_api' } });
      const r = await larkapi.guiTin({ chatId: 'oc_1', text: 'x' });
      assert.strictEqual(r.ok, true);
      const xinToken = goi.find((x) => x.url.includes('tenant_access_token'));
      assert.strictEqual(xinToken.body.app_id, 'cli_aa1a8ae21a78ded2',
        'server đang xin token của app nền tảng, không phải app đứng tên gửi');
    } finally {
      cfg.mode = modeCu;
      cfg.appId = appIdCu;
      cfg.tinAppId = idCu2;
      cfg.tinAppSecret = secretCu2;
      delete require.cache[require.resolve('../larkapi')];
      global.fetch = fetchThat;
    }
  });

  console.log('\nnguoiGui — giao diện phải nói rõ đang gửi bằng bot nào');

  await ta('chưa khai App ID thì báo là đang dùng bot của lark-cli, và nêu bot ĐÁNG LẼ phải dùng', async () => {
    const g = tinApp.nguoiGui();
    if (cfg.tinAppId) {
      assert.strictEqual(g.qua, 'app');
      assert.strictEqual(g.appId, cfg.tinAppId);
    } else {
      assert.strictEqual(g.qua, 'cli');
      assert.strictEqual(g.appId, 'cli_aaeafc646039ded1');
      assert.strictEqual(g.nen.ten, cfg.tinAppTen, 'phải nêu tên bot đáng lẽ phải dùng');
    }
  });

  console.log('\n' + so + ' phép thử đạt' + (process.exitCode ? ' — CÓ LỖI' : '') + '\n');
}

chay();
