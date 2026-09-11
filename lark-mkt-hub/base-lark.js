'use strict';
/**
 * ============================================================================
 * LỚP GỌI LARK BASE — dùng chung cho mọi bảng của hub
 * ============================================================================
 * Trước đây lớp này nằm gọn trong quyen.js và bị đóng đinh vào đúng một bảng
 * (BASE/TABLE là hằng số của tệp đó). Tới lúc hub cần bảng thứ hai — bảng
 * Thông báo — thì chỉ có hai đường: đóng đinh lần nữa ở tệp mới, hoặc tách ra.
 *
 * Tách. Đóng đinh lần nữa nghĩa là hai bản sao của cùng một lớp gọi API: Lark
 * đổi một đầu mối là phải sửa hai chỗ, mà chỗ thứ hai thì không ai nhớ.
 *
 * Hai chế độ, cùng một bộ hàm:
 *
 *   api  — token của app (LARK_APP_ID + LARK_APP_SECRET). Đường của bản deploy.
 *   cli  — phiên lark-cli của máy cá nhân. Không cần khoá app.
 *
 * Mỗi hàm đều đi qua `laApi()` một lần rồi rẽ, nên hai chế độ không bao giờ
 * lệch nhau về cách hiểu dữ liệu — chỉ khác đường truyền.
 */
const os = require('os');
const fsn = require('fs');
const pathn = require('path');
const { execFile } = require('child_process');
const cfg = require('./config');

const laApi = () => cfg.mode === 'api';

/* ---------------- token của app ---------------- */
let tokenCache = { value: null, exp: 0 };

async function tenantToken() {
  if (tokenCache.value && Date.now() < tokenCache.exp) return tokenCache.value;
  if (!cfg.appId || !cfg.appSecret) throw new Error('Thiếu LARK_APP_ID / LARK_APP_SECRET');
  const r = await fetch(cfg.apiHost + '/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: cfg.appId, app_secret: cfg.appSecret }),
  });
  const d = await r.json();
  if (d.code !== 0) throw new Error('Lấy tenant_access_token thất bại: ' + (d.msg || d.code));
  tokenCache = {
    value: d.tenant_access_token,
    exp: Date.now() + Math.max(60, (d.expire || 7200) - 300) * 1000,
  };
  return tokenCache.value;
}

/* ---------------- lark-cli ---------------- */
/** Tìm entry script của lark-cli — gọi bằng node để tránh chuyện .cmd trên Windows. */
function timLarkCli() {
  if (process.env.LARK_CLI_SCRIPT) return process.env.LARK_CLI_SCRIPT;
  const rel = pathn.join('node_modules', '@larksuite', 'cli', 'scripts', 'run.js');
  const goc = [
    pathn.join(process.env.APPDATA || pathn.join(os.homedir(), 'AppData', 'Roaming'), 'npm'),
    pathn.join(os.homedir(), 'AppData', 'Roaming', 'npm'),
    '/usr/local/lib',
    '/usr/lib',
  ];
  for (const r of goc) {
    const p = pathn.join(r, rel);
    if (fsn.existsSync(p)) return p;
  }
  return null;
}

function cli(args) {
  return new Promise((resolve, reject) => {
    const script = timLarkCli();
    if (!script) {
      return reject(new Error('Máy này chưa có lark-cli (npm i -g @larksuite/cli), ' +
        'hoặc chạy chế độ api bằng LARK_APP_ID + LARK_APP_SECRET.'));
    }
    execFile(process.execPath, [script, ...args],
      { timeout: 60000, maxBuffer: 32 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        const raw = String(stdout || '').trim();
        let j = null;
        const s = raw.indexOf('{');
        const e = raw.lastIndexOf('}');
        if (s >= 0 && e > s) { try { j = JSON.parse(raw.slice(s, e + 1)); } catch (_) {} }
        if (j && j.ok === false) {
          const m = (j.error && (j.error.message || j.error.hint)) || j.message || 'lark-cli lỗi';
          return reject(new Error(String(m).slice(0, 200)));
        }
        if (err && !j) return reject(new Error(String(err.message || err).slice(0, 200)));
        resolve((j && j.data) || j || {});
      });
  });
}

/* ---------------- một bảng cụ thể ---------------- */

/**
 * Bộ hàm cho đúng một bảng. Gọi `bang(baseToken, tableId)` rồi dùng.
 *
 * Bộ đệm tên cột giữ RIÊNG cho từng bảng: dùng chung một biến thì bảng thứ hai
 * sẽ nhận danh sách cột của bảng thứ nhất, rồi mọi ô ghi đều bị lọc sạch vì
 * "cột không tồn tại" — im lặng và rất khó lần ra.
 */
