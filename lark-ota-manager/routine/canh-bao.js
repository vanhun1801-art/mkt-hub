'use strict';
/**
 * Nhắn riêng anh Hùng khi việc đọc hộp pito@ / báo nhóm Booking KS hỏng lâu.
 *
 * 04/11/2026 kênh "Zalo" chưa có trong ô chọn Base làm mọi lượt đồng bộ hỏng từ
 * 18:15 tới sáng hôm sau mà không ai biết, đơn mới không vào nhóm. Từ 05/11:
 *  - lỗi kéo dài liên tục từ 10 phút → một thẻ đỏ "đang hỏng";
 *  - vẫn hỏng thì nhắc lại mỗi 3 giờ (không nhắn mỗi phút);
 *  - chạy lại bình thường sau khi đã báo hỏng → một thẻ xanh "đã chạy lại".
 * Lỗi chập chờn tự hết trong 10 phút thì không nhắn gì.
 *
 * Phần quyết định (`xet`) là hàm thuần để test; phần gửi đi qua lark-chung/gui-anh-hung
 * (trong hub: bot Marketing Hub, tới open_id của anh Hùng trong bảng Phân quyền).
 */

const CHO_MS = 10 * 60e3;
const NHAC_LAI_MS = 3 * 3600e3;

/** Trạng thái giữ trong bộ nhớ: Render khởi động lại thì đếm lại từ đầu. */
const tt = { tu: 0, daBao: 0, loi: '' };

/**
 * @param {string} loi  lỗi của lượt vừa chạy ('' = ổn)
 * @returns {null | {loai:'hong'|'khoi', loi?:string, tu?:number}}
 *   Gọi `daGui(viec)` sau khi gửi được, để ghi nhận.
 */
function xet(loi, nay = Date.now(), s = tt) {
  if (loi) {
    if (!s.tu) s.tu = nay;
    s.loi = loi;
    if (nay - s.tu < CHO_MS) return null;
    if (s.daBao && nay - s.daBao < NHAC_LAI_MS) return null;
    return { loai: 'hong', loi, tu: s.tu };
  }
  const daBao = s.daBao;
  const tu = s.tu;
  s.tu = 0; s.loi = '';
  if (!daBao) return null;
  return { loai: 'khoi', tu };
}

function daGui(viec, nay = Date.now(), s = tt) {
  if (viec.loai === 'hong') s.daBao = nay;
  else s.daBao = 0;
}

const gioVN = (ms) => new Date(ms + 7 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');

function dungThe(viec, hop) {
  const hong = viec.loai === 'hong';
  return {
    config: { wide_screen_mode: true },
    header: {
      template: hong ? 'red' : 'green',
      title: { tag: 'plain_text', content: hong ? 'Booking khách sạn: chưa đọc được thư mới' : 'Booking khách sạn: đã chạy lại' },
    },
    elements: [{
      tag: 'markdown',
      content: hong
        ? 'Từ **' + gioVN(viec.tu) + '** app chưa đọc hoặc chưa ghi được booking mới từ hộp ' + hop +
          ', nên booking mới chưa vào nhóm Booking KS.\n\n**Lỗi:** ' + String(viec.loi).slice(0, 400)
        : 'Đọc thư và báo nhóm Booking KS đã bình thường lại (hỏng từ ' + gioVN(viec.tu) +
          '). Booking bị chậm trong lúc hỏng đã được gửi bù vào nhóm.',
    }],
  };
}

/** Xét lượt vừa chạy và gửi thẻ nếu cần. Không ném. */
async function sauLuot(loi, { hop = '', gui, nay = Date.now() } = {}) {
  const viec = xet(loi, nay);
  if (!viec) return null;
  try {
    const guiAnh = gui || ((the, khoa) => require('../../lark-chung/gui-anh-hung').gui({ card: the, khoa }));
    const khoa = 'rt-canh-' + viec.loai + '-' + viec.tu + '-' + Math.floor(nay / NHAC_LAI_MS);
    const r = await guiAnh(dungThe(viec, hop), khoa);
    if (r && (r.ok || r.boQua)) daGui(viec, nay);
    else console.error('[routine] gửi cảnh báo hỏng:', r && r.loi);
    return { ...viec, gui: r };
  } catch (e) {
    console.error('[routine] gửi cảnh báo hỏng:', e.message);
    return null;
  }
}

module.exports = { xet, daGui, dungThe, sauLuot, CHO_MS, NHAC_LAI_MS };
