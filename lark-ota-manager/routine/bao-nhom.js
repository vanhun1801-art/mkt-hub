'use strict';
/**
 * Báo booking khách sạn Routine Hospitality vào nhóm Lark "Booking KS".
 *
 *   Booking mới          → một tin dạng bài, đúng khuôn anh Hùng vẫn gửi tay
 *                          (Kênh - Khách <quốc gia>; mã, tên, ngày ở, loại phòng,
 *                          số khách, số tiền) cộng yêu cầu đặc biệt và lúc đặt.
 *   Huỷ / OTA sửa / đổi phòng → trả lời vào LUỒNG của tin đó, để CSKH ghi chú
 *                          chăm sóc ngay dưới cùng một tin như hiện nay.
 *
 * Nhớ đã báo gì trong hai cột của Base: "Tin nhóm" (message_id) và "Đã báo nhóm"
 * (các dòng lịch sử đã báo). Nhờ vậy máy nào ghi lịch sử cũng được, máy gửi tin
 * (Render) vẫn biết còn gì chưa báo. `uuid` của Lark chặn thêm việc gửi trùng.
 *
 * Phần soạn tin là hàm thuần (test được); phần gửi nhận `tin` từ lark-chung/tin-lark.
 */
const cfg = require('../config');
const bang = require('./bang');

const R = cfg.routine;

const QUOC_GIA = {
  'south korea': 'Hàn Quốc', korea: 'Hàn Quốc', vietnam: 'Việt Nam', 'viet nam': 'Việt Nam', china: 'Trung Quốc',
  taiwan: 'Đài Loan', 'hong kong': 'Hồng Kông', japan: 'Nhật Bản', singapore: 'Singapore', malaysia: 'Malaysia',
  thailand: 'Thái Lan', philippines: 'Philippines', indonesia: 'Indonesia', cambodia: 'Campuchia', india: 'Ấn Độ',
  'united states': 'Mỹ', usa: 'Mỹ', 'united kingdom': 'Anh', australia: 'Úc', 'new zealand': 'New Zealand',
  canada: 'Canada', russia: 'Nga', 'russian federation': 'Nga', kazakhstan: 'Kazakhstan', germany: 'Đức',
  france: 'Pháp', italy: 'Ý', spain: 'Tây Ban Nha', netherlands: 'Hà Lan', sweden: 'Thuỵ Điển',
  israel: 'Israel', poland: 'Ba Lan', ukraine: 'Ukraine', mongolia: 'Mông Cổ',
};
const tenQuocGia = (s) => QUOC_GIA[String(s || '').trim().toLowerCase()] || String(s || '').trim();

const vnd = (n) => Math.round(Number(n)).toLocaleString('vi-VN') + ' đ';
const dmy = (s) => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '?');
const hai = (n) => String(n).padStart(2, '0');
const cachNgay = (a, b) => Math.round((Date.parse(b.slice(0, 10) + 'T00:00:00Z') - Date.parse(a.slice(0, 10) + 'T00:00:00Z')) / 864e5);

/** Dòng lịch sử nào cần báo vào luồng, và nhóm của nó (huỷ báo một lần dù có hai thư). */
function loaiDong(dong) {
  if (/· (Huỷ|Agoda báo huỷ)$/.test(dong)) return 'huy';
  if (/· OTA sửa đơn$/.test(dong)) return 'sua';
  if (/· Đổi phòng /.test(dong)) return 'doi-phong';
  if (/· Khách nhắn: /.test(dong)) return 'hoi';
  return '';
}

/** Tiêu đề kiểu "Agoda - Khách Hàn Quốc". */
function tieuDe(b) {
  const qg = tenQuocGia(b.quocGia);
  return (b.kenh || 'Booking') + (qg ? ' - Khách ' + qg : ' - Booking mới');
}

/* Ghi chú OTA của Booking.com có dòng "OTA Commission: …" là số tiền nội bộ, bỏ ra. */
const ghiChuSach = (s) => String(s || '').split('\n').filter((x) => x.trim() && !/^OTA Commission:/i.test(x.trim())).join('; ');

