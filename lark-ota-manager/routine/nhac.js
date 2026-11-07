'use strict';
/**
 * Nhắc nhân sự CSKH trong luồng tin booking của nhóm "Booking KS".
 *
 * AI KHÔNG tự nhắn cho khách (anh Hùng, 07/11/2026): app chỉ nhắc người trực đúng
 * lúc, kèm mẫu tin soạn sẵn theo ngôn ngữ của khách để người trực tự gửi.
 *
 *   chao          ngay sau tin booking mới: mẫu tin chào, xác nhận đơn.
 *   chua-nhan     3 phút sau tin booking mà chưa ai nhận đơn: nhắc cả nhóm.
 *   chua-nhan-ql  10 phút sau lần nhắc trên vẫn chưa ai nhận: nhắn riêng quản lý.
 *   truoc-den     9:00 ngày trước ngày nhận phòng: nhắc nhắn khách trước ngày đến.
 *   hoi-tham      19:00 ngày nhận phòng: nhắc hỏi thăm khách.
 *   xin-danh-gia  14:00 ngày trả phòng: nhắc cảm ơn, mời khách đánh giá.
 *   huy-ly-do     30 phút sau khi OTA báo huỷ mà chưa ghi lý do huỷ.
 *
 * "Đã nhận đơn" = có người trả lời trong luồng tin (nếu bot đọc được luồng), hoặc
 * cột Chăm sóc đã khác "Chưa liên hệ", hoặc đã ghi Lý do huỷ.
 *
 * Mỗi lời nhắc gửi đúng một lần. Đã nhắc gì ghi ở cột "Nhắc CSKH" của Base, mỗi dòng
 * "<loại> <YYYY-MM-DD HH:MM>"; dòng "tin <giờ>" là lúc gửi tin booking (bao-nhom.js
 * ghi), dòng "nhan <open_id>" là người đã trả lời trong luồng.
 *
 * Phần quyết định (`canNhac`, `soanNhac`) là hàm thuần để test.
 */
const cfg = require('../config');

const R = cfg.routine;
const LY_DO_HUY = ['Giá', 'Đổi kế hoạch', 'Tìm được chỗ khác', 'Thẻ lỗi, OTA tự huỷ', 'Đặt trùng', 'Thời tiết', 'Khác'];

