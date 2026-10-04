'use strict';
/**
 * ============================================================================
 * KHO TRÊN LARK BASE — để deploy xong là có dữ liệu ngay
 * ============================================================================
 * Trước tệp này, kho nằm ở `du-lieu/tho.json` trên đĩa. Ổ đĩa Render là ổ TẠM:
 * mỗi lần deploy là trắng, app phải kéo lại 16.600 khách và 16.600 đơn từ
 * Tourwell — mười lăm phút không có số liệu, và mười lăm phút nện vào trần 60
 * lượt/phút mà app Quảng cáo với Quỹ chi phí đang dùng chung.
 *
 * Cùng một bài học hub đã học với ô phát và logo: thứ gì phải sống qua deploy
 * thì để trên Base, đĩa chỉ là bản sao cho nhanh.
 *
 * NÉN TRƯỚC KHI CẤT. Đo thật: 14 MB JSON xuống còn 1,6 MB (11%) trong 107ms.
 * Không nén thì mỗi lần ghi là đẩy 14 MB lên Lark và kéo 14 MB về mỗi lần
 * khởi động — chậm, và chạm trần dung lượng đính kèm sớm hơn cần thiết.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BASE = 'JhZtbxv0gamk5ys3Fr0luHnsgwG';      // Base "Tracking"
const TABLE = 'tblQPY5IK0p5cVNP';                 // bảng "Kho app Khách hàng"
const COT = { khoa: 'Khoá', tep: 'Tệp', luc: 'Cập nhật', ghi: 'Ghi chú' };
const KHOA = 'tho';                               // một dòng duy nhất

const BL = (() => { try { return require(path.join(__dirname, '..', 'lark-mkt-hub', 'base-lark.js')); } catch (_) { return null; } })();
const B = (() => {
  try {
    return BL.bang(BASE, TABLE, COT.tep);
  } catch (e) {
    console.error('[kho-base] không nạp được lớp Base:', e.message);
    return null;
  }
})();

const chu = (v) => {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map((x) => (x && (x.text || x.name)) || x).filter(Boolean).join('');
  if (typeof v === 'object') return String(v.text || v.name || '');
  return String(v);
};

/** Dòng kho trên Base, hoặc null. */
async function timDong() {
  if (!B) return null;
  /* docHet() trả các dòng dạng phẳng: ô truy cập theo TÊN CỘT, và id nằm ở
   * `recordId` — không phải {record_id, cells} như lark.js của các app con.
   * Mỗi lớp một kiểu, nên phải đọc đúng kiểu của lớp mình đang dùng. */
  const recs = await B.docHet();
  for (const r of recs) {
    if (chu(r[COT.khoa]).trim() === KHOA) return r;
  }
  return null;
}

/**
 * Kéo kho từ Base về đĩa. Trả true nếu có và ghi được.
 *
 * Hỏng thì trả false chứ KHÔNG ném: không có kho trên Base là chuyện bình
 * thường (lần chạy đầu), và app còn đường lùi là tự kéo từ Tourwell.
 */
async function veDia(tepDich) {
  if (!B) return false;
  try {
    const r = await timDong();
    if (!r) return false;
    const ds = BL.docOTep(r[COT.tep]);
    const t = ds && ds[0];
    if (!t || !t.token) return false;
    /* taiTep tra {buf, kieu} chu khong phai Buffer tran — nhan nham thi
     * gunzip nem "Received an instance of Object", mot cau khong noi len
     * dieu gi va nguoi doc se di tim loi o cho khac. */
    const tai = await B.taiTep(r.recordId, t.token);
    const buf = (tai && tai.buf) || (Buffer.isBuffer(tai) ? tai : null);
    if (!buf || !buf.length) return false;
    /* Nhận cả hai dạng: nén và không nén. Dòng cũ có thể do bản trước ghi
     * thẳng JSON — đọc được thì đọc, đừng bắt người ta xoá đi làm lại. */
    let raw = buf;
    if (buf[0] === 0x1f && buf[1] === 0x8b) raw = zlib.gunzipSync(buf);
    JSON.parse(raw.toString('utf8'));          // kiểm trước khi ghi đè đĩa
    fs.mkdirSync(path.dirname(tepDich), { recursive: true });
    fs.writeFileSync(tepDich, raw);
    return true;
  } catch (e) {
    console.error('[kho-base] kéo về hỏng:', String((e && e.message) || e).slice(0, 160));
    return false;
  }
}

/** Cất kho từ đĩa lên Base. */
async function catLen(tepNguon, ghiChu = '') {
  if (!B) return false;
  try {
    const raw = fs.readFileSync(tepNguon);
    const nen = zlib.gzipSync(raw, { level: 6 });
    const r = await timDong();
    const o = {
      [COT.khoa]: KHOA,
      [COT.luc]: new Date().toISOString(),
      [COT.ghi]: ghiChu || (Math.round(raw.length / 104857.6) / 10 + ' MB → '
        + Math.round(nen.length / 104857.6) / 10 + ' MB nén'),
    };
    let rid;
    if (r) { await B.ghi(r.recordId, o); rid = r.recordId; }
    else { rid = await B.tao(o); }
    if (!rid) throw new Error('không tạo được dòng kho trên Base');
    /* Gỡ tệp cũ TRƯỚC khi đính tệp mới: ô đính kèm cộng dồn, không thay thế —
     * không gỡ thì sau mươi lần cất là mươi bản 1,6 MB nằm chồng nhau. */
    if (r) {
      const cu = BL.docOTep(r[COT.tep]);
      for (const t of (cu || [])) {
        try { await B.goTep(rid, COT.tep, t.token); } catch (_) {}
      }
    }
    await B.dinhTep(rid, COT.tep, { ten: 'tho.json.gz', kieu: 'application/gzip', buf: nen });
    return true;
  } catch (e) {
    console.error('[kho-base] cất lên hỏng:', String((e && e.message) || e).slice(0, 160));
    return false;
  }
}

module.exports = { veDia, catLen, BASE, TABLE };