/** Booking → nội dung tin dạng bài của Lark. */
function soanBai(b) {
  const dong = [];
  const them = (nhan, gt) => { if (gt) dong.push([{ tag: 'text', text: '• ' }, { tag: 'text', text: nhan + ': ', style: ['bold'] }, { tag: 'text', text: gt }]); };

  them('Mã booking', (b.maOta || b.ma) + (b.maOta && b.ma && !b.ma.startsWith('OTA-') ? '  (GoHost ' + b.ma + ')' : ''));
  them('Tên khách', b.tenKhach);
  if (b.nhanPhong) them('Thời gian lưu trú', dmy(b.nhanPhong) + ' - ' + dmy(b.traPhong) + (b.soDem ? ' (' + b.soDem + ' đêm)' : ''));
  them('Loại phòng', [b.hangPhong, b.phong ? 'phòng ' + b.phong : ''].filter(Boolean).join(', '));
  const khach = b.nguoiLon ? hai(b.nguoiLon) + ' NL' + (b.treEm ? ' + ' + hai(b.treEm) + ' TE' : '') : (b.soKhach ? b.soKhach + ' khách' : '');
  them('Số lượng khách', khach);
  if (b.soTien != null) {
    const ghi = b.kenh === 'Agoda' ? ' (Agoda thanh toán)'
      : b.kenh === 'Booking.com' ? ' (khách trả qua Booking.com)'
        : b.daThanhToan ? ' (đã thanh toán ' + vnd(b.daThanhToan) + ')' : '';
    them('Số tiền', vnd(b.soTien) + ghi);
  }
  them('Yêu cầu', ghiChuSach(b.ghiChu));
  if (b.ngayDat && b.ngayDat.length > 10 && b.nhanPhong) {
    const truoc = cachNgay(b.ngayDat, b.nhanPhong);
    them('Đặt lúc', b.ngayDat.slice(11, 16) + ' ' + b.ngayDat.slice(8, 10) + '/' + b.ngayDat.slice(5, 7)
      + (truoc > 0 ? ', trước ' + truoc + ' ngày' : truoc === 0 ? ', nhận phòng trong ngày' : ''));
  }
  /* Không kèm link vào app: nhóm chỉ cần tin để đọc và trả lời (anh Hùng, 04/11/2026). */
  return { zh_cn: { title: tieuDe(b), content: dong } };
}

/** Các dòng lịch sử mới cần báo → một câu trả lời (chữ thường). `banDich`: dòng → tiếng Việt. */
function soanTraLoi(b, dongs, banDich = {}) {
  const cau = [];
  for (const d of dongs) {
    const luc = d.slice(11, 16) + ' ' + d.slice(8, 10) + '/' + d.slice(5, 7);
    const loai = loaiDong(d);
    if (loai === 'huy') cau.push('Khách đã huỷ đặt phòng (' + (b.kenh || 'OTA') + ' báo lúc ' + luc + ').');
    else if (loai === 'sua') {
      cau.push('OTA sửa đơn lúc ' + luc + '. Hiện tại: ' + dmy(b.nhanPhong) + ' - ' + dmy(b.traPhong)
        + (b.soDem ? ' (' + b.soDem + ' đêm)' : '') + (b.soTien != null ? ', ' + vnd(b.soTien) : '') + '.');
    } else if (loai === 'doi-phong') {
      const m = /Đổi phòng (.+)$/.exec(d);
      cau.push('Đổi phòng ' + (m ? m[1] : '') + ' lúc ' + luc + '.');
    } else if (loai === 'hoi') {
      /* Song song hai ngôn ngữ (anh Hùng, 04/11/2026): tin gốc, rồi bản tiếng Việt. */
      cau.push('Khách nhắn lúc ' + luc + ': ' + d.split('· Khách nhắn: ')[1] + (banDich[d] ? '\n→ ' + banDich[d] : ''));
    }
  }
  return cau.join('\n');
}

/* Có chữ cái riêng của tiếng Việt thì coi là tiếng Việt, không dịch. */
const laTiengViet = (s) => /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(s);

/**
 * Dịch tin khách sang tiếng Việt bằng Claude API (hàm dịch của app Hộp thư).
 * Chưa có ANTHROPIC_API_KEY hoặc dịch lỗi thì bỏ qua: tin gốc vẫn được gửi.
 */
