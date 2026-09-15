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

/**
 * Ô đính kèm của Base -> [{token, ten, kieu, co}].
 *
 * Base trả mảng object; tên khoá khác nhau giữa các đường đọc (file_token hay
 * token, name hay file_name), nên nhận hết. Ô trống trả mảng rỗng.
 */
function docOTep(v) {
  if (!Array.isArray(v)) return [];
  return v.map((x) => ({
    token: (x && (x.file_token || x.token || x.attachmentToken)) || '',
    ten: (x && (x.name || x.file_name)) || 'tệp',
    kieu: (x && (x.type || x.mime_type)) || '',
    co: Number((x && x.size) || 0),
  })).filter((x) => x.token);
}

/* Thư mục tạm cho lark-cli: PHẢI nằm dưới thư mục làm việc hiện tại — lark-cli
 * từ chối mọi đường dẫn trỏ ra ngoài ("unsafe file path"). `.tmp/` đã có trong
 * .gitignore nên không lo lọt lên kho. */
function thuMucTam() {
  const d = pathn.join(process.cwd(), '.tmp');
  fsn.mkdirSync(d, { recursive: true });
  return d;
}

/** Đường dẫn tương đối kiểu ./x/y — dạng duy nhất lark-cli nhận. */
function duongTuongDoi(p) {
  const r = pathn.relative(process.cwd(), p).split(pathn.sep).join('/');
  return r.startsWith('.') ? r : './' + r;
}

/* ---------------- một bảng cụ thể ---------------- */

/**
 * Bộ hàm cho đúng một bảng. Gọi `bang(baseToken, tableId)` rồi dùng.
 *
 * Bộ đệm tên cột giữ RIÊNG cho từng bảng: dùng chung một biến thì bảng thứ hai
 * sẽ nhận danh sách cột của bảng thứ nhất, rồi mọi ô ghi đều bị lọc sạch vì
 * "cột không tồn tại" — im lặng và rất khó lần ra.
 */
