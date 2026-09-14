'use strict';
/**
 * ============================================================================
 * THÀNH VIÊN NHÓM CHAT LARK — dùng để tick sẵn người nhận thông báo
 * ============================================================================
 * Anh Hùng: "danh sách gửi thông báo này nên để các thành viên chọn sẵn là
 * những người có trong nhóm phòng MKT, còn muốn tìm kiếm thêm anh sẽ tự search".
 *
 * Nên "ai thuộc phòng" KHÔNG khai tay trong mã. Nhóm chat "Phòng MKT" mới là
 * nơi anh Hùng thật sự thêm/bớt người mỗi khi có người vào hay nghỉ; khai tay
 * thì tới lúc lệch không ai biết, và người mới sẽ lặng lẽ không nhận thông báo.
 *
 * BA ĐƯỜNG, theo thứ tự, vì đường đầu KHÔNG chắc đi được ở bản deploy:
 *
 *   1. Hỏi Lark (api: token app · máy cá nhân: phiên lark-cli).
 *   2. Hỏng thì lấy BẢN LƯU lần đọc gần nhất (du-lieu/nhom-mkt.json, có trong
 *      kho nên bản deploy cũng có sẵn một bản để dùng ngay ngày đầu).
 *   3. Hỏng cả hai thì trả danh sách rỗng KÈM LÝ DO — panel nói thẳng ra, chứ
 *      không lặng lẽ tick 0 người rồi để quản lý tưởng nhóm chỉ có vậy.
 *
 * VÌ SAO ĐƯỜNG 1 CÓ THỂ HỎNG Ở BẢN DEPLOY: `im +chat-members-list` đòi quyền
 * `im:chat.members:read` VÀ người gọi phải Ở TRONG nhóm. Máy cá nhân gọi bằng
 * phiên của anh Hùng — anh ở trong nhóm nên đọc được. Bản deploy gọi bằng danh
 * tính APP; app chưa được thêm vào nhóm thì Lark từ chối. Đó là lý do có đường 2.
 *
 * VÌ SAO KHỚP THEO TÊN, KHÔNG PHẢI open_id: open_id cấp theo TỪNG app Lark.
 * Id đọc ở máy cá nhân (phiên lark-cli) khác id của bản deploy cho cùng một
 * người — đo được: anh Hùng là ou_f0d3514a… ở máy, ou_49d2cc26… trên Render.
 * Nên bản lưu chỉ giữ TÊN, và khớp theo id chỉ ăn khi id đọc cùng một chế độ.
 */
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const { laApi, tenantToken, cli } = require('./base-lark');

/** Nhóm "Phòng MKT". Đổi nhóm thì khai biến môi trường, không phải sửa mã. */
const CHAT_ID = process.env.HUB_NHOM_MKT || 'oc_246eff4a1b9d2e711cedad1645830465';
const TEN_NHOM = process.env.HUB_NHOM_MKT_TEN || 'Phòng MKT';
const FILE_LUU = path.join(__dirname, 'du-lieu', 'nhom-mkt.json');

/* Panel Thông báo mở ra là hỏi ngay — đừng gọi Lark mỗi lần mở. Nhóm phòng đổi
 * người vài tháng một lần, 10 phút là quá đủ tươi. */
const DEM_MS = 10 * 60000;
let dem = { at: 0, kq: null };

/* ---------------- so tên ----------------
 * Tên trong danh bạ và tên trong nhóm chat cùng lấy từ hồ sơ Lark nên gần như
 * luôn trùng khít. Vẫn chuẩn hoá vì ba thứ hay lệch: khoảng trắng thừa, HOA
 * thường, và dấu tiếng Việt gõ bằng hai cách khác nhau (tổ hợp NFC/NFD) — mắt
 * nhìn y hệt mà so chuỗi thì khác. */