async function dichTin(dongs, { dichFn } = {}) {
  const ra = {};
  let ai = null;
  if (!dichFn) {
    try { ai = require('../../lark-hop-thu/ai'); } catch (_) { return ra; }
    if (!ai.coKhoa()) return ra;
    dichFn = (chu) => ai.dich(chu, 'vi');
  }
  for (const d of dongs) {
    if (loaiDong(d) !== 'hoi') continue;
    const goc = d.split('· Khách nhắn: ')[1] || '';
    if (!goc || laTiengViet(goc)) continue;
    try { const vi = String(await dichFn(goc)).trim(); if (vi && vi !== goc) ra[d] = vi.replace(/\s*\n\s*/g, ' / '); } catch (_) { /* gửi bản gốc */ }
  }
  return ra;
}

/**
 * Việc cần làm với từng đơn. `nay` = Date.now().
 *   moi: chưa có tin nhóm, chưa huỷ, đặt trong 24 giờ qua. Đơn Agoda còn đợi tối
 *        đa 10 phút cho thư Agoda (quốc gia, loại phòng, gói vé) về kịp.
 *   traLoi: đã có tin nhóm, có dòng huỷ/sửa/đổi phòng chưa báo.
 */
function canBao(b, nay = Date.now()) {
  const dongs = String(b.lichSu || '').split('\n').filter(Boolean);
  const daBao = new Set(String(b.daBaoNhom || '').split('\n').filter(Boolean));
  if (!b.tinNhom) {
    if (b.trangThai === 'Đã huỷ' || !b.ngayDat || b.ngayDat.length <= 10) return null;
    if (R.baoTu && b.ngayDat < R.baoTu) return null;
    const tuoi = nay - Date.parse(b.ngayDat.replace(' ', 'T') + ':00+07:00');
    if (!(tuoi >= 0 && tuoi <= 24 * 3600e3)) return null;
    if (b.kenh === 'Agoda' && !b.quocGia && tuoi < 10 * 60e3) return null;
    /* Tin khách nhắn trước lúc gửi tin booking chưa tính là đã báo: lượt sau trả lời vào luồng. */
    return { loai: 'moi', dongs: dongs.filter((d) => loaiDong(d) !== 'hoi') };
  }
  const chua = dongs.filter((d) => loaiDong(d) && !daBao.has(d));
  if (!chua.length) return null;
  /* Huỷ đã báo rồi thì thư huỷ thứ hai (GoHost + Agoda) chỉ đánh dấu, không báo lại. */
  const daHuy = [...daBao].some((d) => loaiDong(d) === 'huy');
  const canNoi = chua.filter((d, i) => !(loaiDong(d) === 'huy' && (daHuy || chua.findIndex((x) => loaiDong(x) === 'huy') < i)));
  return { loai: 'traLoi', dongs: chua, canNoi };
}

let tinApp = null;
function tin() {
  if (!tinApp) tinApp = require('../../lark-chung/tin-lark').tao({ appId: cfg.appId, appSecret: cfg.appSecret, apiHost: cfg.apiHost, tenApp: 'Marketing Hub' });
  return tinApp;
}

/** Có bật báo nhóm ở máy này không. Mặc định chỉ bản chạy chung (Render) gửi. */
const batBao = () => Boolean(R.nhomChatId && R.baoNhom && cfg.appId && cfg.appSecret);

