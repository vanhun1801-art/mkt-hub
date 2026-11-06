'use strict';
/**
 * Luật nhắc gọn cho mọi thông báo của Marketing Hub (06/11/2026).
 *
 * Anh Hùng: "chỉ nhắc cần thiết thôi". Bot "Quản lý công việc" của Rooty
 * Workspace nhắc nhiều quá nên phiền; trong các điều học từ bên đó anh chỉ duyệt
 * MỘT điều: nhắc lần 2 có giới hạn (chưa xong sau một khoảng thì nhắc đúng một
 * lần nữa rồi thôi). Đổi mẫu thẻ, sửa thẻ cũ, ghi "vì sao nhận tin" thì CHƯA
 * duyệt; muốn làm phải hỏi anh trước.
 *
 * Module này nhớ "khoá nào đã báo, lúc nào". Hai cách dùng:
 *
 *   nenBao(khoa, imMs)       sự cố/tin này đã báo trong `imMs` vừa qua chưa?
 *                             Chưa thì true; gửi xong gọi ghi(khoa).
 *   buocNhac(khoa, sauMs)    1 = chưa báo lần nào, gửi lần đầu
 *                             2 = đã báo lần đầu quá `sauMs`, nhắc lần 2
 *                             0 = đã nhắc đủ hai lần, hoặc chưa tới giờ: thôi
 *                             Gửi xong gọi ghi(khoa, lan). Việc xong thì quen(khoa).
 *                             KHUNG SẴN, chưa bật cho loại tin nào (anh duyệt 06/11).
 *
 * VÌ SAO NHỚ TRÊN BASE: ổ đĩa Render là ổ tạm, mỗi lần đẩy code là mất. Nhớ
 * trong tệp hay trong bộ nhớ thì sau mỗi lần deploy app tưởng chưa báo gì và
 * báo lại từ đầu. Đúng chuyện đã xảy ra 06/11: thẻ "Đồng bộ quảng cáo có vấn
 * đề" (Google Ads trễ 15 ngày) đến lúc 11:49, 12:59 và 15:04, mỗi lần ngay sau
 * một lần deploy.
 *
 * Chỗ nhớ: bảng kho của Hub (Base Tracking, bảng có ba cột Ô · Tệp · Cập nhật,
 * dùng chung với ô phát, ghi chú, sổ Hộp thư, bot nhắc nghiệm thu). Mỗi khoá
 * một dòng: Ô = "da-bao:<khoá>" (lần nhắc 2 thêm đuôi "#2"), Cập nhật = lúc
 * gửi (ISO). Không thêm cột, không đổi cấu trúc Base. Dòng quá 30 ngày tự dọn.
 *
 * Base hỏng thì vẫn chạy bằng bộ nhớ trong tiến trình (lệch về phía có thể báo
 * lại sau deploy, không bao giờ nuốt mất tin lần đầu).
 */

const TIEN_TO = 'da-bao:';
const GIU_MS = 30 * 86400e3;
const DOC_LAI_MS = 60 * 1000;

function bangMacDinh() {
  try {
    return require('../lark-mkt-hub/base-lark').bang(
      process.env.HUB_PHIM_BASE || process.env.HUB_TB_BASE || 'JhZtbxv0gamk5ys3Fr0luHnsgwG',
      process.env.HUB_PHIM_TABLE || 'tbl1rcw5ES34EeEY', 'Tệp');
  } catch (e) {
    console.error('[nhac-gon] không nạp được bảng kho Hub, chỉ nhớ trong tiến trình:', e.message);
    return null;
  }
}

/**
 * @param {object} o
 * @param {object|null} [o.bang]  bảng base-lark ({docHet, tao, ghi, xoa}); bỏ trống = bảng kho Hub;
 *                                 null = chỉ nhớ trong bộ nhớ (test, chạy lẻ)
 * @param {Function} [o.bayGio]
 */