const PHUT = 60e3;
/** Giờ VN "YYYY-MM-DD HH:MM" → ms. */
const ms = (s) => Date.parse(String(s).slice(0, 16).replace(' ', 'T') + ':00+07:00');
const gioVN = (t) => new Date(t + 7 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
const cong = (ngay, n) => new Date(Date.parse(ngay + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

/** Giờ trực "08:00-22:00" → [phút đầu, phút cuối] trong ngày. */
function khungTruc(s = R.gioTruc || '08:00-22:00') {
  const m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(String(s).trim());
  return m ? [+m[1] * 60 + +m[2], +m[3] * 60 + +m[4]] : [480, 1320];
}
function trongGioTruc(t, s) {
  const [a, b] = khungTruc(s);
  const p = Math.floor(((t + 7 * 3600e3) % 864e5) / PHUT);
  return p >= a && p < b;
}

/** Cột "Nhắc CSKH" → { tin, nhan, da: Map(loại → giờ) }. */
function docNhac(chuoi) {
  const ra = { tin: '', nhan: '', da: new Map() };
  for (const d of String(chuoi || '').split('\n').map((x) => x.trim()).filter(Boolean)) {
    const [loai, ...con] = d.split(' ');
    const gt = con.join(' ');
    if (loai === 'tin') ra.tin = gt;
    else if (loai === 'nhan') ra.nhan = gt;
    else ra.da.set(loai, gt);
  }
  return ra;
}
const themDong = (chuoi, dong) => String(chuoi || '').split('\n').filter(Boolean).concat(dong).join('\n');

const daNhanDon = (b, n) => Boolean(n.nhan || (b.chamSoc && b.chamSoc !== 'Chưa liên hệ') || b.lyDoHuy);

/** Lúc OTA báo huỷ (dòng lịch sử huỷ đầu tiên), '' nếu không có. */
function lucHuy(b) {
  const d = String(b.lichSu || '').split('\n').find((x) => /· (Huỷ|Agoda báo huỷ)$/.test(x));
  return d ? d.slice(0, 16) : '';
}

/**
 * Các lời nhắc đến hạn của một đơn, theo thứ tự cần gửi.
 * @param {object} b    booking (bang.doc) có thêm `nhacCskh`, `lyDoHuy`
 * @param {number} nay  Date.now()
 */
function canNhac(b, nay = Date.now(), { gioTruc } = {}) {
  if (!b.tinNhom) return [];
  const n = docNhac(b.nhacCskh);
  const ra = [];
  const chua = (loai) => !n.da.has(loai);
  const truc = trongGioTruc(nay, gioTruc);
  const huy = b.trangThai === 'Đã huỷ';

  if (huy) {
    const luc = lucHuy(b);
    if (luc && !b.lyDoHuy && chua('huy-ly-do') && truc) {
      const tuoi = nay - ms(luc);
      if (tuoi >= 30 * PHUT && tuoi <= 24 * 3600e3) ra.push('huy-ly-do');
    }
    return ra;
  }

  /* Chào và nhận đơn: chỉ với tin gửi từ lúc có tính năng (có dòng "tin"). */
  if (n.tin) {
    const tuoiTin = nay - ms(n.tin);
    if (tuoiTin >= 0 && tuoiTin <= 24 * 3600e3) {
      if (chua('chao')) ra.push('chao');
      if (!daNhanDon(b, n) && truc) {
        if (chua('chua-nhan') && tuoiTin >= 3 * PHUT) ra.push('chua-nhan');
        else if (!chua('chua-nhan') && chua('chua-nhan-ql') && nay - ms(n.da.get('chua-nhan')) >= 10 * PHUT) ra.push('chua-nhan-ql');
      }
    }
  }

  const den = b.nhanPhong, tra = b.traPhong;
  if (den && truc) {
    const truoc = cong(den, -1);
    const datTruoc = !b.ngayDat || b.ngayDat.slice(0, 10) < truoc;
    if (chua('truoc-den') && datTruoc && b.trangThai === 'Đã đặt'
      && nay >= ms(truoc + ' 09:00') && nay < ms(den + ' 12:00')) ra.push('truoc-den');
    if (chua('hoi-tham') && nay >= ms(den + ' 19:00') && nay < ms(cong(den, 1) + ' 00:00')
      && b.chamSoc !== 'Đã hỏi thăm khi ở') ra.push('hoi-tham');
  }
  if (tra && truc && chua('xin-danh-gia') && nay >= ms(tra + ' 14:00') && nay < ms(cong(tra, 1) + ' 22:00')
    && !['Đã xin đánh giá', 'Có vấn đề'].includes(b.chamSoc)) ra.push('xin-danh-gia');
  return ra;
}

/* ---------------- mẫu tin cho khách (người trực tự gửi) ---------------- */

/** Ngôn ngữ mẫu tin theo quốc gia: Việt Nam → vi, Hàn Quốc → ko, còn lại → en. */
function ngonNgu(quocGia) {
  const q = String(quocGia || '').toLowerCase();
  if (/viet|việt/.test(q)) return 'vi';
  if (/korea|hàn/.test(q)) return 'ko';
  return 'en';
}
const TEN_NN = { vi: 'tiếng Việt', en: 'tiếng Anh', ko: 'tiếng Hàn' };

/* Mẫu không nêu chi tiết app không biết chắc (giờ cáp treo, giá): người trực tự bổ sung. */
const MAU = {
  chao: {
    vi: (b) => `Chào anh/chị ${b.tenKhach || ''}, Pito Hotel Hòn Thơm xin cảm ơn anh/chị đã đặt phòng (mã ${b.maOta || b.ma}), lưu trú ${b.ngay}. Anh/chị dự kiến đến khoảng mấy giờ, và có yêu cầu gì thêm không ạ? Khách sạn có gói phòng kèm vé cáp treo ra đảo, anh/chị cần em tư vấn thêm ạ.`,
    en: (b) => `Dear ${b.tenKhach || 'guest'}, thank you for booking Pito Hotel Hon Thom (booking ${b.maOta || b.ma}), staying ${b.ngay}. What time do you expect to arrive, and do you have any special requests? We also offer room packages with cable car tickets to the island. Just let us know if you would like more details.`,
    ko: (b) => `${b.tenKhach || '고객'}님, 안녕하세요. 피토 호텔 혼텀을 예약해 주셔서 감사합니다 (예약번호 ${b.maOta || b.ma}, 숙박 ${b.ngay}). 도착 예정 시간과 추가 요청 사항이 있으시면 알려 주세요. 섬까지 가는 케이블카 티켓이 포함된 객실 패키지도 있으니 필요하시면 안내해 드리겠습니다.`,
  },
  'truoc-den': {
    vi: (b) => `Chào anh/chị ${b.tenKhach || ''}, Pito Hotel Hòn Thơm rất mong được đón anh/chị vào ngày ${b.den}. Anh/chị cho em xin giờ đến dự kiến nhé. Nếu cần hướng dẫn đường ra đảo Hòn Thơm (cáp treo hoặc tàu), anh/chị nhắn em hỗ trợ ạ.`,
    en: (b) => `Dear ${b.tenKhach || 'guest'}, we look forward to welcoming you at Pito Hotel Hon Thom on ${b.den}. Could you share your expected arrival time? If you need directions to Hon Thom island (cable car or boat), just reply and we will help.`,
    ko: (b) => `${b.tenKhach || '고객'}님, ${b.den}에 피토 호텔 혼텀에서 뵙기를 기대합니다. 도착 예정 시간을 알려 주시겠어요? 혼텀 섬까지 가는 방법(케이블카 또는 배) 안내가 필요하시면 언제든지 메시지 주세요.`,
  },
  'hoi-tham': {
    vi: (b) => `Chào anh/chị ${b.tenKhach || ''}, anh/chị đã nghỉ ngơi thoải mái chưa ạ? Phòng và dịch vụ có điều gì chưa ổn, anh/chị báo em để khách sạn xử lý ngay nhé.`,
    en: (b) => `Dear ${b.tenKhach || 'guest'}, we hope you are settling in well. If anything about your room or our service is not right, please let us know and we will take care of it right away.`,
    ko: (b) => `${b.tenKhach || '고객'}님, 편안하게 쉬고 계신가요? 객실이나 서비스에 불편한 점이 있으시면 바로 말씀해 주세요. 즉시 도와드리겠습니다.`,
  },
  'xin-danh-gia': {
    vi: (b) => `Pito Hotel Hòn Thơm cảm ơn anh/chị ${b.tenKhach || ''} đã lưu trú. Nếu hài lòng, anh/chị dành một phút đánh giá khách sạn trên ${b.kenh || 'trang đặt phòng'} giúp em nhé. Rất mong được đón anh/chị lần sau!`,
    en: (b) => `Thank you for staying at Pito Hotel Hon Thom, ${b.tenKhach || 'dear guest'}. If you enjoyed your stay, we would be grateful if you could leave us a review on ${b.kenh || 'the booking site'}. We hope to welcome you again!`,
    ko: (b) => `${b.tenKhach || '고객'}님, 피토 호텔 혼텀에 머물러 주셔서 감사합니다. 만족스러우셨다면 ${b.kenh || '예약 사이트'}에 리뷰를 남겨 주시면 큰 힘이 됩니다. 다음에 또 뵙기를 바랍니다!`,
  },
};

const dmy = (s) => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '?');

function mauTin(loai, b) {
  const nn = ngonNgu(b.quocGia);
  const du = { ...b, ngay: dmy(b.nhanPhong) + ' - ' + dmy(b.traPhong), den: dmy(b.nhanPhong) };
  const f = MAU[loai];
  return f ? { nn, ten: TEN_NN[nn], chu: f[nn](du) } : null;
}

/**
 * Nội dung lời nhắc trong luồng (tin chữ của Lark).
 * `goi`: chuỗi @ đầu tin, ví dụ '<at user_id="ou_x"></at>' hoặc '<at user_id="all"></at>'.
 */
function soanNhac(loai, b, { goi = '' } = {}) {
  const dau = goi ? goi + ' ' : '';
  const mau = mauTin(loai, b);
  const kem = (m) => (m ? '\n\nMẫu tin ' + m.ten + ' (chép, sửa rồi tự gửi khách):\n' + m.chu : '');
  switch (loai) {
    case 'chao':
      return 'Mẫu tin chào khách để người nhận đơn dùng. Nhận đơn: trả lời "Em nhận" trong luồng này, nhắn khách trong 5 phút.' + kem(mau);
    case 'chua-nhan':
      return dau + 'Đơn này đã 3 phút chưa ai nhận. Người trực trả lời "Em nhận" trong luồng rồi nhắn khách ngay nhé.';
    case 'truoc-den':
      return dau + 'Ngày mai (' + dmy(b.nhanPhong) + ') khách nhận phòng. Nhắn khách hỏi giờ đến, gửi hướng dẫn đi Hòn Thơm. Xong thì đổi Chăm sóc sang "Đã xác nhận giờ đến".' + kem(mau);
    case 'hoi-tham':
      return dau + 'Khách nhận phòng hôm nay. Nhắn hỏi thăm khách; khách chưa hài lòng thì xử lý ngay và đổi Chăm sóc sang "Có vấn đề". Xong thì đổi sang "Đã hỏi thăm khi ở".' + kem(mau);
    case 'xin-danh-gia':
      return dau + 'Khách trả phòng hôm nay. Nhắn cảm ơn và mời khách đánh giá trên ' + (b.kenh || 'OTA') + '. Xong thì đổi Chăm sóc sang "Đã xin đánh giá".' + kem(mau);
    case 'huy-ly-do':
      return dau + 'Đơn huỷ đã 30 phút chưa ghi lý do huỷ. Gọi khách hỏi nguyên nhân, đưa phương án đặt lại, rồi ghi Lý do huỷ trên app.';
    default:
      return '';
  }
}

/** Thẻ nhắn riêng quản lý khi đơn mới quá lâu chưa ai nhận. */
function theQuanLy(b) {
  return {
    config: { wide_screen_mode: true },
    header: { template: 'orange', title: { tag: 'plain_text', content: 'Booking khách sạn chưa ai nhận' } },
    elements: [{
      tag: 'markdown',
      content: 'Đơn **' + (b.maOta || b.ma) + '** (' + (b.kenh || 'OTA') + ', ' + (b.tenKhach || 'khách') + ', nhận phòng ' + dmy(b.nhanPhong)
        + ') đã báo vào nhóm Booking KS hơn 13 phút mà chưa ai nhận, dù đã nhắc trong luồng.',
    }],
  };
}

/* ---------------- đọc luồng tin: ai đã trả lời ---------------- */

/**
 * open_id của người (không phải bot) trả lời đầu tiên trong luồng tin `msgId`; '' nếu chưa ai.
 * Ném lỗi nếu app không đọc được (thiếu quyền đọc tin nhóm): bên gọi tự lùi về cột Base.
 */
async function nguoiTraLoi(msgId, { tin, fetchFn = fetch }) {
  const host = cfg.apiHost || 'https://open.larksuite.com';
  const tk = await tin.token();
  const get = async (url) => {
    const d = await (await fetchFn(host + url, { headers: { Authorization: 'Bearer ' + tk } })).json();
    if (d.code !== 0) throw new Error('Lark ' + d.code + ': ' + (d.msg || 'không đọc được luồng tin'));
    return d.data || {};
  };
  const goc = ((await get('/open-apis/im/v1/messages/' + encodeURIComponent(msgId))).items || [])[0] || {};
  if (!goc.thread_id) return '';
  const ds = (await get('/open-apis/im/v1/messages?container_id_type=thread&page_size=50&container_id=' + encodeURIComponent(goc.thread_id))).items || [];
  const nguoi = ds.find((x) => x.message_id !== msgId && x.sender && x.sender.sender_type === 'user');
  return nguoi ? nguoi.sender.id : '';
}

/* ---------------- chạy một lượt ---------------- */

const tinhTrang = { luc: null, gui: 0, loi: [], docLuong: '' };

/**
 * Gửi mọi lời nhắc đến hạn. Không ném.
 * @param {object} o  { rows, bang, guiTin, guiQuanLy, docLuong, nay }
 */
async function chay({ rows, bang, guiTin, guiQuanLy, docLuong, nay = Date.now() }) {
  const kq = { gui: 0, loi: [] };
  for (const b of rows) {
    let viec = canNhac(b, nay);
    if (!viec.length) continue;
    try {
      let nhac = b.nhacCskh || '';
      let n = docNhac(nhac);
      /* Chưa biết ai nhận: thử đọc luồng tin (một lần mỗi lượt cho đơn này). */
      if (!n.nhan && docLuong && viec.some((v) => v.startsWith('chua-nhan') || ['truoc-den', 'hoi-tham', 'xin-danh-gia', 'huy-ly-do'].includes(v))) {
        try {
          const id = await docLuong(b.tinNhom);
          tinhTrang.docLuong = '';
          if (id) {
            nhac = themDong(nhac, 'nhan ' + id);
            await bang.ghi(b.id, { nhacCskh: nhac });
            n = docNhac(nhac);
            viec = canNhac({ ...b, nhacCskh: nhac }, nay);
          }
        } catch (e) {
          tinhTrang.docLuong = e.message || String(e);
        }
      }
      for (const loai of viec) {
        let r;
        if (loai === 'chua-nhan-ql') {
          r = await guiQuanLy(theQuanLy(b), 'rt-nh-ql-' + b.ma);
        } else {
          const goi = loai === 'chao' ? '' : loai === 'chua-nhan' ? '<at user_id="all"></at>' : n.nhan ? '<at user_id="' + n.nhan + '"></at>' : '';
          const khoa = 'rt-nh-' + loai + '-' + b.ma;
          r = await guiTin.gui({ traLoi: b.tinNhom, trongLuong: true, text: soanNhac(loai, b, { goi }), khoa });
          /* Nhóm không cho bot @ tất cả: gửi lại không kèm @. */
          if (!r.ok && goi) r = await guiTin.gui({ traLoi: b.tinNhom, trongLuong: true, text: soanNhac(loai, b), khoa: khoa + '-k' });
        }
        if (!r || !(r.ok || r.boQua)) { kq.loi.push(b.ma + ' ' + loai + ': ' + ((r && r.loi) || 'gửi không được')); break; }
        nhac = themDong(nhac, loai + ' ' + gioVN(nay));
        await bang.ghi(b.id, { nhacCskh: nhac });
        kq.gui++;
      }
    } catch (e) {
      kq.loi.push(b.ma + ': ' + (e.message || e));
    }
  }
  Object.assign(tinhTrang, { luc: new Date(nay).toISOString(), gui: kq.gui, loi: kq.loi });
  return kq;
}

module.exports = {
  LY_DO_HUY, canNhac, soanNhac, mauTin, ngonNgu, docNhac, themDong, trongGioTruc, khungTruc,
  lucHuy, theQuanLy, nguoiTraLoi, chay, tinhTrang,
};