/** Chạy một lượt: gửi mọi tin còn thiếu. Trả { gui, loi[] }. Không ném. */
async function chay({ guiTin = tin() } = {}) {
  const kq = { gui: 0, loi: [] };
  if (!batBao()) return kq;
  let rows;
  try { rows = await bang.doc({ force: true }); } catch (e) { kq.loi.push(e.message); return kq; }
  for (const b of rows) {
    const viec = canBao(b);
    if (!viec) continue;
    try {
      if (viec.loai === 'moi') {
        const r = await guiTin.gui({ chatId: R.nhomChatId, post: soanBai(b), khoa: 'rt-moi-' + b.ma });
        if (!r.ok) { kq.loi.push(b.ma + ': ' + r.loi); continue; }
        await bang.ghi(b.id, { tinNhom: r.msgId, daBaoNhom: viec.dongs.join('\n') });
        kq.gui++;
      } else {
        if (viec.canNoi.length) {
          const text = soanTraLoi(b, viec.canNoi, await dichTin(viec.canNoi));
          const khoa = 'rt-tl-' + b.ma + '-' + viec.canNoi.map((d) => d.slice(0, 16).replace(/\D/g, '')).join('').slice(-30);
          const r = await guiTin.gui({ traLoi: b.tinNhom, trongLuong: true, text, khoa });
          if (!r.ok) { kq.loi.push(b.ma + ': ' + r.loi); continue; }
          kq.gui++;
        }
        const daBao = [...new Set(String(b.daBaoNhom || '').split('\n').filter(Boolean).concat(viec.dongs))];
        await bang.ghi(b.id, { daBaoNhom: daBao.join('\n') });
      }
    } catch (e) {
      kq.loi.push(b.ma + ': ' + (e.message || e));
    }
  }
  return kq;
}

/**
 * Gửi thử tin của một đơn cho RIÊNG một người (open_id theo app Marketing Hub),
 * không vào nhóm, không ghi gì vào Base. Mặc định lấy đơn chưa huỷ đặt gần nhất.
 */
async function guiThu({ userId, ma = '', guiTin = tin() }) {
  if (!cfg.appId || !cfg.appSecret) return { ok: false, loi: 'Máy này không có khoá app Marketing Hub. Gửi thử trên bản chạy chung.' };
  const rows = await bang.doc();
  const b = ma ? rows.find((x) => x.ma === ma || x.maOta === ma) : rows.find((x) => x.trangThai !== 'Đã huỷ' && x.ngayDat);
  if (!b) return { ok: false, loi: 'Không tìm thấy đơn ' + ma };
  const bai = soanBai(b);
  bai.zh_cn.title = '[Thử] ' + bai.zh_cn.title;
  const r = await guiTin.gui({ userId, post: bai });
  if (!r.ok) return { ...r, ma: b.ma };
  /* Thử luôn phần trả lời trong luồng bằng tối đa 3 dòng huỷ/sửa/khách nhắn gần nhất. */
  const dongs = String(b.lichSu || '').split('\n').filter((d) => loaiDong(d)).slice(-3);
  let traLoi = null;
  if (dongs.length) traLoi = await guiTin.gui({ traLoi: r.msgId, trongLuong: true, text: soanTraLoi(b, dongs, await dichTin(dongs)) });
  return { ...r, ma: b.ma, traLoi };
}

/**
 * Gửi bù tin booking vào nhóm cho đơn bị lỡ (đặt trước mốc baoTu, quá 24 giờ, hoặc
 * lượt đọc thư hỏng). Chỉ quản lý gọi, theo từng mã. Đơn đã có tin nhóm thì không gửi
 * lại. Mọi dòng lịch sử hiện có coi như đã báo, các thư sau mới trả lời vào luồng.
 */
async function guiBu({ ma, guiTin = tin() }) {
  if (!batBao()) return { ok: false, loi: 'Máy này không gửi tin nhóm. Gửi bù trên bản chạy chung.' };
  const rows = await bang.doc({ force: true });
  const b = rows.find((x) => x.ma === ma || x.maOta === ma);
  if (!b) return { ok: false, loi: 'Không tìm thấy đơn ' + ma };
  if (b.tinNhom) return { ok: false, loi: 'Đơn ' + b.ma + ' đã có tin trong nhóm.' };
  const r = await guiTin.gui({ chatId: R.nhomChatId, post: soanBai(b), khoa: 'rt-moi-' + b.ma });
  if (!r.ok) return { ...r, ma: b.ma };
  await bang.ghi(b.id, { tinNhom: r.msgId, daBaoNhom: String(b.lichSu || '').split('\n').filter(Boolean).join('\n') });
  return { ...r, ma: b.ma };
}

module.exports = { soanBai, soanTraLoi, canBao, tieuDe, tenQuocGia, chay, batBao, guiThu, guiBu, dichTin, laTiengViet, tin };
