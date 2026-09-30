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
/* Công tắc cứng của máy chủ. Công tắc mềm (quản lý bật/tắt trong app) nằm
 * trong thiết lập 'tin-nhom' bên dưới — biến môi trường =0 thì thắng tất cả. */
const dangBat = () => process.env.BAO_CAO_TIN_NHOM !== '0';

/* ---------------- thiết lập gửi tin (tab Thiết lập) ----------------
 * Anh Hùng (30/09): "cho anh thiết lập gửi nhóm hay gửi cá nhân, hay điều chỉnh
 * mẫu, bật hay tắt" — trong tab Thiết lập, lưu bảng Base "Thiết lập" khoá
 * 'tin-nhom'. Người nhận riêng giữ open_id CỦA APP MARKETING HUB (open_id riêng
 * theo từng app; theo email thì bot này bị Lark trả 230001). */
const KHOA_TIN = 'tin-nhom';
const TIN_MAC_DINH = {
  bat: true,
  dich: 'nhom',                       // 'nhom' | 'ca-nhan' | 'ca-hai'
  nhomId: '',                          // rỗng = nhóm Phòng MKT mặc định
  nguoiNhan: [],                       // [{ ten, openId }]
  tieuDe: '📋 BCCV Ngày - {ten} - {ngay}',
  tagNguoi: true,
  hienBang: true,
  hienDanhGia: true,
  /* Anh Hùng (30/09): "nếu có vướng mắc tới thì thông báo cho anh luôn". Nhắn
   * RIÊNG người trong danh sách mỗi khi phiếu nộp có ô "Cần hỗ trợ" mới hoặc
   * đổi nội dung. open_id là của app Marketing Hub (lấy từ bảng Phân quyền). */
  baoHoTro: true,
  nhanHoTro: [{ ten: 'Lê Văn Hùng', openId: 'ou_49d2cc26b43058bc931c236ed8313d0b' }],
};

function lamTin(x) {
  const g = x && typeof x === 'object' ? x : {};
  const s = (v, md, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n || 200) : md);
  return {
    bat: g.bat === undefined ? TIN_MAC_DINH.bat : g.bat !== false,
    dich: ['nhom', 'ca-nhan', 'ca-hai'].includes(g.dich) ? g.dich : TIN_MAC_DINH.dich,
    nhomId: /^oc_[0-9a-z]+$/i.test(String(g.nhomId || '').trim()) ? String(g.nhomId).trim() : '',
    nguoiNhan: (Array.isArray(g.nguoiNhan) ? g.nguoiNhan : [])
      .filter((u) => u && /^ou_[0-9a-z]+$/i.test(String(u.openId || '')))
      .slice(0, 20).map((u) => ({ ten: String(u.ten || '').slice(0, 80), openId: String(u.openId) })),
    tieuDe: s(g.tieuDe, TIN_MAC_DINH.tieuDe, 120),
    tagNguoi: g.tagNguoi === undefined ? true : g.tagNguoi !== false,
    hienBang: g.hienBang === undefined ? true : g.hienBang !== false,
    hienDanhGia: g.hienDanhGia === undefined ? true : g.hienDanhGia !== false,
    baoHoTro: g.baoHoTro === undefined ? true : g.baoHoTro !== false,
    /* Chưa từng lưu (undefined) → người nhận mặc định; đã lưu mảng rỗng → tôn trọng. */
    nhanHoTro: (Array.isArray(g.nhanHoTro) ? g.nhanHoTro : TIN_MAC_DINH.nhanHoTro)
      .filter((u) => u && /^ou_[0-9a-z]+$/i.test(String(u.openId || '')))
      .slice(0, 20).map((u) => ({ ten: String(u.ten || '').slice(0, 80), openId: String(u.openId) })),
  };
}

const docTin = (force) => require('./chuan').docKhoa(KHOA_TIN, lamTin, force);
const luuTin = (x, nguoi) => require('./chuan').luuKhoa(KHOA_TIN, lamTin(x), nguoi);

