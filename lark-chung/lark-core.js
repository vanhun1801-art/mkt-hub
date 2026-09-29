'use strict';
/**
 * ============================================================================
 * LÕI GỌI LARK DÙNG CHUNG cho mọi app con — thay cho 13 bản `lark.js` và 12 bản
 * `larkapi.js` từng chép tay rồi trôi khác nhau (khảo sát 2026-09-29, xem
 * docs/hop-nhat-du-lieu.md).
 * ============================================================================
 *
 * Hai CHẾ ĐỘ, một bộ mã:
 *   cli : máy cá nhân — gọi lark-cli bằng phiên đăng nhập của máy.
 *   api : server chung (Render) — gọi Open API bằng tenant_access_token của app.
 *
 * Hai HỌ CHỮ KÝ, vì các app đã viết theo hai kiểu và không đáng bắt chúng đổi:
 *   họ A ("bảng trước"): listAll(tableId), updateRecord(tableId, id, fields)…
 *                        bản ghi dạng { id, c }.
 *                        Dùng ở: Ads manager, Chỉnh ảnh, KPI, Booking OTA, Social.
 *   họ B ("bản ghi trước"): listAllRecords(tableId = mặc định, base),
 *                        updateRecord(id, fields, tableId = mặc định, base)…
 *                        bản ghi dạng { record_id, cells }.
 *                        Dùng ở: Báo cáo, KOL, Lịch làm việc, Lịch tác nghiệp,
 *                        Quỹ chi phí, Sản phẩm, Bảng công việc.
 *
 * Cách dùng trong app (lark.js của app chỉ còn vài dòng):
 *   const cfg = require('./config');
 *   module.exports = require('../lark-chung/lark-core').taoLark(cfg, {
 *     ho: 'B', bangMacDinh: cfg.tableId, thuMuc: __dirname,
 *   });
 *
 * `larkapi.js` của app (test gọi thẳng file này) thì thêm `mode: 'api'`.
 *
 * NGUYÊN TẮC KHI SỬA FILE NÀY: đây là đường đi của MỌI lời gọi Lark trong 12
 * app. Một hành vi đổi ở đây đổi ở tất cả. Những chú thích "vì sao" bên dưới là
 * bài học đã trả giá thật — đừng xoá khi chưa hiểu.
 */
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

/* ---------------------------------------------------------------------------
 * Lỗi tạm thời — thử lại được
 * ------------------------------------------------------------------------- */
/* 800004135 = "OpenAPIListRecord limited": Lark chặn tần suất ĐỌC bản ghi, tính
 * theo CẢ TENANT — 12 app cùng đọc Base lúc hub khởi động là đủ vượt (log
 * 28/09/2026). Thiếu mã này thì app coi là lỗi vĩnh viễn, người dùng nhận thẳng
 * một màn trống kèm câu tiếng Anh, trong khi chỉ cần đợi một nhịp. */
const MA_TAM_THOI = [1254291, 1254036, 99991400, 99991661, 800004135];

const cauLoiMang = /timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|socket hang up|EPIPE|fetch failed|"subtype":\s*"timeout"|"type":\s*"network"/i;

/** Chế độ cli: nhận một Error. */
function loiTamThoiCli(err) {
  const m = String((err && err.message) || '');
  if (MA_TAM_THOI.some((c) => m.includes(String(c)))) return true;
  return cauLoiMang.test(m);
}

