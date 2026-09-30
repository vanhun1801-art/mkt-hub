'use strict';
/**
 * Báo vào nhóm khi có người nộp báo cáo NGÀY.
 *
 * Anh Hùng (30/09/2026): "khi nhân sự gửi báo cáo, ứng dụng ghi nhận và gửi một
 * thông báo với vai là Marketing Hub cho mọi người rằng ghi nhận báo cáo ngày
 * vào nhóm" — người gửi, đúng hạn hay trễ, số mục việc và thời lượng. Nội dung
 * báo cáo KHÔNG lên nhóm (quyết định 12/09 vẫn giữ: báo cáo nằm trong app).
 *
 * Ba điều cố ý:
 *   - BẬT SẴN (anh Hùng duyệt sau khi thử, 30/09). Tắt bằng BAO_CAO_TIN_NHOM=0 —
 *     không phải sửa mã, không phải deploy lại.
 *   - Chỉ báo LẦN NỘP ĐẦU. Mở phiếu ra sửa một chữ rồi bấm Nộp lại mà nhóm lại
 *     nhận thêm một tin thì chỉ sau một tuần không ai đọc tin này nữa.
 *   - KHÔNG chặn việc nộp. Phiếu đã ghi xong vào Base rồi; tin nhắn hỏng thì ghi
 *     log, người nộp vẫn thấy "đã nộp".
 */
const K = require('./ky');

const NHOM_MAC_DINH = 'oc_246eff4a1b9d2e711cedad1645830465';   // nhóm "Phòng MKT"
const nhomId = () => process.env.BAO_CAO_CHAT_ID || process.env.HUB_NHOM_MKT || NHOM_MAC_DINH;
const dangBat = () => process.env.BAO_CAO_TIN_NHOM !== '0';
const urlHub = () => (process.env.PUBLIC_URL || process.env.HUB_URL ||
  'https://mkt-hub-w6hi.onrender.com').replace(/\/+$/, '');

/** "17:05" giờ Việt Nam. */
function gioVN(ms) {
  const d = new Date(Number(ms) + 7 * 3600000);
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
}

/** "✅ 100%" khi xong, "60%" khi đang làm, kèm trạng thái nếu tạm dừng/huỷ. */
function veTienDo(d) {
  const pt = Math.max(0, Math.min(100, Math.round(Number(d.tienDoPt) || 0)));
  if (d.trangThai === 'Hoàn thành' || pt === 100) return '✅ ' + (pt || 100) + '%';
  if (d.trangThai === 'Tạm dừng' || d.trangThai === 'Huỷ') return pt + '% · ' + d.trangThai;
  return pt + '%';
}

/** Một hàng bảng: tên việc bên trái, tiến độ bên phải. */
function hang(trai, phai, dau) {
  const o = (chu, w, canh) => ({
    tag: 'column', width: 'weighted', weight: w, vertical_align: 'center',
    elements: [{ tag: 'div', text: { tag: 'lark_md', content: chu, text_align: canh } }],
  });
  return {
    tag: 'column_set', flex_mode: 'none', horizontal_spacing: 'default',
    background_style: dau ? 'grey' : 'default',
    columns: [o(trai, 3, 'left'), o(phai, 1, 'right')],
  };
}

/* Lark markdown hiểu *, _, ~ là định dạng — tên việc có mấy ký tự đó thì bị
 * nghiêng/gạch lung tung. */