/** Danh sách đích gửi theo thiết lập. */
function dichGui(tin) {
  const ds = [];
  if (tin.dich !== 'ca-nhan') ds.push({ chatId: tin.nhomId || nhomId(), ten: 'nhóm' });
  if (tin.dich !== 'nhom') for (const u of tin.nguoiNhan) ds.push({ openId: u.openId, ten: u.ten });
  return ds;
}

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
const sachMd = (s) => String(s || '').replace(/([*_~`\[\]])/g, '\\$1');

/**
 * Dữ liệu tin → thẻ Lark.
 * t = { ten, openId?, ngayMs, nopLuc, cham, dong: [{ congViec, tienDoPt, trangThai }] }
 *
 * Anh Hùng (30/09): liệt kê thành BẢNG tên việc + tiến độ, BỎ dòng thời lượng.
 */
function dungThe(t, { thu = false, mau = TIN_MAC_DINH } = {}) {
  const c = t.cham || {};
  const dung = c.trangThai === 'dung-han';
  /* Anh Hùng (30/09): trễ phải có tính răn đe — ⏰ quá hiền. Còi 🚨 + chữ đỏ
   * đậm viết hoa để cả nhóm nhìn là thấy ngay. */
  const han = dung ? '✅ Đúng hạn'
    : "🚨 <font color='red'>**" + K.veLanNop(c).toUpperCase() + '**</font>';
  const dong = (t.dong || []).filter((d) => String(d.congViec || '').trim());
  const dau = [
    /* Anh Hùng (30/09): tag luôn người gửi. `<at>` chỉ ăn với open_id CỦA APP ĐANG
     * GỬI (open_id riêng theo từng app) — id hub gửi xuống là của Marketing Hub,
     * đúng app gửi tin trên Render. Không có id thì lùi về tên chữ. */
    '**Người gửi:** ' + (mau.tagNguoi !== false && /^ou_/.test(t.openId || '')
      ? '<at id=' + t.openId + '></at>' : (t.ten || 'Không rõ')),
    /* Thứ tự anh Hùng chốt 30/09: Người gửi → Số lượng đầu công việc → Nộp lúc.
     * Ngày báo cáo đã lên tiêu đề nên không còn dòng riêng. */
    '**Số lượng đầu công việc:** ' + dong.length,
    '**Nộp lúc:** ' + gioVN(t.nopLuc) + ' · ' + han,
  ];
  const bang = dong.length && mau.hienBang !== false
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
        /* Anh Hùng chốt 30/09: "BCCV Ngày - Tên - Ngày" (BCCV = báo cáo công
         * việc; Ngày cuối là NGÀY BÁO CÁO, không phải ngày nộp). */
        content: (thu ? '[THỬ] ' : '') + String(mau.tieuDe || TIN_MAC_DINH.tieuDe)
          .replace(/\{ten\}/g, t.ten || 'Không rõ').replace(/\{ngay\}/g, K.veNgay(t.ngayMs)),
      },
    },
    elements: [
      { tag: 'div', text: { tag: 'lark_md', content: dau.join('\n') } },
    /* Anh Hùng (30/09): không kèm nút bấm — thẻ chỉ để báo, không để mở app. */
    ].concat(bang.length ? [{ tag: 'hr' }] : [], bang,
      /* Anh Hùng (30/09): "một sự đánh giá ở dòng cuối" theo chuẩn vị trí. */
      (t.loiNhan && t.loiNhan.length)
        ? [{ tag: 'hr' }, { tag: 'div', text: { tag: 'lark_md', content: '**Đánh giá:** ' + t.loiNhan.join('\n') } }]
        : []),
  };
}

/**
 * Thẻ phản hồi vướng mắc — nhắn RIÊNG cho người nêu. Anh Hùng (30/09): "gửi cho
 * nhân sự biết khi vấn đề đã được xử lý hoặc chưa xử lý được tại thời điểm".
 * p = { trangThai: 'xong' | 'chua-duoc', noi, ngayMs, ghiChu, nguoiXuLy }
 */
function dungThePhanHoi(p) {
  const xong = p.trangThai === 'xong';
  /* Thứ tự anh Hùng chốt 30/09: Tình trạng → Người phản hồi → Vấn đề bạn nêu,
   * rồi TÁCH RIÊNG bên dưới phần hướng dẫn anh viết. */
  const dau = [
    '**Tình trạng:** ' + (xong ? '✅ Đã xử lý' : '⏳ Chưa xử lý được tại thời điểm này'),
    '**Người phản hồi:** ' + sachMd(p.nguoiXuLy || 'Quản lý'),
    '**Vấn đề bạn nêu** (báo cáo ' + K.veNgay(p.ngayMs) + '):',
    sachMd(String(p.noi || '').trim().slice(0, 600)),
  ];
  /* Ghi chú là markdown rút gọn do ô soạn có định dạng tạo ra (đậm, nghiêng,
   * link, danh sách) — GIỮ nguyên để Lark vẽ đúng; chỉ gỡ thẻ HTML lạ. */
  const ghi = String(p.ghiChu || '').replace(/<[^>]*>/g, '').trim().slice(0, 3000);
  const duoi = [];
  if (ghi) duoi.push((xong ? '**Hướng dẫn:**' : '**Lý do / hướng xử lý:**'), ghi);
  if (!xong) duoi.push((ghi ? '\n' : '') + 'Quản lý đã ghi nhận và sẽ theo dõi tiếp. Nếu cần gấp, bạn nhắn trực tiếp nhé.');
  return {
    config: { wide_screen_mode: true },
    header: {
      template: xong ? 'turquoise' : 'orange',
      title: { tag: 'plain_text', content: (xong ? '✅ Vướng mắc đã được xử lý' : '⏳ Vướng mắc chưa xử lý được') },
    },
    elements: [{ tag: 'div', text: { tag: 'lark_md', content: dau.join('\n') } }]
      .concat(duoi.length ? [{ tag: 'hr' }, { tag: 'div', text: { tag: 'lark_md', content: duoi.join('\n') } }] : []),
  };
}

/** Thẻ báo quản lý có vướng mắc mới. p = { ten, loaiKy, nhan, noi, sua } */
function dungTheHoTro(p) {
  const dong = [
    '**Người nêu:** ' + sachMd(p.ten || 'Không rõ'),
    '**Báo cáo:** ' + sachMd(p.loaiKy + ' ' + p.nhan),
    '',
    sachMd(String(p.noi || '').trim().slice(0, 1200)),
    '',
    'Xử lý ở app Báo cáo → tab **Cần hỗ trợ** — người nêu sẽ nhận phản hồi của bạn.',
  ];
  return {
    config: { wide_screen_mode: true },
    header: { template: 'orange', title: { tag: 'plain_text',
      content: (p.sua ? '🆘 Vướng mắc vừa cập nhật · ' : '🆘 Vướng mắc mới · ') + (p.ten || '') } },
    elements: [{ tag: 'div', text: { tag: 'lark_md', content: dong.join('\n') } }],
  };
}

/**
 * Gọi sau khi nộp phiếu (ngày/tuần/tháng). Nhắn khi ô "Cần hỗ trợ" có nội dung
 * THẬT và khác lần trước — sửa phiếu chỗ khác không nhắn lại. Không bao giờ ném.
 */
async function baoHoTro(dep, nguoi, loaiKy, r, noi, laThat) {
  try {
    if (!dangBat()) return { ok: false, bo: 'tắt cứng' };
    const moi = String(noi || '').trim(), cu = String((r && r.canHoTroCu) || '').trim();
    if (!laThat(moi)) return { ok: false, bo: 'không có vướng mắc' };
    if (moi === cu) return { ok: false, bo: 'vướng mắc không đổi' };
    if (!(dep.cfg.appId && dep.cfg.appSecret) && process.env.BAO_CAO_TIN_NHOM !== '1') {
      return { ok: false, bo: 'chạy trên máy, không có khoá Marketing Hub' };
    }
    const tin = dep.tin || await docTin();
    if (!tin.baoHoTro || !tin.nhanHoTro.length) return { ok: false, bo: 'quản lý tắt báo vướng mắc' };
    const card = dungTheHoTro({ ten: nguoi.ten || nguoi.email, loaiKy, nhan: K.veNgay(r.ky.tu), noi: moi, sua: laThat(cu) });
    const kqs = [];
    for (const u of tin.nhanHoTro) {
      const kq = await guiThe(dep, { openId: u.openId }, card, 'hta-' + r.ma + '-' + Date.now() + '-' + kqs.length);
      if (!kq.ok) console.error('[vướng mắc] nhắn ' + u.ten + ' hỏng: ' + kq.loi);
      kqs.push(kq);
    }
    return { ok: kqs.some((x) => x.ok), soNguoi: kqs.length };
  } catch (e) {
    console.error('[vướng mắc] ' + e.message);
    return { ok: false, loi: e.message };
  }
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
    const tin = dep.tin || await docTin();
    if (!tin.bat) return { ok: false, bo: 'quản lý đã tắt trong Thiết lập' };
    /* Máy cá nhân không có khoá Marketing Hub → sẽ gửi bằng bot lark-cli, tức
     * nhóm thấy một người gửi lạ. Chỉ gửi khi ép bằng BAO_CAO_TIN_NHOM=1. */
    if (!(dep.cfg.appId && dep.cfg.appSecret) && process.env.BAO_CAO_TIN_NHOM !== '1') {
      return { ok: false, bo: 'chạy trên máy, không có khoá Marketing Hub' };
    }
    const t = tuKetQua(nguoi, r);
    /* Đánh giá theo chuẩn vị trí — dòng cuối thẻ. Hỏng thì bỏ dòng, không bỏ tin. */
    if (dep.danhGia) {
      const CH = require('./chuan');
      const chuan = await CH.doc();
      if (tin.hienDanhGia) {
        const kq = await dep.danhGia(nguoi, r.ky.tu, r.dong || [], chuan);
        t.loiNhan = CH.loiNhanThe(kq, chuan, { tre: !!(r.cham && r.cham.trangThai === 'tre') });
      }
    }
    const card = dungThe(t, { mau: tin });
    const dich = dichGui(tin);
    if (!dich.length) return { ok: false, bo: 'chưa chọn người nhận' };
    const kqs = [];
    for (let i = 0; i < dich.length; i++) {
      const kq = await guiThe(dep, dich[i], card, 'bcn-' + i + '-' + r.ma);
      if (!kq.ok) console.error('[tin nhóm] ' + r.ma + ' → ' + dich[i].ten + ': ' + kq.loi);
      kqs.push(kq);
    }
    return Object.assign({ ok: kqs.some((x) => x.ok), soDich: dich.length }, kqs[0]);
  } catch (e) {
    console.error('[tin nhóm] ' + (r && r.ma) + ' -> ' + e.message);
    return { ok: false, loi: e.message };
  }
}

module.exports = { dungThe, veTienDo, tuKetQua, guiThe, baoNop, nhomId, dangBat, gioVN,
  TIN_MAC_DINH, lamTin, docTin, luuTin, dichGui, dungThePhanHoi, dungTheHoTro, baoHoTro };