/** Chế độ api: nhận (mã Lark, HTTP status). */
function loiTamThoiApi(code, status) {
  return MA_TAM_THOI.includes(code) || status === 429 || (status >= 500 && status < 600);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* LỖI QUÁ NHỊP PHẢI CHỜ KHÁC, VÀ PHẢI CHỜ LỆCH NHAU.
 *
 * 99991400 / 99991661 "request trigger frequency limit": Lark tính hạn mức theo
 * APP, mà cả phòng dùng chung MỘT app Lark cho 12 app con — nên hạn mức ấy là
 * của chung, vài app cùng nạp Base một lúc là đủ vượt. Ngày 25/09 11:21 hai app
 * cùng báo lỗi trong cùng một phút. Hai chỗ phải khác lỗi thường:
 *   · chờ LÂU hơn: hạn mức tính theo giây, 400ms rồi 800ms là chưa qua cửa sổ;
 *   · chờ LỆCH nhau: hai app va nhau rồi cùng lùi 400ms là thử lại cùng tích
 *     tắc và va tiếp — cộng một khoảng ngẫu nhiên là tự tản ra.
 * `e` là lỗi ({ code }) hoặc boolean "có quá nhịp không". Hàm này được
 * lark-mkt-hub/test/qua-nhip.test.js rút ra chạy thử — giữ nguyên dạng. */
const QUA_NHIP = [99991400, 99991661];
const khoangCho = (lan, e) => {
  const quaNhip = typeof e === 'boolean' ? e : QUA_NHIP.includes(e && e.code);
  const goc = (quaNhip ? 1200 : 400) * Math.pow(2, lan);
  return goc + Math.floor(Math.random() * goc);
};

/* ---------------------------------------------------------------------------
 * Chia lô cho thao tác ghi hàng loạt
 * ------------------------------------------------------------------------- */
/* Lark chặn ở 200 bản ghi mỗi lượt. Ở chế độ cli dữ liệu còn đi qua THAM SỐ
 * DÒNG LỆNH, mà Windows chặn khoảng 32 nghìn ký tự: bảng Bài đăng (Social) có
 * caption dài, 200 bài là hơn 100 nghìn ký tự và Node ném `spawn ENAMETOOLONG`
 * — lấy về đủ 525 bài rồi hỏng ở đúng bước ghi. Nên chặn CẢ HAI: số dòng và độ
 * dài JSON. Ngưỡng 24.000 để chừa chỗ cho phần còn lại của dòng lệnh. */
const TRAN_DONG = 200;
const TRAN_JSON = 24000;

function chiaLo(items, doDai, tranJson = TRAN_JSON) {
  const lo = [];
  let hienTai = [];
  let co = 0;
  items.forEach((x) => {
    const n = doDai(x);
    /* Một phần tử tự nó đã quá dài thì vẫn gửi riêng — thà để Lark từ chối một
     * dòng còn hơn im lặng bỏ nó lại. */
    const day = hienTai.length >= TRAN_DONG || (hienTai.length && co + n > tranJson);
    if (day) { lo.push(hienTai); hienTai = []; co = 0; }
    hienTai.push(x);
    co += n;
  });
  if (hienTai.length) lo.push(hienTai);
  return lo;
}

/* ---------------------------------------------------------------------------
 * Hình dạng bản ghi
 * ------------------------------------------------------------------------- */
/** +record-list / GET records trả dạng cột (field_id_list + rows). */
function cotThanhBanGhi(data, ho) {
  const fieldIds = data.field_id_list || [];
  const ids = data.record_id_list || [];
  return (data.data || []).map((row, i) => {
    const o = {};
    fieldIds.forEach((fid, j) => { o[fid] = row[j]; });
    return ho === 'A' ? { id: ids[i], c: o } : { record_id: ids[i], cells: o };
  });
}
const idCua = (r, ho) => (ho === 'A' ? r.id : r.record_id);

/* ---------------------------------------------------------------------------
 * Câu lỗi đọc được (chế độ cli)
 * ------------------------------------------------------------------------- */
/**
 * Rút một câu ĐỌC ĐƯỢC từ lỗi thô của lark-cli. Câu này đi thẳng lên băng thông
 * báo của dashboard; ném nguyên stack trace vào đó thì người vận hành thấy 15
 * dòng "node:internal/modules/cjs/loader" và không biết phải làm gì.
 */
function taoGonLoi(cfg) {
  return function gonLoi(raw) {
    const t = String(raw || '').replace(/\s+/g, ' ').trim();
    if (/MODULE_NOT_FOUND|Cannot find module/.test(t) && /cli|run\.js/i.test(t)) {
      return 'Máy này chưa cài lark-cli (hoặc LARK_CLI_SCRIPT trỏ sai đường dẫn: ' +
        cfg.cliScript + '). Cài lark-cli rồi đăng nhập, hoặc chạy ở chế độ api bằng ' +
        'LARK_APP_ID + LARK_APP_SECRET.';
    }
    if (/token_missing|need_user_authorization|not logged in|chưa đăng nhập|unauthenticated/i.test(t)) {
      return 'Phiên lark-cli của máy chưa đăng nhập hoặc đã hết hạn — chạy `lark-cli auth login` rồi thử lại. ' +
        '(Trên Windows: đừng bật app từ PowerShell quyền Admin, phiên Admin không thấy token của phiên thường.)';
    }
    if (/ENOENT/.test(t) && /node/i.test(t)) {
      return 'Không chạy được lark-cli trên máy này. Kiểm tra lại đường dẫn: ' + cfg.cliScript;
    }
    /* 91403 = Lark từ chối vì quyền. Đọc được mà ghi không được là tình huống
     * RẤT hay gặp với base do người khác dựng: link chia sẻ cho quyền Xem. */
    if (/91403|permission denied|EACCES|don't have permission/i.test(t)) {
      return 'Tài khoản Lark đang dùng KHÔNG có quyền sửa base này (chỉ xem được). ' +
        'Nhờ chủ base mở quyền "Chỉnh sửa" cho tài khoản/ứng dụng đang chạy app.';
    }
    return t.length > 240 ? t.slice(0, 240) + '…' : t;
  };
}

/* ---------------------------------------------------------------------------
 * Lỗi thiếu scope tệp (chế độ api)
 * ------------------------------------------------------------------------- */
/* Lark từ chối vì app chưa được cấp scope tệp thì câu trả về là một danh sách
 * scope tiếng Anh dài — nhân sự đọc không hiểu gì. Đổi thành câu nói rõ phải làm gì. */
const thieuQuyenTep = (msg) => /Access denied/i.test(String(msg || '')) &&
  /scopes? (is|are) required/i.test(String(msg || ''));

function loiThieuQuyen(viec) {
  const e = new Error('App Lark chưa được cấp quyền tệp nên không ' + viec + ' được từ đây. ' +
    'Quản lý cần mở Developer Console, thêm scope drive:drive (hoặc cặp ' +
    'drive:drive:readonly + docs:document.media:upload) rồi phát hành phiên bản mới. ' +
    'Trong lúc chờ, mở bản ghi trong Base để xem/đính tệp trực tiếp.');
  e.code = 'MISSING_SCOPE';
  e.http = 424;
  return e;
}

/* ===========================================================================
 * TẦNG THẤP — chế độ cli
 * ========================================================================= */
function tangCli(cfg, thuMuc) {
  const gonLoi = taoGonLoi(cfg);

  function cliOnce(args, { timeout = 90000, cwd = thuMuc } = {}) {
    return new Promise((resolve, reject) => {
      if (!cfg.cliScript) {
        return reject(new Error('Không tìm thấy lark-cli trên máy này. Cài bằng: npm i -g @larksuite/cli, ' +
          'hoặc chạy chế độ api bằng cách đặt LARK_APP_ID + LARK_APP_SECRET.'));
      }
      execFile(process.execPath, [cfg.cliScript, ...args],
        { timeout, cwd, maxBuffer: 96 * 1024 * 1024, windowsHide: true },
        (err, stdout, stderr) => {
          const raw = (stdout || '').trim();
          let json = null;
          if (raw) {
            const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
            if (s >= 0 && e > s) { try { json = JSON.parse(raw.slice(s, e + 1)); } catch (_) {} }
          }
          if (json && json.ok === false) {
            /* Giữ nguyên JSON lỗi trong câu để loiTamThoiCli còn dò được mã số,
             * rồi mới rút gọn cho người đọc. */
            const goc = json.error?.message || json.message || JSON.stringify(json.error || json);
            const e = new Error(gonLoi(goc) + (String(goc).includes('"code"') ? '' : ' ' + JSON.stringify(json.error || {}).slice(0, 200)));
            e.goc = goc;
            return reject(e);
          }
          if (err && !json) return reject(new Error('lark-cli lỗi: ' + gonLoi(stderr || err.message)));
          if (!json) return reject(new Error('Không parse được phản hồi từ lark-cli'));
          resolve(json.data ?? {});
        });
    });
  }

  /** Gọi lark-cli, tự thử lại khi gặp lỗi tạm thời. */
  async function cli(args, opts = {}) {
    const tries = opts.retries == null ? 3 : opts.retries;
    let last;
    for (let i = 0; i < tries; i++) {
      try { return await cliOnce(args, opts); }
      catch (e) {
        last = e;
        if (i === tries - 1 || !loiTamThoiCli(e)) throw e;
        const m = String(e.message || '') + String(e.goc || '');
        await wait(khoangCho(i, { code: QUA_NHIP.find((c) => m.includes(String(c))) }));
      }
    }
    throw last;
  }

  /** Người đang đăng nhập lark-cli. */
  function whoami() {
    return new Promise((resolve) => {
      if (!cfg.cliScript) return resolve(null);
      execFile(process.execPath, [cfg.cliScript, 'auth', 'status'],
        { timeout: 25000, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
        (err, stdout) => {
          try {
            const raw = String(stdout || '');
            const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
            const u = j.identities && j.identities.user;
            resolve(u && u.openId ? { id: u.openId, name: u.userName || u.openId } : null);
          } catch (_) { resolve(null); }
        });
    });
  }

  const baseArgs = (base) => ['--base-token', base || cfg.baseToken, '--as', cfg.identity || 'user'];
  const B = (t, base) => ['base', ...baseArgs(base), '--table-id', t, '--format', 'json'];

  return {
    mode: 'cli', cli, whoami, gonLoi, isTransient: loiTamThoiCli,

    async docTrang(base, t, offset) {
      return cli(['base', '+record-list', ...baseArgs(base), '--table-id', t,
        '--limit', '200', '--offset', String(offset), '--format', 'json']);
    },
    async docMotTho(base, t, id) {
      return cli(['base', '+record-get', ...baseArgs(base), '--table-id', t, '--record-id', id, '--format', 'json']);
    },
    async docCotTho(base, t, opts) {
      const d = await cli(['base', '+field-list', ...baseArgs(base), '--table-id', t, '--format', 'json'], opts);
      return d.fields || d.items || [];
    },
    async docBangTho(base, opts) {
      const d = await cli(['base', '+table-list', ...baseArgs(base), '--format', 'json'], opts);
      return d.tables || d.items || d.data || [];
    },
    async taoCot(base, t, body) {
      return cli(['base', '+field-create', ...baseArgs(base), '--table-id', t,
        '--json', JSON.stringify(body), '--format', 'json'], { retries: 1 });
    },
    /* +field-update là PUT TOÀN PHẦN; --yes bắt buộc vì lark-cli xếp vào rủi ro cao. */
    async suaCot(base, t, fieldId, def) {
      return cli(['base', '+field-update', ...baseArgs(base), '--table-id', t,
        '--field-id', fieldId, '--json', JSON.stringify(def), '--yes']);
    },
    async taoLo(base, t, names, rows) {
      return cli(['base', '+record-batch-create', ...baseArgs(base), '--table-id', t, '--format', 'json',
        '--json', JSON.stringify({ fields: names, rows })]);
    },
    async suaLo(base, t, update_records) {
      return cli(['base', '+record-batch-update', ...baseArgs(base), '--table-id', t, '--format', 'json',
        '--json', JSON.stringify({ update_records })]);
    },
    async xoa(base, t, ids) {
      return cli(['base', '+record-delete', ...baseArgs(base), '--table-id', t, '--yes', '--format', 'json',
        '--json', JSON.stringify({ record_id_list: ids })]);
    },

    /* ---- tệp đính kèm: lark-cli CHỈ nhận đường dẫn TƯƠNG ĐỐI trong cwd, nên mọi
     * thứ đi qua .tmp/ của thư mục app (đã có trong .gitignore). ---- */
    async taiTepVeThuMuc(base, t, id, fileToken, relDirName) {
      const relDir = './.tmp/' + relDirName;
      const absDir = path.join(thuMuc, '.tmp', relDirName);
      fs.mkdirSync(absDir, { recursive: true });
      await cli(['base', '+record-download-attachment', ...baseArgs(base), '--table-id', t,
        '--record-id', id, '--file-token', fileToken, '--output', relDir, '--overwrite', '--format', 'json'],
      { timeout: 180000, cwd: thuMuc });
      return absDir;
    },
    async taiTepBuffer(base, t, id, fileToken) {
      const ten = 'tai-' + id + '-' + Date.now();
      const absDir = path.join(thuMuc, '.tmp', ten);
      fs.rmSync(absDir, { recursive: true, force: true });
      try {
        await this.taiTepVeThuMuc(base, t, id, fileToken, ten);
        const f = fs.readdirSync(absDir)[0];
        if (!f) throw new Error('Tải tệp từ Base không ra tệp nào');
        return { buffer: fs.readFileSync(path.join(absDir, f)), name: f };
      } finally { fs.rmSync(absDir, { recursive: true, force: true }); }
    },
    async dinhTepTuDuongDan(base, t, id, fieldName, relFilePath) {
      return cli(['base', '+record-upload-attachment', ...baseArgs(base), '--table-id', t,
        '--record-id', id, '--field-id', fieldName, '--file', relFilePath, '--format', 'json'],
      { timeout: 300000, cwd: thuMuc });
    },
    async dinhTepTuBuffer(base, t, id, fieldName, buffer, fileName) {
      const ten = 'len-' + id + '-' + Date.now();
      const relDir = './.tmp/' + ten, absDir = path.join(thuMuc, '.tmp', ten);
      fs.mkdirSync(absDir, { recursive: true });
      fs.writeFileSync(path.join(absDir, fileName), buffer);
      try { return await this.dinhTepTuDuongDan(base, t, id, fieldName, relDir + '/' + fileName); }
      finally { fs.rmSync(absDir, { recursive: true, force: true }); }
    },
    async goTep(base, t, id, fieldName, fileToken) {
      return cli(['base', '+record-remove-attachment', ...baseArgs(base), '--table-id', t,
        '--record-id', id, '--field-id', fieldName, '--file-token', fileToken, '--yes', '--format', 'json']);
    },

    /* ---- tin nhắn / danh bạ ---- */
    /* --as bot: gửi ở vai ỨNG DỤNG, giống bản Render gửi bằng tenant token. Vai user
     * đòi quyền khác (im:message.send_as_user) và người nhận thấy tin từ cá nhân. */
    async guiTinNguoi(openId, text) {
      await cli(['im', '+messages-send', '--as', 'bot', '--user-id', openId, '--text', text], { retries: 1 });
    },
    /* Tin nhắn KHÔNG retry mù như đọc Base — gửi lại một tin đã gửi được là nhóm
     * nhận hai lần. Lark có --idempotency-key cho đúng việc này. */
    guiTin({ chatId, userId, email, text, card, khoa, as }) {
      if (email && !userId && !chatId) {
        return Promise.resolve({ ok: false, loi: 'lark-cli không gửi theo email được — cần open_id hoặc chat_id.' });
      }
      return new Promise((resolve) => {
        const dich = userId ? ['--user-id', userId] : ['--chat-id', chatId];
        const args = [cfg.cliScript, 'im', '+messages-send', ...dich, '--as', as || 'bot', '--format', 'json'];
        if (card) args.push('--msg-type', 'interactive', '--content', JSON.stringify(card));
        else args.push('--text', String(text || ''));
        if (khoa) args.push('--idempotency-key', String(khoa).slice(0, 50));
        execFile(process.execPath, args, { timeout: 60000, cwd: thuMuc, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
          (err, stdout, stderr) => {
            const raw = String(stdout || '');
            let j = null;
            const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
            if (a >= 0 && b > a) { try { j = JSON.parse(raw.slice(a, b + 1)); } catch (_) {} }
            if (j && j.ok === true) {
              const d = j.data || {};
              return resolve({ ok: true, msgId: d.message_id || d.message?.message_id || '' });
            }
            let loi = String((j && (j.error?.message || j.message)) || stderr || err?.message || raw);
            if (/230002|230013|out of the chat|not in the chat/i.test(loi)) {
              loi = 'Bot của app chưa được thêm vào nhóm này — mời bot vào nhóm rồi gửi lại. (' + loi.slice(0, 200) + ')';
            } else if (/missing_scope|send_as_user/i.test(loi)) {
              loi = 'Thiếu quyền gửi tin của Lark app. (' + loi.slice(0, 200) + ')';
            }
            resolve({ ok: false, loi: loi.slice(0, 400) });
          });
      });
    },
    /** Tra danh bạ theo tên — chỉ chạy được với danh tính NGƯỜI (chế độ cli). */
    timNguoi(q) {
      return new Promise((resolve) => {
        const tu = String(q || '').trim();
        if (!tu || !cfg.cliScript) return resolve([]);
        execFile(process.execPath, [cfg.cliScript, 'contact', '+search-user', '--query', tu, '--as', 'user', '--format', 'json'],
          { timeout: 30000, cwd: thuMuc, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
          (err, stdout) => {
            try {
              const raw = String(stdout || '');
              const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
              resolve((j.data?.users || []).filter((u) => u.open_id && u.is_activated !== false)
                .map((u) => ({ id: u.open_id, ten: u.localized_name || u.open_id, phong: u.department || '' })));
            } catch (_) { resolve([]); }
          });
      });
    },
    /** Nhóm chat người đang đăng nhập tham gia. */
    dsNhom() {
      return new Promise((resolve) => {
        if (!cfg.cliScript) return resolve([]);
        execFile(process.execPath, [cfg.cliScript, 'im', '+chat-list', '--as', cfg.identity || 'user', '--format', 'json'],
          { timeout: 45000, cwd: thuMuc, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
          (err, stdout) => {
            try {
              const raw = String(stdout || '');
              const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
              resolve((j.data?.chats || []).filter((c) => c.chat_status === 'normal')
                .map((c) => ({ id: c.chat_id, ten: c.name, che_do: c.chat_mode })));
            } catch (_) { resolve([]); }
          });
      });
    },
    /**
     * Tài khoản đang dùng có quyền GHI base không. Đọc được không có nghĩa là ghi
     * được; hỏi trước thì biết ngay thay vì chờ booking thật đầu tiên mới lòi ra.
     * @returns {Promise<boolean|null>} null = không xác định được.
     */
    async quyenGhi(base) {
      try {
        const d = await cli(['drive', 'permission.members', 'auth', '--type', 'bitable',
          '--token', base || cfg.baseToken, '--action', 'edit', '--as', cfg.identity || 'user', '--format', 'json'],
        { retries: 1, timeout: 25000 });
        return typeof d.auth_result === 'boolean' ? d.auth_result : null;
      } catch (_) { return null; }
    },
    /** Chế độ cli không đọc được phạm vi app — UI dùng danh bạ từ Base. */
    async scopeUsers() { return []; },
  };
}

/* ===========================================================================
 * TẦNG THẤP — chế độ api (Open API, tenant token)
 * ========================================================================= */
function tangApi(cfg, thuMuc) {
  const HOST = cfg.apiHost || process.env.LARK_API_HOST || 'https://open.larksuite.com';
  const APP_ID = cfg.appId || process.env.LARK_APP_ID || '';
  const APP_SECRET = cfg.appSecret || process.env.LARK_APP_SECRET || '';

  /* HẠN GIỜ CHO MỌI CUỘC GỌI RA LARK. Không đặt thì Node chờ 300 giây, nhân ba
   * lượt thử lại là mười lăm phút treo cho một lần bấm — chỉ lộ đúng hôm Lark
   * có sự cố, tức hôm cần app chạy nhất. */
  const HAN_GOI = 20000;
  const HAN_TAI = 120000;
  const han = (ms) => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined);

  let tokenCache = { value: null, exp: 0 };
  async function tenantToken() {
    if (tokenCache.value && Date.now() < tokenCache.exp) return tokenCache.value;
    if (!APP_ID || !APP_SECRET) throw new Error('Thiếu LARK_APP_ID / LARK_APP_SECRET');
    const r = await fetch(HOST + '/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }), signal: han(HAN_GOI),
    });
    const d = await r.json();
    if (d.code !== 0) throw new Error('Lấy tenant_access_token thất bại: ' + (d.msg || d.code));
    tokenCache = { value: d.tenant_access_token, exp: Date.now() + Math.max(60, (d.expire || 7200) - 300) * 1000 };
    return tokenCache.value;
  }

  async function callOnce(method, url, { body, raw } = {}) {
    const token = await tenantToken();
    const r = await fetch(HOST + url, {
      method,
      headers: Object.assign({ Authorization: 'Bearer ' + token }, body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
      body: body ? JSON.stringify(body) : undefined,
      signal: han(raw ? HAN_TAI : HAN_GOI),
    });
    if (raw) {
      if (!r.ok) {
        const chi = await r.text().catch(() => '');
        const e = new Error('HTTP ' + r.status + ' khi tải tệp' + (chi ? ' — ' + chi.replace(/\s+/g, ' ').slice(0, 220) : ''));
        e.transient = loiTamThoiApi(0, r.status);
        throw e;
      }
      return Buffer.from(await r.arrayBuffer());
    }
    const d = await r.json().catch(() => ({ code: -1, msg: 'Phản hồi không phải JSON' }));
    if (d.code !== 0) {
      const e = new Error('Lark API ' + d.code + ': ' + (d.msg || 'lỗi không rõ'));
      e.code = d.code;
      e.transient = loiTamThoiApi(d.code, r.status);
      throw e;
    }
    return d.data;
  }

  async function call(method, url, opts = {}) {
    const tries = opts.retries == null ? 3 : opts.retries;
    let last;
    for (let i = 0; i < tries; i++) {
      try { return await callOnce(method, url, opts); }
      catch (e) {
        last = e;
        const nen = e.transient || cauLoiMang.test(String(e.message));
        if (i === tries - 1 || !nen) throw e;
        await wait(khoangCho(i, e));
      }
    }
    throw last;
  }

  const baseUrl = (base, t) => '/open-apis/base/v3/bases/' + (base || cfg.baseToken) + '/tables/' + t;

  async function taiLen(base, buffer, fileName) {
    const fd = new FormData();
    fd.append('file', new Blob([buffer]), fileName);
    fd.append('file_name', fileName);
    fd.append('parent_type', 'bitable_file');
    fd.append('parent_node', base || cfg.baseToken);
    fd.append('size', String(buffer.length));
    const r = await fetch(HOST + '/open-apis/drive/v1/medias/upload_all', {
      method: 'POST', headers: { Authorization: 'Bearer ' + await tenantToken() }, body: fd, signal: han(HAN_TAI),
    });
    const d = await r.json();
    if (d.code !== 0) {
      if (thieuQuyenTep(d.msg) || /Access denied/i.test(d.msg || '')) throw loiThieuQuyen('tải tệp lên');
      throw new Error('Upload thất bại: ' + (d.msg || d.code));
    }
    return d.data.file_token;
  }

  return {
    mode: 'api', tenantToken, call, isTransient: loiTamThoiApi,
    cli: async () => { throw new Error('Chế độ api không dùng lark-cli'); },
    /** Chế độ api không có "người đang đăng nhập" — danh tính từ phiên OAuth của hub. */
    async whoami() { return null; },
    gonLoi: (s) => String(s || '').slice(0, 240),

    docTrang: (base, t, offset) => call('GET', baseUrl(base, t) + '/records?limit=200&offset=' + offset),
    /* Open API không có record-get theo dạng cột → lật trang tới khi gặp. Trước
     * đây có bản chỉ đọc trang đầu, bản ghi MỚI TẠO nằm cuối bảng nên "không tìm
     * thấy" — vừa đăng ký lịch xong là không duyệt được. */
    docMotTho: null,
    async docCotTho(base, t, opts) {
      const d = await call('GET', baseUrl(base, t) + '/fields?limit=100&offset=0', opts);
      return d.fields || d.items || [];
    },
    async docBangTho(base, opts) {
      const d = await call('GET', '/open-apis/base/v3/bases/' + (base || cfg.baseToken) + '/tables?limit=100&offset=0', opts);
      return d.tables || d.items || [];
    },
    taoCot: (base, t, body) => call('POST', baseUrl(base, t) + '/fields', { body }),
    suaCot: (base, t, fieldId, def) => call('PUT', baseUrl(base, t) + '/fields/' + fieldId, { body: def }),
    taoLo: (base, t, names, rows) => call('POST', baseUrl(base, t) + '/records/batch_create', { body: { fields: names, rows } }),
    suaLo: (base, t, update_records) => call('POST', baseUrl(base, t) + '/records/batch_update', { body: { update_records } }),
    xoa: (base, t, ids) => call('POST', baseUrl(base, t) + '/records/batch_delete', { body: { record_id_list: ids } }),

    /**
     * Tải đính kèm của Base bằng danh tính app. Tệp của Base KHÔNG tải được bằng
     * đường drive thông thường nếu thiếu `extra` đúng (Lark trả 400). Thử lần lượt:
     *   1. get_attachments có URL tạm -> tải luôn
     *   2. có `extra_info` (KHÔNG PHẢI `extra` — đo từ bản online 12/09/2026) -> truyền nguyên văn
     *   3. tự dựng extra {"bitablePerm":{"tableId":…}}
     *   4. xin URL tải tạm (batch_get_tmp_download_url), có và không kèm extra (26/09)
     * Hỏng cả bốn thì báo lỗi KÈM lý do từng cách, để lần sau khỏi mò.
     */
    async taiTepBuffer(base, t, id, fileToken) {
      const meta = await call('POST', baseUrl(base, t) + '/get_attachments', { body: { record_id_list: [id] } });
      let o = null;
      const duyet = (x) => {
        if (!x || typeof x !== 'object') return;
        if (Array.isArray(x)) return x.forEach(duyet);
        if (x.file_token === fileToken) o = x;
        Object.values(x).forEach(duyet);
      };
      duyet(meta);
      const name = (o && o.name) || null;
      const loi = [];
      const url = o && (o.url || o.tmp_url || o.tmp_download_url || o.download_url);
      if (url) {
        try { const r = await fetch(url, { signal: han(HAN_TAI) }); if (r.ok) return { buffer: Buffer.from(await r.arrayBuffer()), name }; loi.push('url-tam HTTP ' + r.status); }
        catch (e) { loi.push('url-tam ' + e.message); }
      }
      const nhu = (x) => encodeURIComponent(typeof x === 'string' ? x : JSON.stringify(x));
      const duong = (extra) => '/open-apis/drive/v1/medias/' + encodeURIComponent(fileToken) + '/download' + (extra ? '?extra=' + nhu(extra) : '');
      const tuDung = { bitablePerm: { tableId: t, rev: (o && o.rev) || undefined } };
      const extra = (o && (o.extra_info || o.extra)) || null;
      if (extra) { try { return { buffer: await call('GET', duong(extra), { raw: true }), name }; } catch (e) { loi.push('extra-tra-ve ' + e.message); } }
      try { return { buffer: await call('GET', duong(tuDung), { raw: true }), name }; }
      catch (e) { if (thieuQuyenTep(e.message)) throw loiThieuQuyen('xem/tải tệp'); loi.push('extra-tu-dung ' + e.message); }
      for (const ex of [extra || tuDung, null]) {
        try {
          const d = await call('GET', '/open-apis/drive/v1/medias/batch_get_tmp_download_url?file_tokens=' + encodeURIComponent(fileToken) + (ex ? '&extra=' + nhu(ex) : ''));
          const u = d.tmp_download_urls && d.tmp_download_urls[0] && d.tmp_download_urls[0].tmp_download_url;
          if (u) { const r = await fetch(u, { signal: han(HAN_TAI) }); if (r.ok) return { buffer: Buffer.from(await r.arrayBuffer()), name }; loi.push('tmp-url HTTP ' + r.status); }
          else loi.push('tmp-url không trả đường dẫn');
        } catch (e) { loi.push('tmp-url' + (ex ? '+extra ' : ' ') + e.message); }
      }
      const err = new Error('Không tải được tệp từ Base — ' + loi.join(' | ') + (o ? '' : ' | get_attachments không thấy file_token'));
      err.http = 502;
      throw err;
    },
    async taiTepVeThuMuc(base, t, id, fileToken, relDirName) {
      const absDir = path.join(thuMuc, '.tmp', relDirName);
      fs.mkdirSync(absDir, { recursive: true });
      const { buffer, name } = await this.taiTepBuffer(base, t, id, fileToken);
      const ten = String(name || fileToken).replace(/[\\/:*?"<>|]/g, '_').slice(-120);
      fs.writeFileSync(path.join(absDir, ten), buffer);
      return absDir;
    },
    async dinhTepTuBuffer(base, t, id, fieldName, buffer, fileName) {
      const file_token = await taiLen(base, buffer, fileName);
      return call('POST', baseUrl(base, t) + '/append_attachments', {
        body: { attachments: { [id]: { [fieldName]: [{ file_token }] } } },
      });
    },
    async dinhTepTuDuongDan(base, t, id, fieldName, relFilePath) {
      const abs = path.resolve(thuMuc, relFilePath);
      return this.dinhTepTuBuffer(base, t, id, fieldName, fs.readFileSync(abs), path.basename(abs));
    },
    /** Tải lên rồi trả file_token, để nơi gọi tự ghi vào ô (thay cả ô chẳng hạn). */
    taiLen,
    goTep: (base, t, id, fieldName, fileToken) => call('POST', baseUrl(base, t) + '/remove_attachments', {
      body: { attachments: { [id]: { [fieldName]: [{ file_token: fileToken }] } } },
    }),

    /* Cần scope im:message; chưa cấp thì Lark trả 99991672. */
    async guiTinNguoi(openId, text) {
      await call('POST', '/open-apis/im/v1/messages?receive_id_type=open_id', {
        body: { receive_id: openId, msg_type: 'text', content: JSON.stringify({ text }) }, retries: 1,
      });
    },
    async guiTin({ chatId, userId, email, text, card, khoa }) {
      try {
        const d = await call('POST', '/open-apis/im/v1/messages?receive_id_type=' + (email ? 'email' : (userId ? 'open_id' : 'chat_id')), {
          retries: 1,
          body: {
            receive_id: email || userId || chatId,
            msg_type: card ? 'interactive' : 'text',
            content: JSON.stringify(card || { text: String(text || '') }),
            uuid: khoa ? String(khoa).slice(0, 50) : undefined,
          },
        });
        return { ok: true, msgId: d.message_id || '' };
      } catch (e) {
        const them = /230002|230013|not in the chat/i.test(e.message) ? ' — bot của app chưa được thêm vào nhóm này.' : '';
        return { ok: false, loi: (e.message + them).slice(0, 400) };
      }
    },
    /* `contact +search-user` là user-only; tenant token không tra được danh bạ.
     * Trả rỗng để giao diện lùi về danh sách người đã từng xuất hiện. */
    async timNguoi() { return []; },
    async dsNhom() {
      try {
        const d = await call('GET', '/open-apis/im/v1/chats?page_size=100');
        return (d.items || []).map((c) => ({ id: c.chat_id, ten: c.name, che_do: c.chat_mode }));
      } catch (_) { return []; }
    },
    async quyenGhi(base) {
      try {
        const d = await call('GET', '/open-apis/drive/v1/permissions/' + encodeURIComponent(base || cfg.baseToken) +
          '/members/auth?type=bitable&action=edit', { retries: 1 });
        return typeof d.auth_result === 'boolean' ? d.auth_result : null;
      } catch (_) { return null; }
    },
    /** Những người app được phép phục vụ — phạm vi khả dụng trong Developer Console. */
    async scopeUsers() {
      const userIds = [], deptIds = [];
      let token = '';
      for (let i = 0; i < 10; i++) {
        const q = '?user_id_type=open_id&department_id_type=open_department_id&page_size=100' + (token ? '&page_token=' + encodeURIComponent(token) : '');
        const d = await call('GET', '/open-apis/contact/v3/scopes' + q);
        userIds.push(...(d.user_ids || []));
        deptIds.push(...(d.department_ids || []));
        if (!d.has_more || !d.page_token) break;
        token = d.page_token;
      }
      const ra = new Map();
      for (const dep of deptIds) {
        let pt = '';
        for (let i = 0; i < 20; i++) {
          const q = '?department_id=' + encodeURIComponent(dep) + '&department_id_type=open_department_id&user_id_type=open_id&page_size=50' + (pt ? '&page_token=' + encodeURIComponent(pt) : '');
          let d;
          try { d = await call('GET', '/open-apis/contact/v3/users/find_by_department' + q); } catch (_) { break; }
          for (const u of d.items || []) {
            /* giữ cả email: open_id khác nhau giữa các app Lark nên email mới là khoá chắc */
            if (u.open_id) ra.set(u.open_id, { ten: u.name || u.en_name || u.open_id, email: u.enterprise_email || u.email || '' });
          }
          if (!d.has_more || !d.page_token) break;
          pt = d.page_token;
        }
      }
      for (const id of userIds) {
        if (ra.has(id)) continue;
        try {
          const d = await call('GET', '/open-apis/contact/v3/users/' + encodeURIComponent(id) + '?user_id_type=open_id');
          const u = d.user || {};
          ra.set(id, { ten: u.name || u.en_name || id, email: u.enterprise_email || u.email || '' });
        } catch (_) { ra.set(id, { ten: id, email: '' }); }
      }
      return [...ra.entries()].map(([id, x]) => ({ id, name: x.ten, email: x.email || '' }))
        .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    },
  };
}

/* ===========================================================================
 * TẦNG GIỮA — thao tác Base không phụ thuộc chế độ và họ
 * ========================================================================= */
function tangGiua(thap, ho) {
  const TRANG_TOI_DA = 60;

  async function docHet(base, t) {
    const out = [];
    let offset = 0;
    for (let trang = 0; trang < TRANG_TOI_DA; trang++) {
      const d = await thap.docTrang(base, t, offset);
      out.push(...cotThanhBanGhi(d, ho));
      if (!d.has_more) break;
      offset += 200;
    }
    return out;
  }

  /** Luôn lấy bản mới nhất từ Base — dùng cho quyết định phân quyền, không qua cache. */
  async function docMot(base, t, id) {
    if (thap.docMotTho) {
      const d = await thap.docMotTho(base, t, id);
      return cotThanhBanGhi(d, ho)[0] || null;
    }
    let offset = 0;
    const docThang = thap.docTrangThang || thap.docTrang;
    for (let trang = 0; trang < TRANG_TOI_DA; trang++) {
      const d = await docThang(base, t, offset);
      const thay = cotThanhBanGhi(d, ho).find((r) => idCua(r, ho) === id);
      if (thay) return thay;
      if (!d.has_more) break;
      offset += 200;
    }
    return null;
  }

  const hopKhoa = (rows) => [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const thanhHang = (names, r) => names.map((n) => (n in r ? r[n] : null));

  /** Tạo một bản ghi, trả kết quả thô (record_id_list…). */
  function taoMot(base, t, fields) {
    const names = Object.keys(fields);
    return thap.taoLo(base, t, names, [names.map((n) => fields[n])]);
  }

  /**
   * Tạo nhiều bản ghi; chia lô 200 dòng và theo độ dài JSON. Mọi dòng phải cùng
   * bộ cột vì payload dạng bảng — lấy HỢP của mọi khoá rồi điền null cho ô thiếu,
   * thay vì tin rằng dòng đầu đã đủ cột (dòng không khai Ghi chú làm lệch cả bảng).
   * Trả { ids, tho } — tho là kết quả thô của lô cuối, có record_id_list gộp.
   */
  async function taoNhieu(base, t, rows) {
    if (!rows || !rows.length) return { ids: [], tho: { records: [] } };
    const names = hopKhoa(rows);
    const ids = [];
    let tho = null;
    for (const lo of chiaLo(rows, (r) => JSON.stringify(r).length)) {
      tho = await thap.taoLo(base, t, names, lo.map((r) => thanhHang(names, r)));
      ids.push(...((tho && tho.record_id_list) || []));
    }
    if (tho && typeof tho === 'object') tho = Object.assign({}, tho, { record_id_list: ids });
    return { ids, tho };
  }

  const suaMot = (base, t, id, fields) => thap.suaLo(base, t, { [id]: fields });

  /** Sửa nhiều; chia lô như tạo. Trả { soDong, tho }. */
  async function suaNhieu(base, t, map) {
    const ids = Object.keys(map);
    let soDong = 0, tho = null;
    for (const lo of chiaLo(ids, (id) => JSON.stringify(map[id]).length + id.length + 8)) {
      const update_records = {};
      lo.forEach((id) => { update_records[id] = map[id]; });
      tho = await thap.suaLo(base, t, update_records);
      soDong += lo.length;
    }
    return { soDong, tho };
  }

  const chuanCot = (ds) => ds.map((f) => ({
    id: f.field_id || f.id || '', name: String(f.field_name || f.name || ''), type: f.type || f.ui_type || '',
  })).filter((f) => f.id);
  const chuanBang = (ds) => ds.map((t) => ({
    id: t.table_id || t.id || '', name: String(t.name || t.table_name || ''),
  })).filter((t) => t.id);

  /** Tạo đúng MỘT cột: { name, type, description? }. */
  function taoCot(base, t, spec) {
    const name = String((spec && spec.name) || '').trim();
    const type = String((spec && spec.type) || '').trim();
    if (!name || !type) throw Object.assign(new Error('Tạo cột cần đủ name và type'), { code: 400 });
    const body = { name, type };
    if (spec.description) body.description = String(spec.description);
    return thap.taoCot(base, t, body);
  }

  /** THAY cả ô đính kèm bằng danh sách tệp mới: xoá ô rồi tải lần lượt. */
  async function thayTepBangBuffer(base, t, id, fieldName, dsTep) {
    await suaMot(base, t, id, { [fieldName]: [] });
    if (thap.mode === 'api') {
      const token = [];
      for (const x of dsTep) token.push({ file_token: await thap.taiLen(base, x.buf, x.ten) });
      return suaMot(base, t, id, { [fieldName]: token });
    }
    let r;
    for (const x of dsTep) r = await thap.dinhTepTuBuffer(base, t, id, fieldName, x.buf, x.ten);
    return r;
  }

  return { docHet, docMot, taoMot, taoNhieu, suaMot, suaNhieu, chuanCot, chuanBang, taoCot, thayTepBangBuffer };
}

/* ===========================================================================
 * HAI BỘ CHUYỂN ĐỔI — giữ nguyên chữ ký cũ của từng họ
 * ========================================================================= */
function hoA(cfg, thap, giua) {
  return {
    listAll: (t) => giua.docHet(null, t),
    getRecord: (t, id) => giua.docMot(null, t, id),
    /** trả record_id vừa tạo */
    createRecord: async (t, fields) => ((await giua.taoMot(null, t, fields)).record_id_list || [])[0] || null,
    /** trả mảng record_id */
    createMany: async (t, rows) => (await giua.taoNhieu(null, t, rows)).ids,
    updateRecord: (t, id, fields) => giua.suaMot(null, t, id, fields),
    /** trả số dòng đã sửa */
    updateMany: async (t, map) => (await giua.suaNhieu(null, t, map)).soDong,
    deleteRecords: (t, ids) => thap.xoa(null, t, ids),
    listTables: async (opts) => giua.chuanBang(await thap.docBangTho(null, opts)),
    listFields: async (t, opts) => giua.chuanCot(await thap.docCotTho(null, t, opts)),
    createField: (t, spec) => giua.taoCot(null, t, spec),
    quyenGhi: () => thap.quyenGhi(null),
    guiTin: (o) => thap.guiTin(o),
    dsNhom: () => thap.dsNhom(),
    timNguoi: (q) => thap.timNguoi(q),
    chiaLo, TRAN_JSON, TRAN_DONG,
  };
}

function hoB(cfg, thap, giua, bangMacDinh) {
  const T = (t) => t || bangMacDinh;
  return {
    listAllRecords: (t, base) => giua.docHet(base, T(t)),
    getRecord: (id, t) => giua.docMot(null, T(t), id),
    /** cột THÔ như Lark trả (họ B đọc field_name/field_id trực tiếp) */
    listFields: (t, base) => thap.docCotTho(base, T(t)),
    updateField: (fieldId, def, t) => thap.suaCot(null, T(t), fieldId, def),
    updateRecord: (id, fields, t, base) => giua.suaMot(base, T(t), id, fields),
    updateMany: async (map, t, base) => (await giua.suaNhieu(base, T(t), map)).tho,
    createRecord: (fields, t, base) => giua.taoMot(base, T(t), fields),
    createMany: async (rows, t, base) => (await giua.taoNhieu(base, T(t), rows)).tho,
    deleteRecords: (ids, t, base) => thap.xoa(base, T(t), ids),
    downloadAttachment: (id, fileToken, relDirName, t, base) => thap.taiTepVeThuMuc(base, T(t), id, fileToken, relDirName),
    downloadAttachmentBuffer: (id, fileToken, t, base) => thap.taiTepBuffer(base, T(t), id, fileToken),
    uploadAttachment: (id, fieldName, relFilePath, t, base) => thap.dinhTepTuDuongDan(base, T(t), id, fieldName, relFilePath),
    removeAttachment: (id, fieldName, fileToken, t) => thap.goTep(null, T(t), id, fieldName, fileToken),
    /** THAY ô đính kèm bằng một tệp từ Buffer (Sản phẩm: hình bản đồ). */
    uploadAttachmentBuffer: (id, fieldName, buffer, fileName, t, base) =>
      giua.thayTepBangBuffer(base, T(t), id, fieldName, [{ buf: buffer, ten: fileName }]),
    /** THAY ô đính kèm bằng nhiều tệp (KOL: ảnh CCCD). tep = [{ ten, buf }] */
    ganTep: (id, fieldName, tep, t) => giua.thayTepBangBuffer(null, T(t), id, fieldName, tep),
    taiTep: async (id, fileToken, t) => {
      const { buffer, name } = await thap.taiTepBuffer(null, T(t), id, fileToken);
      return { buf: buffer, ten: name || fileToken };
    },
    /** Không ném lỗi — gửi tin là việc phụ, hỏng thì thôi, đừng chặn thao tác chính. */
    async guiTinNhan(openId, noiDung) {
      if (!openId || !noiDung) return { ok: false, ly: 'thiếu người nhận hoặc nội dung' };
      try { await thap.guiTinNguoi(openId, noiDung); return { ok: true }; }
      catch (e) { return { ok: false, ly: e.message }; }
    },
    /** Bảng công việc: trả true/false. */
    async sendMessage(openId, text) {
      try { await thap.guiTinNguoi(openId, text); return true; } catch (_) { return false; }
    },
    scopeUsers: () => thap.scopeUsers(),
  };
}

/* ===========================================================================
 * KHO BASE DÙNG CHUNG Ở HUB — hỏi hub trước khi tự đọc Lark
 * ========================================================================= */
/**
 * Bọc tầng thấp: hai chỗ ĐỌC (trang bản ghi, danh sách cột) hỏi hub trước; hub
 * không có / hỏng / trả rác thì đọc thẳng Lark như cũ. Mọi chỗ GHI thì làm xong
 * báo hub bỏ bản đệm của bảng đó (không chờ). Xem lark-chung/kho-hub.js.
 *
 * Tắt riêng cho một app: tuyChon.khongQuaHub = true (app tự chịu số liệu cũ
 * hơn vài giây là không được, ví dụ đọc trước khi ghi có xung đột revision).
 */
function bocKhoHub(thap, cfg, tuyChon) {
  let khoHub;
  try { khoHub = require('./kho-hub'); } catch (_) { return; }
  if (tuyChon.khongQuaHub || !khoHub.bat()) return;
  const as = cfg.identity || 'user';
  const baseCua = (base) => base || cfg.baseToken;

  const docTrangGoc = thap.docTrang.bind(thap);
  /* Đường đọc THẲNG Lark, cho docMot (đọc một bản ghi phải luôn mới nhất). */
  thap.docTrangThang = docTrangGoc;
  thap.docTrang = async (base, t, offset) => {
    const d = await khoHub.docTrang(baseCua(base), t, offset, as);
    return d || docTrangGoc(base, t, offset);
  };
  const docCotGoc = thap.docCotTho.bind(thap);
  thap.docCotTho = async (base, t, opts) => {
    const d = await khoHub.docCot(baseCua(base), t, as);
    return d || docCotGoc(base, t, opts);
  };
  /* Đọc MỘT bản ghi luôn phải mới nhất (phân quyền) — không qua kho. */

  for (const ten of ['taoLo', 'suaLo', 'xoa', 'taoCot', 'suaCot', 'dinhTepTuDuongDan', 'dinhTepTuBuffer', 'goTep']) {
    if (typeof thap[ten] !== 'function') continue;
    const goc = thap[ten].bind(thap);
    thap[ten] = async (base, t, ...rest) => {
      try { return await goc(base, t, ...rest); }
      finally { khoHub.lamTuoi(baseCua(base), t); }
    };
  }
  thap.khoHub = khoHub;
}

/* ===========================================================================
 * Điểm vào
 * ========================================================================= */
/**
 * @param {object} cfg  config.js của app: cần mode, identity, baseToken, cliScript,
 *                      appId/appSecret/apiHost (chế độ api).
 * @param {object} tuyChon
 *   ho:          'A' | 'B'
 *   bangMacDinh: table id mặc định (họ B)
 *   thuMuc:      thư mục app (cwd cho lark-cli, nơi đặt .tmp/)
 *   mode:        ép 'cli' | 'api' (larkapi.js của app dùng 'api'); mặc định cfg.mode
 */
function taoLark(cfg, tuyChon = {}) {
  const mode = tuyChon.mode || cfg.mode || 'cli';
  const ho = tuyChon.ho || 'B';
  const thuMuc = tuyChon.thuMuc || process.cwd();
  const thap = mode === 'api' ? tangApi(cfg, thuMuc) : tangCli(cfg, thuMuc);
  bocKhoHub(thap, cfg, tuyChon);
  const giua = tangGiua(thap, ho);
  const chung = {
    mode, ho, cli: thap.cli, whoami: thap.whoami, isTransient: thap.isTransient, gonLoi: thap.gonLoi,
    tenantToken: thap.tenantToken, call: thap.call,
    /* tầng thấp/giữa để app viết hàm riêng mà không phải chép lại lõi */
    thap, giua,
  };
  const rieng = ho === 'A' ? hoA(cfg, thap, giua) : hoB(cfg, thap, giua, tuyChon.bangMacDinh);
  return Object.assign(chung, rieng);
}

module.exports = { taoLark, chiaLo, TRAN_JSON, TRAN_DONG, loiTamThoiCli, loiTamThoiApi, cotThanhBanGhi, loiThieuQuyen, thieuQuyenTep };