function tao(o = {}) {
  const bayGio = o.bayGio || Date.now;
  let bang = o.bang;
  const layBang = () => { if (bang === undefined) bang = bangMacDinh(); return bang; };

  /* Ô → { luc, recordId } ; trộn từ Base và từ những lần ghi trong tiến trình */
  const nho = new Map();
  let docLuc = 0;
  let dangDoc = null;

  async function napBase() {
    const B = layBang();
    if (!B) return;
    if (bayGio() - docLuc < DOC_LAI_MS) return;
    if (dangDoc) return dangDoc;
    dangDoc = (async () => {
      try {
        const ds = await B.docHet();
        for (const r of ds) {
          const o1 = String(r['Ô'] || '');
          if (!o1.startsWith(TIEN_TO)) continue;
          const luc = Date.parse(String(r['Cập nhật'] || '')) || 0;
          const cu = nho.get(o1);
          if (!cu || luc >= cu.luc) nho.set(o1, { luc, recordId: r.recordId });
        }
        docLuc = bayGio();
      } catch (e) {
        console.error('[nhac-gon] chưa đọc được bảng kho Hub:', e.message);
      } finally { dangDoc = null; }
    })();
    return dangDoc;
  }

  const o_ = (khoa, lan) => TIEN_TO + khoa + (lan === 2 ? '#2' : '');

  async function lucBao(khoa, lan = 1) {
    await napBase();
    const m = nho.get(o_(khoa, lan));
    return m ? m.luc : null;
  }

  async function nenBao(khoa, imMs) {
    const luc = await lucBao(khoa, 1);
    return luc == null || bayGio() - luc >= imMs;
  }

  async function buocNhac(khoa, sauMs) {
    const l1 = await lucBao(khoa, 1);
    if (l1 == null) return 1;
    if (await lucBao(khoa, 2) != null) return 0;
    return bayGio() - l1 >= sauMs ? 2 : 0;
  }

  /** Ghi dấu đã gửi. Lỗi Base không ném: tin đã đi rồi, dấu nhớ trong tiến trình vẫn còn. */
  async function ghi(khoa, lan = 1) {
    const ten = o_(khoa, lan);
    const luc = bayGio();
    const cu = nho.get(ten);
    nho.set(ten, { luc, recordId: cu && cu.recordId });
    const B = layBang();
    if (!B) return;
    try {
      const o1 = { 'Ô': ten, 'Cập nhật': new Date(luc).toISOString() };
      if (cu && cu.recordId) await B.ghi(cu.recordId, { 'Cập nhật': o1['Cập nhật'] });
      else {
        const id = await B.tao(o1);
        nho.set(ten, { luc, recordId: id });
      }
    } catch (e) {
      console.error('[nhac-gon] chưa ghi được dấu đã báo lên Base:', e.message);
    }
    await don();
  }

  /** Việc đã xong / sự cố đã hết: quên khoá (cả lần 2), lần sau là chuyện mới. */
  async function quen(khoa) {
    await napBase();
    const B = layBang();
    for (const lan of [1, 2]) {
      const ten = o_(khoa, lan);
      const m = nho.get(ten);
      nho.delete(ten);
      if (B && m && m.recordId) {
        try { await B.xoa(m.recordId); } catch (e) { console.error('[nhac-gon] chưa xoá được dấu cũ:', e.message); }
      }
    }
  }

  /** Các khoá đang nhớ có tiền tố cho trước (ví dụ mọi sự cố "qc:"). */
  async function danhSach(tienTo = '') {
    await napBase();
    const ra = [];
    for (const k of nho.keys()) {
      if (k.endsWith('#2')) continue;
      const khoa = k.slice(TIEN_TO.length);
      if (khoa.startsWith(tienTo)) ra.push(khoa);
    }
    return ra;
  }

  /* Dọn dấu quá 30 ngày, mỗi lần tối đa 5 dòng cho nhẹ. */
  async function don() {
    const B = layBang();
    const han = bayGio() - GIU_MS;
    let n = 0;
    for (const [k, m] of nho) {
      if (m.luc >= han) continue;
      nho.delete(k);
      if (B && m.recordId) { try { await B.xoa(m.recordId); } catch (_) { /* để lần sau */ } }
      if (++n >= 5) break;
    }
  }

  return { nenBao, buocNhac, ghi, quen, danhSach, lucBao };
}

/* Một bộ nhớ dùng chung cho cả tiến trình, tạo khi cần lần đầu. */
let chung = null;
const mot = () => (chung || (chung = tao()));

module.exports = { tao, mot, TIEN_TO };