const sachMd = (s) => String(s || '').replace(/([*_~`\[\]])/g, '\$1');

/**
 * Dữ liệu tin → thẻ Lark.
 * t = { ten, openId?, ngayMs, nopLuc, cham, dong: [{ congViec, tienDoPt, trangThai }] }
 *
 * Anh Hùng (30/09): liệt kê thành BẢNG tên việc + tiến độ, BỎ dòng thời lượng.
 */
function dungThe(t, { thu = false } = {}) {
  const c = t.cham || {};
  const dung = c.trangThai === 'dung-han';
  const han = dung ? '✅ Đúng hạn' : '⏰ ' + K.veLanNop(c).replace(/^trễ/, 'Trễ');
  const dong = (t.dong || []).filter((d) => String(d.congViec || '').trim());
  const dau = [
    /* Anh Hùng (30/09): tag luôn người gửi. `<at>` chỉ ăn với open_id CỦA APP ĐANG
     * GỬI (open_id riêng theo từng app) — id hub gửi xuống là của Marketing Hub,
     * đúng app gửi tin trên Render. Không có id thì lùi về tên chữ. */
    '**Người gửi:** ' + (/^ou_/.test(t.openId || '') ? '<at id=' + t.openId + '></at>' : (t.ten || 'Không rõ')),
    '**Ngày báo cáo:** ' + K.veNgayThu(t.ngayMs),
    '**Nộp lúc:** ' + gioVN(t.nopLuc) + ' · ' + han,
    '**Số mục công việc:** ' + dong.length,
  ];
  const bang = dong.length
    ? [hang('**Công việc**', '**Tiến độ**', true)]
      .concat(dong.map((d, i) => hang((i + 1) + '. ' + sachMd(d.congViec), veTienDo(d))))
    : [];
  return {
    config: { wide_screen_mode: true },
    header: {
      /* Anh Hùng (30/09): giữ icon, tiêu đề màu gần logo Marketing Hub (xanh
       * ngọc -> xanh lơ). Lark chỉ cho chọn màu có sẵn; turquoise là gần nhất.
       * Đúng hạn hay trễ đọc ở dòng "Nộp lúc", không đổi màu tiêu đề nữa. */
      template: 'turquoise',
      title: {
        tag: 'plain_text',
        content: (thu ? '[THỬ] ' : '') + '📋 Ghi nhận báo cáo ngày · ' + (t.ten || 'Không rõ'),
      },
    },
    elements: [
      { tag: 'div', text: { tag: 'lark_md', content: dau.join('\n') } },
    ].concat(bang.length ? [{ tag: 'hr' }] : [], bang, [
      {
        tag: 'action',
        actions: [{
          tag: 'button', type: 'default',
          text: { tag: 'plain_text', content: 'Mở app Báo cáo' },
          url: urlHub() + '/#/m/bao-cao',
        }],
      },
    ]),
  };
}

/** Lấy dữ liệu tin từ kết quả kho.luuNgay(). */
function tuKetQua(nguoi, r) {
  return {
    ten: nguoi.ten,
    openId: nguoi.id,
    ngayMs: r.ky.tu,
    nopLuc: Date.now(),
    cham: r.cham,
    dong: r.dong || [],
  };
}

/* ---------------- gửi ---------------- */

let tinApp = null;

/**
 * Gửi thẻ tới { chatId } hoặc { email } hoặc { openId }.
 * Render (api): bot Marketing Hub. Máy cá nhân (cli): bot của lark-cli — tên
 * người gửi khác, nên chỉ dùng để xem thử hình thẻ.
 */
async function guiThe(dep, dich, card, khoa) {
  const { cfg, lark } = dep;
  if (cfg.appId && cfg.appSecret) {
    if (!tinApp) {
      tinApp = require('../lark-chung/tin-lark').tao({
        appId: cfg.appId, appSecret: cfg.appSecret, apiHost: cfg.apiHost, tenApp: 'Marketing Hub',
      });
    }
    return tinApp.gui({ chatId: dich.chatId, email: dich.email, userId: dich.openId, card, khoa });
  }
  try {
    const a = ['im', '+messages-send', '--as', 'bot'];
    if (dich.chatId) a.push('--chat-id', dich.chatId);
    else if (dich.openId) a.push('--user-id', dich.openId);
    else return { ok: false, loi: 'Chạy trên máy chỉ gửi thử được theo open_id hoặc nhóm' };
    a.push('--msg-type', 'interactive', '--content', JSON.stringify(card));
    if (khoa) a.push('--idempotency-key', String(khoa).slice(0, 50));
    await lark.cli(a, { retries: 1 });
    return { ok: true, guiTu: 'bot lark-cli trên máy (không phải Marketing Hub)' };
  } catch (e) {
    return { ok: false, loi: String(e.message || e).slice(0, 400) };
  }
}

/**
 * Gọi sau khi luuNgay() nộp xong. Không bao giờ ném.
 * Trả lý do bỏ qua để log/test đọc được.
 */
async function baoNop(dep, nguoi, r) {
  try {
    if (!dangBat()) return { ok: false, bo: 'tắt (BAO_CAO_TIN_NHOM=0)' };
    if (!r || !r.cham || r.soLanNop !== 1) return { ok: false, bo: 'không phải lần nộp đầu' };
    /* Máy cá nhân không có khoá Marketing Hub → sẽ gửi bằng bot lark-cli, tức
     * nhóm thấy một người gửi lạ. Chỉ gửi khi ép bằng BAO_CAO_TIN_NHOM=1. */
    if (!(dep.cfg.appId && dep.cfg.appSecret) && process.env.BAO_CAO_TIN_NHOM !== '1') {
      return { ok: false, bo: 'chạy trên máy, không có khoá Marketing Hub' };
    }
    const card = dungThe(tuKetQua(nguoi, r));
    const kq = await guiThe(dep, { chatId: nhomId() }, card, 'bcn-' + r.ma);
    if (!kq.ok) console.error('[tin nhóm] ' + r.ma + ' -> ' + kq.loi);
    return kq;
  } catch (e) {
    console.error('[tin nhóm] ' + (r && r.ma) + ' -> ' + e.message);
    return { ok: false, loi: e.message };
  }
}

module.exports = { dungThe, veTienDo, tuKetQua, guiThe, baoNop, nhomId, dangBat, gioVN };