function chuanTen(s) {
  return String(s == null ? '' : s)
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/* ---------------- đọc từ Lark ---------------- */

/** Gom người từ mọi hình dạng đáp: api trả `items`, lark-cli trả `users`. */
function gomNguoi(d) {
  const ds = (d && (d.users || d.items)) || [];
  return ds
    .filter((x) => x && (x.name || x.member_id))
    .map((x) => ({ id: x.member_id || '', ten: String(x.name || '').trim() }))
    .filter((x) => x.ten);
}

async function quaApi() {
  const token = await tenantToken();
  const nguoi = [];
  let cursor = '';
  for (let trang = 0; trang < 10; trang++) {
    const u = cfg.apiHost + '/open-apis/im/v1/chats/' + encodeURIComponent(CHAT_ID) +
      '/members?member_id_type=open_id&page_size=100' +
      (cursor ? '&page_token=' + encodeURIComponent(cursor) : '');
    const r = await fetch(u, { headers: { Authorization: 'Bearer ' + token } });
    const d = await r.json();
    if (d.code !== 0) {
      /* 230002 / 99991672 nói đúng một chuyện: app chưa ở trong nhóm hoặc chưa
       * có quyền đọc thành viên. Dịch ra việc phải làm, đừng ném mã số. */
      const them = (d.code === 230002 || d.code === 99991672)
        ? ' — thêm app Marketing Hub vào nhóm "' + TEN_NHOM + '" và bật quyền im:chat.members:read'
        : '';
      throw new Error('Lark từ chối đọc nhóm (' + d.code + ' ' + (d.msg || '') + ')' + them);
    }
    nguoi.push(...gomNguoi(d.data));
    if (!(d.data && d.data.has_more)) break;
    cursor = (d.data && d.data.page_token) || '';
    if (!cursor) break;
  }
  return nguoi;
}

async function quaCli() {
  const d = await cli(['im', '+chat-members-list', '--chat-id', CHAT_ID,
    '--member-types', 'user', '--page-all', '--page-limit', '0',
    '--as', process.env.LARK_AS || 'user', '--format', 'json']);
  return gomNguoi(d);
}

/* ---------------- bản lưu ---------------- */

function docLuu() {
  try {
    const j = JSON.parse(fs.readFileSync(FILE_LUU, 'utf8'));
    const nguoi = (j.nguoi || []).filter((x) => x && x.ten);
    return nguoi.length ? { nguoi, luc: j.luc || 0 } : null;
  } catch (_) { return null; }
}

/**
 * Ghi bản lưu — CHỈ TÊN.
 *
 * Không ghi open_id: id của lần đọc này chỉ đúng trong chế độ đã đọc nó, mà bản
 * lưu thì đi qua kho sang máy khác. Giữ id vào đây là mời một lần khớp sai im
 * lặng sau này.
 */
function ghiLuu(nguoi) {
  try {
    fs.mkdirSync(path.dirname(FILE_LUU), { recursive: true });
    fs.writeFileSync(FILE_LUU, JSON.stringify({
      nhom: TEN_NHOM, chatId: CHAT_ID, luc: Date.now(),
      nguoi: nguoi.map((x) => ({ ten: x.ten })),
    }, null, 2) + '\n');
  } catch (_) { /* ổ Render là ổ tạm, ghi hỏng cũng không sao */ }
}

/* ---------------- cửa chính ---------------- */

/**
 * Thành viên nhóm phòng.
 * @returns {Promise<{nhom:string, nguoi:Array<{id:string,ten:string}>, nguon:string, luc:number, loi:string}>}
 */
async function thanhVien(moi = false) {
  if (!moi && dem.kq && Date.now() - dem.at < DEM_MS) return dem.kq;
  let loi = '';
  try {
    const nguoi = laApi() ? await quaApi() : await quaCli();
    if (nguoi.length) {
      ghiLuu(nguoi);
      const kq = { nhom: TEN_NHOM, nguoi, nguon: 'lark', luc: Date.now(), loi: '' };
      dem = { at: Date.now(), kq };
      return kq;
    }
    loi = 'Nhóm "' + TEN_NHOM + '" đọc được nhưng không có ai trong đó.';
  } catch (e) {
    loi = String((e && e.message) || e).slice(0, 200);
  }
  const luu = docLuu();
  const kq = luu
    ? { nhom: TEN_NHOM, nguoi: luu.nguoi, nguon: 'luu', luc: luu.luc, loi }
    : { nhom: TEN_NHOM, nguoi: [], nguon: '', luc: 0, loi };
  dem = { at: Date.now(), kq };
  return kq;
}

/**
 * Khớp thành viên nhóm vào danh bạ hub.
 *
 * Trả cả phần KHÔNG khớp được: một người ở trong nhóm mà hub chưa biết tới thì
 * họ không có ô để tick, và im lặng không nhận thông báo nào. Panel phải nói ra.
 *
 * @param {Array<{id:string,ten:string,email:string}>} danhBa
 * @param {Array<{id:string,ten:string}>} nhom
 */
function khopDanhBa(danhBa, nhom) {
  const db = danhBa || [];
  const theoId = new Map(db.filter((x) => x.id).map((x) => [x.id, x]));
  const theoTen = new Map();
  db.forEach((x) => {
    const k = chuanTen(x.ten);
    if (!k) return;
    /* Trùng tên: giữ cả hai thay vì ghi đè. Tick nhầm người vì trùng tên là lỗi
     * không ai phát hiện được từ màn hình. */
    theoTen.set(k, (theoTen.get(k) || []).concat([x]));
  });

  const ids = [];
  const thieu = [];
  const trungTen = [];
  (nhom || []).forEach((n) => {
    const boId = n.id && theoId.get(n.id);
    if (boId) { if (!ids.includes(boId.id)) ids.push(boId.id); return; }
    const cung = theoTen.get(chuanTen(n.ten)) || [];
    if (cung.length === 1) {
      if (!ids.includes(cung[0].id)) ids.push(cung[0].id);
    } else if (cung.length > 1) {
      trungTen.push(n.ten);
    } else {
      thieu.push(n.ten);
    }
  });
  return { ids, thieu, trungTen };
}

module.exports = { CHAT_ID, TEN_NHOM, FILE_LUU, chuanTen, gomNguoi, khopDanhBa, thanhVien };