function bang(baseToken, tableId, tenCotTep) {
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

  /* ---------------- ô đính kèm ----------------
   * Ô đính kèm KHÔNG ghi được như một ô bình thường: phải đẩy tệp lên trước,
   * lấy token, rồi mới gắn token vào ô. Hai chế độ đi hai đường khác hẳn:
   *
   *   cli — lark-cli có sẵn `base +record-upload-attachment`, nhận đường dẫn
   *         tệp trên đĩa. Máy cá nhân chạy đường này, nên thử được tại chỗ.
   *   api — REST: đẩy tệp vào `drive/v1/medias/upload_all` (parent_type
   *         `bitable_file`, parent_node là token của Base) để lấy file_token,
   *         rồi ghi ô bằng `[{file_token}]`.
   *
   * Đường api KHÔNG thử được ở máy cá nhân: nó cần token của app, mà khoá app
   * chỉ nằm trên Render. Nên mọi lỗi ở đây phải dịch ra việc-phải-làm, đừng ném
   * mã số — lần chạy thật đầu tiên là trên bản deploy.
   */

  /** tên cột -> id cột (cli cần id, không nhận tên). */
  async function idCot() {
    const theoId = await tenCot();
    const nguoc = {};
    Object.keys(theoId).forEach((id) => { nguoc[theoId[id]] = id; });
    return nguoc;
  }

  function dichLoiTep(e) {
    const ma = (e && e.code) || 0;
    const m = String((e && e.message) || e);
    if (ma === 99991672 || /99991672/.test(m)) {
      return new Error('App Marketing Hub chưa có quyền tải tệp lên (scope drive:drive). ' +
        'Thêm scope trong Developer Console rồi phát hành lại một version.');
    }
    if (ma === 91403 || /91403/.test(m)) {
      return new Error('App chưa được chia sẻ Base này nên không đính kèm được.');
    }
    return e instanceof Error ? e : new Error(m);
  }

  /** Đẩy tệp lên Lark, trả về file_token (chỉ chế độ api). */
  async function upMedia(ten, kieu, buf) {
    const token = await tenantToken();
    const bien = '----hub' + Math.random().toString(16).slice(2);
    const o = (n, v) => Buffer.from('--' + bien + '\r\nContent-Disposition: form-data; name="' +
      n + '"\r\n\r\n' + v + '\r\n', 'utf8');
    const than = Buffer.concat([
      o('file_name', ten),
      o('parent_type', 'bitable_file'),
      o('parent_node', baseToken),
      o('size', String(buf.length)),
      Buffer.from('--' + bien + '\r\nContent-Disposition: form-data; name="file"; filename="' +
        ten.replace(/["\\]/g, '_') + '"\r\nContent-Type: ' + (kieu || 'application/octet-stream') +
        '\r\n\r\n', 'utf8'),
      buf,
      Buffer.from('\r\n--' + bien + '--\r\n', 'utf8'),
    ]);
    const r = await fetch(cfg.apiHost + '/open-apis/drive/v1/medias/upload_all', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/form-data; boundary=' + bien },
      body: than,
    });
    const d = await r.json();
    if (d.code !== 0) {
      const e = new Error('Lark API ' + d.code + ': ' + (d.msg || 'lỗi không rõ'));
      e.code = d.code;
      throw dichLoiTep(e);
    }
    return (d.data || {}).file_token || '';
  }

  /**
   * Đính một tệp vào ô đính kèm của một dòng. Trả về danh sách token sau khi gắn.
   * @param {string} recordId
   * @param {string} cot   tên cột đính kèm
   * @param {{ten:string, kieu:string, buf:Buffer}} tep
   */
  async function dinhTep(recordId, cot, tep) {
    if (!recordId) throw new Error('Chưa có dòng để đính kèm — lưu thông báo trước đã.');
    if (laApi()) {
      const token = await upMedia(tep.ten, tep.kieu, tep.buf);
      if (!token) throw new Error('Lark nhận tệp nhưng không trả token.');
      /* Đọc lại ô hiện tại rồi ghi CẢ danh sách: ghi một phần tử là xoá sạch
       * mấy tệp đã đính trước đó. */
      const cu = await docTepCua(recordId, cot);
      const moi = cu.map((x) => ({ file_token: x.token })).concat([{ file_token: token }]);
      await ghi(recordId, { [cot]: moi });
      return token;
    }
    /* cli: cần id cột và một tệp thật trên đĩa. */
    const ids = await idCot();
    const fid = ids[cot];
    if (!fid) throw new Error('Bảng chưa có cột "' + cot + '".');
    /* lark-cli CHỈ nhận --file là đường dẫn TƯƠNG ĐỐI nằm trong thư mục làm
     * việc hiện tại ("unsafe file path" nếu trỏ ra ngoài). Nên tệp tạm phải nằm
     * dưới cwd của tiến trình, không dùng được os.tmpdir(). */
    const thuMuc = fsn.mkdtempSync(pathn.join(thuMucTam(), 'tep-'));
    const duong = pathn.join(thuMuc, tep.ten.replace(/[\\/:*?"<>|]/g, '_'));
    fsn.writeFileSync(duong, tep.buf);
    try {
      await cli(['base', '+record-upload-attachment', ...cliArgs(),
        '--record-id', recordId, '--field-id', fid, '--file', duongTuongDoi(duong)]);
    } finally {
      try { fsn.rmSync(thuMuc, { recursive: true, force: true }); } catch (_) {}
    }
    const sau = await docTepCua(recordId, cot);
    return (sau[sau.length - 1] || {}).token || '';
  }

  /** Danh sách tệp đang đính ở một dòng: [{token, ten, kieu, co}] */
  async function docTepCua(recordId, cot) {
    const dong = (await docHet()).find((x) => x.recordId === recordId);
    return docOTep(dong ? dong[cot] : null);
  }

  /** Gỡ một tệp khỏi ô. */
  async function goTep(recordId, cot, token) {
    const con = (await docTepCua(recordId, cot)).filter((x) => x.token !== token);
    if (laApi()) {
      await ghi(recordId, { [cot]: con.map((x) => ({ file_token: x.token })) });
      return con;
    }
    const ids = await idCot();
    const fid = ids[cot];
    if (!fid) throw new Error('Bảng chưa có cột "' + cot + '".');
    await cli(['base', '+record-remove-attachment', ...cliArgs(),
      '--record-id', recordId, '--field-id', fid, '--file-token', token, '--yes']);
    return con;
  }

  /** Tải một tệp đính kèm về bộ nhớ: { buf, kieu, ten }. */
  /**
   * Tải một tệp đính kèm về bộ nhớ.
   *
   * Chế độ api đi HAI ĐƯỜNG, vì đường thứ nhất có thật sự chạy hay không thì
   * chỉ bản deploy mới biết (máy cá nhân không có khoá app để thử):
   *
   *   1. `medias/{token}/download` — đường thẳng, một lượt gọi.
   *   2. `medias/batch_get_tmp_download_url` — xin một đường dẫn tạm rồi tải
   *      theo đường đó. Đường này KHÔNG cần cùng bộ quyền với đường trên, nên
   *      nó vớt được đúng trường hợp đường 1 bị từ chối.
   *
   * Hỏng cả hai thì ném lỗi KÈM cả hai lý do — bản deploy mà chỉ nói "không tải
   * được" thì không lần ra được đang thiếu quyền gì.
   */
  /**
   * Tải một tệp đính kèm về bộ nhớ.
   *
   * Chế độ api thử BỐN đường, dừng ở đường đầu tiên trả về byte thật. Không
   * phải thừa: đường nào chạy được thì chỉ bản deploy mới biết — máy cá nhân
   * không có khoá app để thử, nên đây là chỗ bó tay nhất của cả app.
   *
   *   1. medias/{token}/download
   *   2. medias/{token}/download + `extra` bitablePerm — ĐÚNG cách Lark đòi cho
   *      tệp nằm trong Base (không có `extra` thì token bị coi là của Drive
   *      thường và bị từ chối). Đây là nghi can số một của lần hỏng vừa rồi.
   *   3. batch_get_tmp_download_url (kèm `extra`) rồi tải theo đường dẫn tạm
   *   4. chính ô trên Base: bản ghi trả kèm `url` / `tmp_url` đã ký sẵn
   *
   * Hỏng cả bốn thì ném lỗi KÈM lý do của TỪNG đường — bản deploy mà chỉ nói
   * "không tải được" thì không lần ra được đang thiếu quyền gì.
   */
  async function taiTep(recordId, token) {
    if (laApi()) {
      const tk = await tenantToken();
      const dau = { Authorization: 'Bearer ' + tk };
      const extra = encodeURIComponent(JSON.stringify({ bitablePerm: { tableId, rev: 0 } }));
      const loi = [];

      /** Đọc một đáp: trả byte nếu là tệp thật, trả null kèm lý do nếu không. */
      const doc = async (nhan, r) => {
        if (!r.ok) {
          let m = 'HTTP ' + r.status;
          try { const j = await r.json(); m = 'Lark ' + j.code + ': ' + (j.msg || ''); } catch (_) {}
          loi.push(nhan + ' → ' + m);
          return null;
        }
        const ct = r.headers.get('content-type') || '';
        const buf = Buffer.from(await r.arrayBuffer());
        /* Lark có đường trả JSON lỗi mà vẫn để mã 200 — nhận ra bằng
         * content-type chứ không tin mỗi mã HTTP. */
        if (/application\/json/.test(ct)) {
          loi.push(nhan + ' → ' + buf.toString('utf8').slice(0, 160));
          return null;
        }
        if (!buf.length) { loi.push(nhan + ' → tệp rỗng'); return null; }
        return { buf, kieu: ct };
      };

      const goiThu = async (nhan, url, headers) => {
        try { return await doc(nhan, await fetch(url, headers ? { headers } : undefined)); }
        catch (e) { loi.push(nhan + ' → ' + String(e.message || e)); return null; }
      };

      const M = cfg.apiHost + '/open-apis/drive/v1/medias/';
      let kq = await goiThu('tải thẳng', M + encodeURIComponent(token) + '/download', dau);
      if (kq) return kq;

      kq = await goiThu('tải thẳng + bitablePerm',
        M + encodeURIComponent(token) + '/download?extra=' + extra, dau);
      if (kq) return kq;

      for (const [nhan, q] of [['đường tạm + bitablePerm', '&extra=' + extra], ['đường tạm', '']]) {
        try {
          const r = await fetch(M + 'batch_get_tmp_download_url?file_tokens=' +
            encodeURIComponent(token) + q, { headers: dau });
          const d = await r.json();
          const mot = ((d.data || {}).tmp_download_urls || [])[0];
          if (d.code === 0 && mot && mot.tmp_download_url) {
            kq = await goiThu(nhan, mot.tmp_download_url);
            if (kq) return kq;
          } else {
            loi.push(nhan + ' → Lark ' + d.code + ': ' + (d.msg || 'không trả đường dẫn tạm'));
          }
        } catch (e) { loi.push(nhan + ' → ' + String(e.message || e)); }
      }

      /* Đường cuối: chính ô trên Base. Bản ghi đọc qua API thường kèm sẵn một
       * đường dẫn đã ký — không cần thêm quyền nào. */
      try {
        const dong = (await docHet()).find((x) => x.recordId === recordId);
        const o = (dong && Array.isArray(dong[tenCotTep]) ? dong[tenCotTep] : [])
          .find((x) => (x.file_token || x.token) === token) || {};
        const url = o.tmp_url || o.url || '';
        if (url) {
          kq = await goiThu('đường dẫn sẵn trong ô', url, dau);
          if (kq) return kq;
          kq = await goiThu('đường dẫn sẵn trong ô (không kèm khoá)', url);
          if (kq) return kq;
        } else {
          loi.push('đường dẫn sẵn trong ô → ô không kèm url');
        }
      } catch (e) { loi.push('đường dẫn sẵn trong ô → ' + String(e.message || e)); }

      const e = new Error('Không tải được tệp đính kèm. ' + loi.join(' · '));
      const het = loi.join(' ');
      if (/99991672/.test(het)) e.code = 99991672;
      if (/91403/.test(het)) e.code = 91403;
      throw dichLoiTep(e);
    }
    const thuMuc = fsn.mkdtempSync(pathn.join(thuMucTam(), 'tai-'));
    try {
      await cli(['base', '+record-download-attachment', ...cliArgs(),
        '--record-id', recordId, '--file-token', token, '--output', duongTuongDoi(thuMuc)]);
      const ten = fsn.readdirSync(thuMuc)[0];
      if (!ten) throw new Error('lark-cli không tải về tệp nào.');
      return { buf: fsn.readFileSync(pathn.join(thuMuc, ten)), kieu: '', ten };
    } finally {
      try { fsn.rmSync(thuMuc, { recursive: true, force: true }); } catch (_) {}
    }
  }

  const larkUrl = 'https://rootytrip2.sg.larksuite.com/base/' + baseToken + '?table=' + tableId;

  return { goi, cli, cliArgs, tenCot, idCot, docHet, locCotThat, ghi, tao, xoa,
    dinhTep, goTep, taiTep, docTepCua, larkUrl };
}

module.exports = { laApi, tenantToken, timLarkCli, cli, bang, docOTep };