function bang(baseToken, tableId) {
  const cliArgs = () => ['--base-token', baseToken, '--table-id', tableId,
    '--as', process.env.LARK_AS || 'user', '--format', 'json'];

  const url = (duoi) => cfg.apiHost + '/open-apis/base/v3/bases/' + baseToken +
    '/tables/' + tableId + duoi;

  async function goi(method, duoi, body) {
    const token = await tenantToken();
    const r = await fetch(url(duoi), {
      method,
      headers: Object.assign({ Authorization: 'Bearer ' + token },
        body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json();
    if (d.code !== 0) {
      const e = new Error('Lark API ' + d.code + ': ' + (d.msg || 'lỗi không rõ'));
      e.code = d.code;
      throw e;
    }
    return d.data || {};
  }

  let mapCot = { at: 0, theoId: null };

  /** id cột -> tên cột. Base trả bản ghi theo id, mà code đọc theo tên cho dễ hiểu. */
  async function tenCot() {
    if (mapCot.theoId && Date.now() - mapCot.at < 5 * 60000) return mapCot.theoId;
    const d = laApi() ? await goi('GET', '/fields?limit=100&offset=0')
                      : await cli(['base', '+field-list', ...cliArgs()]);
    const ds = d.fields || d.items || [];
    const theoId = {};
    ds.forEach((f) => { theoId[f.field_id || f.id] = f.field_name || f.name; });
    mapCot = { at: Date.now(), theoId };
    return theoId;
  }

  /** Base trả dạng cột -> đổi về từng bản ghi, khoá là TÊN cột cho dễ đọc. */
  function doiHang(fieldIds, ids, rows) {
    return rows.map((row, i) => {
      const o = { recordId: ids[i] };
      fieldIds.forEach((ten, j) => { o[ten] = row[j]; });
      return o;
    });
  }

  /** Mọi bản ghi của bảng, tối đa 10 trang (2000 dòng). */
  async function docHet() {
    const theoId = await tenCot();
    const out = [];
    let offset = 0;
    for (let trang = 0; trang < 10; trang++) {
      const d = laApi()
        ? await goi('GET', '/records?limit=200&offset=' + offset)
        : await cli(['base', '+record-list', ...cliArgs(), '--limit', '200', '--offset', String(offset)]);
      const ten = (d.field_id_list || []).map((id) => theoId[id] || id);
      out.push(...doiHang(ten, d.record_id_list || [], d.data || []));
      if (!d.has_more) break;
      offset += 200;
    }
    return out;
  }

  /**
   * Lọc bỏ những ô trỏ vào cột KHÔNG tồn tại trên bảng.
   *
   * Ghi vào cột không có là Lark trả lỗi và mất luôn cả bản ghi. Nên bỏ ô đó
   * ra, và nói thẳng cột nào bị bỏ — im lặng thì dữ liệu mất mà không ai biết.
   */
  async function locCotThat(cells, nhan) {
    try {
      const co = new Set(Object.values(await tenCot()));
      for (const ten of Object.keys(cells)) {
        if (!co.has(ten)) {
          delete cells[ten];
          console.warn('  [' + (nhan || tableId) + '] bảng chưa có cột "' + ten +
            '" — bỏ qua ô này khi ghi.');
        }
      }
    } catch (_) { /* không đọc được danh sách cột thì cứ ghi như cũ */ }
    return cells;
  }

  async function ghi(recordId, cells) {
    const body = { update_records: { [recordId]: cells } };
    if (laApi()) await goi('POST', '/records/batch_update', body);
    else await cli(['base', '+record-batch-update', ...cliArgs(), '--json', JSON.stringify(body)]);
    return recordId;
  }

  async function tao(cells) {
    const ten = Object.keys(cells);
    const body = { fields: ten, rows: [ten.map((n) => cells[n])] };
    const d = laApi()
      ? await goi('POST', '/records/batch_create', body)
      : await cli(['base', '+record-batch-create', ...cliArgs(), '--json', JSON.stringify(body)]);
    return (d.record_id_list || [])[0] || null;
  }

  async function xoa(recordId) {
    const body = { record_id_list: [recordId] };
    if (laApi()) return void await goi('POST', '/records/batch_delete', body);
    /* Tên lệnh của lark-cli là `+record-delete`, KHÔNG phải
     * `+record-batch-delete` (tên đó không tồn tại). Bản cũ gọi sai tên nên xoá
     * bản ghi ở chế độ cli chưa bao giờ chạy — kể cả xoá một dòng phân quyền
     * trên máy cá nhân. Trên Render thì không lộ ra vì đường api đi lối khác.
     *
     * `--yes` là bắt buộc: lark-cli xếp xoá vào nhóm high-risk-write. Người bấm
     * nút Xoá trong panel chính là bước xác nhận đó. */
    await cli(['base', '+record-delete', ...cliArgs(),
      '--json', JSON.stringify(body), '--yes']);
  }

  const larkUrl = 'https://rootytrip2.sg.larksuite.com/base/' + baseToken + '?table=' + tableId;

  return { goi, cli, cliArgs, tenCot, docHet, locCotThat, ghi, tao, xoa, larkUrl };
}

module.exports = { laApi, tenantToken, timLarkCli, cli, bang };
