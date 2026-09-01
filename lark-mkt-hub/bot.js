'use strict';
/**
 * ============================================================================
 * NGUỒN SỐ LIỆU CHO TRỢ LÝ (bot hỏi đáp)
 * ============================================================================
 * Bot không "học" dữ liệu của phòng — nó TRA lúc được hỏi. Đây là chỗ tra: một
 * bộ endpoint chỉ-đọc, trả JSON gọn, kèm sẵn câu `tomTat` bằng tiếng Việt để bộ
 * não nào cũng đọc ra được câu trả lời mà không phải tự tính lại.
 *
 * Vì sao không train: dữ liệu đổi mỗi ngày, mà mô hình train xong là ảnh chụp
 * của hôm đó — và nó học giọng văn chứ không học sự thật, nên vẫn bịa số. Tra
 * thẳng thì con số luôn đúng bằng con số trên Base.
 *
 * ---------------------------------------------------------------------------
 * ĐÂY LÀ CỬA MỞ RA INTERNET. Coze (hoặc bộ não nào khác) nằm ngoài, gọi vào.
 * Nên bó rất hẹp, và bó ở NHIỀU LỚP để một lớp hỏng vẫn còn lớp khác:
 *
 *   1. Không có BOT_API_TOKEN thì toàn bộ nhánh /bot TẮT (404). Fail closed:
 *      deploy quên khai biến thì cửa đóng, không phải mở toang.
 *   2. Chỉ GET. Không có một endpoint nào ghi được vào Base.
 *   3. Gọi module bằng một danh tính CỐ ĐỊNH, không phải null — vì nhiều chỗ
 *      trong module coi `nguoi == null` là "gọi nội bộ, cho xem hết tiền".
 *      Danh tính đó: xem toàn bộ, KHÔNG có quyền chi phí.
 *   4. Lọc lần hai ở lớp này: chỉ những field khai trong LOC được ra ngoài.
 *      Module có thêm cột tiền sau này thì cũng không lọt, vì đây là danh sách
 *      cho phép chứ không phải danh sách cấm.
 *   5. Không trả open_id / email của ai — chỉ tên người. Không để bot thành
 *      công cụ dò danh bạ công ty.
 *
 * VÌ SAO KHÔNG CÓ CHI PHÍ Ở ĐÂY: Coze gọi API bằng danh tính của plugin, nó
 * không mang theo "người đang hỏi là ai". Nên không phân quyền theo người được.
 * Chừng nào chưa truyền được open_id người hỏi thì đường này chỉ được phép trả
 * thứ cả phòng vốn xem được. Đừng nới điều này mà không giải quyết danh tính.
 * ---------------------------------------------------------------------------
 */
const { goiJson } = require('./proxy');

/** Danh tính mà bot dùng khi gọi vào module. Cố định, không nhận từ ngoài. */
const NGUOI_BOT = Object.freeze({
  id: 'bot-tro-ly',
  name: 'Trợ lý Marketing',
  quanLy: false,      // không phải quản lý
  toanBo: true,       // nhưng được xem cả phòng (chỉ xem)
  chiPhi: false,      // và không bao giờ xem tiền
  taoMoi: false,
});

const NGAY = 86400000;
const LECH_VN = 7 * 3600000;   // toàn hệ dùng giờ Việt Nam

/* ---------------- ngày tháng ---------------- */
const ms = (v) => (v == null || v === '' ? 0 : typeof v === 'number' ? v : Date.parse(v) || 0);
/** Đầu ngày theo giờ VN, trả về mốc epoch — không phụ thuộc múi giờ của máy chủ. */
const dauNgayVN = (t) => Math.floor((t + LECH_VN) / NGAY) * NGAY - LECH_VN;

function ngayVN(t) {
  if (!t) return '';
  const x = new Date(t + LECH_VN);
  const p = (n) => String(n).padStart(2, '0');
  return p(x.getUTCDate()) + '/' + p(x.getUTCMonth() + 1);
}
function gioVN(t) {
  if (!t) return '';
  const x = new Date(t + LECH_VN);
  const p = (n) => String(n).padStart(2, '0');
  return ngayVN(t) + ' ' + p(x.getUTCHours()) + ':' + p(x.getUTCMinutes());
}
const THU = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
const thuVN = (t) => (t ? THU[new Date(t + LECH_VN).getUTCDay()] : '');

/**
 * Khoảng thời gian: nhận YYYY-MM-DD, hoặc mấy từ khoá mà người ta hay gõ cho bot.
 * Có từ khoá để bộ não khỏi phải tự tính ngày — nó tính sai lịch là chuyện thường.
 */
function khoang(tu, den, now) {
  const d0 = dauNgayVN(now);
  const tuKhoa = String(tu || '').trim().toLowerCase();
  const dat = (a, b, nhan) => ({ tu: a, den: b, nhan });

  if (!tuKhoa) return null;
  if (tuKhoa === 'hom-nay') return dat(d0, d0 + NGAY - 1, 'hôm nay');
  if (tuKhoa === 'mai') return dat(d0 + NGAY, d0 + 2 * NGAY - 1, 'ngày mai');
  if (tuKhoa === 'tuan-nay') return dat(d0, d0 + 7 * NGAY - 1, '7 ngày tới');
  if (tuKhoa === 'tuan-sau') return dat(d0 + 7 * NGAY, d0 + 14 * NGAY - 1, 'tuần sau');
  if (tuKhoa === 'thang-nay') {
    const x = new Date(d0 + LECH_VN);
    const dau = Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), 1) - LECH_VN;
    const sau = Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 1) - LECH_VN;
    return dat(dau, sau - 1, 'tháng này');
  }
  if (tuKhoa === 'thang-truoc') {
    const x = new Date(d0 + LECH_VN);
    const dau = Date.UTC(x.getUTCFullYear(), x.getUTCMonth() - 1, 1) - LECH_VN;
    const sau = Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), 1) - LECH_VN;
    return dat(dau, sau - 1, 'tháng trước');
  }

  const chuan = /^\d{4}-\d{2}-\d{2}$/;
  if (!chuan.test(tuKhoa)) return { loi: 'Ngày phải dạng YYYY-MM-DD, hoặc một trong: ' + TU_KHOA.join(', ') };
  const a = Date.parse(tuKhoa + 'T00:00:00+07:00');
  const dTho = String(den || '').trim();
  const b = chuan.test(dTho) ? Date.parse(dTho + 'T00:00:00+07:00') + NGAY - 1 : a + NGAY - 1;
  if (!Number.isFinite(a) || !Number.isFinite(b) || a > b) return { loi: 'Khoảng ngày không hợp lệ' };
  return dat(a, b, ngayVN(a) + (b - a > NGAY ? ' → ' + ngayVN(b) : ''));
}
const TU_KHOA = ['hom-nay', 'mai', 'tuan-nay', 'tuan-sau', 'thang-nay', 'thang-truoc'];

/** So tên người, bỏ dấu và không phân biệt hoa thường — người ta gõ tên cho bot
 *  kiểu "truong", "Trường", "danh minh truong" đều phải khớp. */
function khongDau(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
}
const khopTen = (ds, q) => {
  if (!q) return true;
  const k = khongDau(q);
  return (ds || []).some((n) => khongDau(n).includes(k));
};

/** Bỏ emoji dẫn đầu của select trong Base ("🔴 Cao" → "Cao"). */
function nhan(v) {
  const t = String(v == null ? '' : v);
  const kyHieu = (cp) => cp === 32 || cp === 0xFE0F || cp === 0x200D ||
    (cp >= 0x2000 && cp <= 0x3300) || (cp >= 0x1F000 && cp <= 0x1FAFF);
  let i = 0;
  while (i < t.length) {
    const cp = t.codePointAt(i);
    if (!kyHieu(cp)) break;
    i += cp > 0xFFFF ? 2 : 1;
  }
  return t.slice(i).trim();
}
const tenNguoi = (us) => (us || []).map((u) => u.name || '').filter(Boolean);

/**
 * Bỏ mọi khoá rỗng khỏi một dòng kết quả.
 *
 * Gửi `ketThuc: ""` đi thì bộ não coi đó là một phát hiện và tường thuật "lịch
 * này chưa có giờ kết thúc" — trong khi phần lớn lịch vốn không cần điền ô đó.
 * Khoá nào không có giá trị thì đừng nhắc tới. Giữ số 0 và false vì đó là giá
 * trị thật (0 khách, chưa giải quyết).
 */
const gon = (o) => Object.fromEntries(
  Object.entries(o).filter(([, v]) => v !== '' && v != null)
);

/* ==========================================================================
   CÔNG CỤ — mỗi cái là một endpoint /bot/<ten>
   Mỗi công cụ khai `thamSo` để sinh được schema OpenAPI cho Coze, và trả về
   { tomTat, ... } — `tomTat` là câu tiếng Việt đọc thẳng ra được.
   ========================================================================== */
const CONG_CU = {};

/* ---------------- Lịch tác nghiệp ---------------- */
CONG_CU.lich = {
  nhan: 'Lịch tác nghiệp',
  moTa: 'Look up field-work schedules (livestream, filming, tours) in a date range. ' +
    'Returns who is in charge, who joins, start time, duration, transport, the session ' +
    'plan with hourly steps, FOC tickets and approval status. No cost data.',
  thamSo: {
    tu: { moTa: 'Time range. Use a keyword: ' + TU_KHOA.join(' | ') +
      '. Or a start date YYYY-MM-DD. Leave empty for all schedules.' },
    den: { moTa: 'End date YYYY-MM-DD. Only used when `tu` is an explicit date.' },
    nguoi: { moTa: 'Filter by person name, owner or team member. Vietnamese accents optional.' },
    trangthai: { moTa: 'Filter by approval status. Vietnamese values: "Cho duyet" (waiting ' +
      'for approval), "Duyet" (approved), "Dang bao cao" (reporting), "Da hoan tat" (done).' },
  },
  async chay(mod, q, now) {
    const k = khoang(q.tu, q.den, now);
    if (k && k.loi) return { loi: k.loi };
    const meta = await goiJson(mod, '/api/meta', { nguoi: NGUOI_BOT });

    const ds = (meta.items || []).filter((t) => {
      const bd = ms(t.start);
      if (k && !(bd >= k.tu && bd <= k.den)) return false;
      if (q.trangthai && !khongDau(t.status).includes(khongDau(q.trangthai))) return false;
      if (q.nguoi && !khopTen(tenNguoi(t.owner).concat(tenNguoi(t.staff)), q.nguoi)) return false;
      return true;
    }).sort((a, b) => ms(a.start) - ms(b.start));

    /* Danh sách CHO PHÉP, không phải danh sách cấm — module thêm cột tiền sau này
     * thì cũng không lọt ra đường này.
     *
     * Mỗi khoá ở đây phải là một cột CÓ THẬT trên Base. Bịa ra một khoá thì nó
     * rỗng mãi mãi, và bot sẽ tường thuật cái rỗng đó như một sự thật ("lịch này
     * chưa có địa điểm") — tệ hơn là không có khoá. Bảng lịch tác nghiệp KHÔNG có
     * cột địa điểm; đường đi nằm trong `plan`. */
    const dong = (t) => ({
      hoatDong: t.title || '(chưa đặt tên)',
      khiNao: gioVN(ms(t.start)),
      thu: thuVN(ms(t.start)),
      ketThuc: ms(t.end) ? gioVN(ms(t.end)) : '',
      thoiLuong: t.duration ? t.duration + ' giờ' : '',
      phuTrach: tenNguoi(t.owner).join(', '),
      nhanSuCungDi: tenNguoi(t.staff).join(', '),
      phuongTien: (t.transport || []).map(nhan).filter(Boolean).join(', '),
      trangThai: nhan(t.status),
      mucDich: t.purpose || '',
      keHoach: t.plan || '',                    // đường đi + mốc giờ trong buổi
      ve: (t.foc || []).map(nhan).filter(Boolean).join(', '),
      veDuyet: nhan(t.focStatus),
      lienKetSanPham: t.link || '',
    });

    /* 25 chứ không phải 40: từ khi kèm `keHoach` (đoạn văn nhiều dòng) mỗi dòng
     * nặng hơn hẳn, mà bộ não nào cũng có giới hạn ngữ cảnh. */
    const chiTiet = ds.slice(0, 25).map((t) => gon(dong(t)));
    return {
      tomTat: ds.length
        ? 'Có ' + ds.length + ' lịch tác nghiệp' + (k ? ' ' + k.nhan : '') +
          (q.nguoi ? ' liên quan tới "' + q.nguoi + '"' : '') + '. ' +
          chiTiet.slice(0, 6).map((x) => x.khiNao + ' — ' + x.hoatDong +
            (x.phuTrach ? ' (' + x.phuTrach + ')' : '')).join('; ') +
          (ds.length > 6 ? '; và ' + (ds.length - 6) + ' lịch nữa.' : '.')
        : 'Không có lịch tác nghiệp nào' + (k ? ' ' + k.nhan : '') +
          (q.nguoi ? ' liên quan tới "' + q.nguoi + '"' : '') + '.',
      so: ds.length,
      khoang: k ? k.nhan : 'tất cả',
      chiTiet,
      catBot: ds.length > 25 ? ds.length - 25 : 0,
    };
  },
};

/* ---------------- Bảng công việc ---------------- */
CONG_CU.viec = {
  nhan: 'Bảng công việc',
  moTa: 'Look up tasks on the Marketing department tracking board: who is working on ' +
    'what, deadlines, how many days late, priority and campaign. No cost data.',
  thamSo: {
    nguoi: { moTa: 'Filter by assignee name. Vietnamese accents optional.' },
    trangthai: { moTa: 'Filter by status. Vietnamese values: "Cho tiep nhan" (not accepted ' +
      'yet), "Dang tien hanh" (in progress), "Hoan thanh" (done).' },
    quahan: { moTa: 'Set to "1" to return only tasks that are overdue and not yet resolved.' },
    tu: { moTa: 'Filter by DEADLINE. Use a keyword: ' + TU_KHOA.join(' | ') +
      '. Or a date YYYY-MM-DD.' },
    den: { moTa: 'End date YYYY-MM-DD, used together with `tu`.' },
  },
  async chay(mod, q, now) {
    const k = khoang(q.tu, q.den, now);
    if (k && k.loi) return { loi: k.loi };
    const d = await goiJson(mod, '/api/tasks', { nguoi: NGUOI_BOT });
    const d0 = dauNgayVN(now);
    const DONG = new Set(['Hoàn thành', 'Hủy']);

    let ds = (d.tasks || []).filter((t) => {
      const han = ms(t.deadline);
      if (k && !(han && han >= k.tu && han <= k.den)) return false;
      if (q.trangthai && !khongDau(t.status).includes(khongDau(q.trangthai))) return false;
      if (q.nguoi && !khopTen(tenNguoi(t.owner), q.nguoi)) return false;
      return true;
    });

    if (String(q.quahan || '') === '1') {
      /* Trễ tính theo NGÀY, và việc đã bấm "Giải quyết" thì rời hàng đợi trễ —
       * giống hệt cách app tính, để số của bot không lệch số trên màn hình. */
      ds = ds.filter((t) => !DONG.has(t.status) && !t.daGiaiQuyet &&
        (t.status === 'Trễ deadline' || (ms(t.deadline) && ms(t.deadline) < d0)));
    }
    ds.sort((a, b) => (ms(a.deadline) || Infinity) - (ms(b.deadline) || Infinity));

    const dong = (t) => ({
      congViec: t.title || '(không tên)',
      nguoiLam: tenNguoi(t.owner).join(', ') || '(chưa phân công)',
      deadline: ms(t.deadline) ? ngayVN(ms(t.deadline)) : '(chưa đặt)',
      treNgay: ms(t.deadline) && ms(t.deadline) < d0 && !DONG.has(t.status)
        ? Math.round((d0 - ms(t.deadline)) / NGAY) : 0,
      trangThai: nhan(t.status),
      loai: nhan(t.workType),
      uuTien: nhan(t.priority),
      chienDich: nhan(t.campaign),
      daGiaiQuyet: !!t.daGiaiQuyet,
    });

    const chiTiet = ds.slice(0, 40).map((t) => gon(dong(t)));
    return {
      tomTat: ds.length
        ? 'Có ' + ds.length + ' việc' +
          (String(q.quahan || '') === '1' ? ' đang quá hạn' : '') +
          (q.nguoi ? ' của "' + q.nguoi + '"' : '') + (k ? ' (deadline ' + k.nhan + ')' : '') + '. ' +
          chiTiet.slice(0, 6).map((x) => x.congViec + ' — ' + x.nguoiLam +
            ', hạn ' + x.deadline + (x.treNgay ? ', trễ ' + x.treNgay + ' ngày' : '')).join('; ') +
          (ds.length > 6 ? '; và ' + (ds.length - 6) + ' việc nữa.' : '.')
        : 'Không có việc nào khớp điều kiện đó.',
      so: ds.length,
      chiTiet,
      catBot: ds.length > 40 ? ds.length - 40 : 0,
    };
  },
};

/* ---------------- Booking OTA ---------------- */
CONG_CU.booking = {
  nhan: 'Booking OTA',
  moTa: 'Look up OTA tour bookings (Klook, KKday, GetYourGuide, Ctrip, WAUG, MyRealTrip, ' +
    'Viator) by tour departure date: how many bookings, how many guests, which tour, ' +
    'which platform, pickup point, guest language. Does NOT return revenue or commission.',
  thamSo: {
    tu: { moTa: 'Filter by tour DEPARTURE date. Use a keyword: ' + TU_KHOA.join(' | ') +
      '. Or a date YYYY-MM-DD.' },
    den: { moTa: 'End date YYYY-MM-DD, used together with `tu`.' },
    tour: { moTa: 'Filter by tour name. Vietnamese accents optional.' },
    san: { moTa: 'Filter by OTA platform, e.g. "Klook", "Viator".' },
  },
  async chay(mod, q, now) {
    const k = khoang(q.tu, q.den, now);
    if (k && k.loi) return { loi: k.loi };
    const qs = '?moc=ngayDi' + (k
      ? '&from=' + ngayISO(k.tu) + '&to=' + ngayISO(k.den) : '');
    const d = await goiJson(mod, '/api/bookings' + qs, { nguoi: NGUOI_BOT });

    /* Module trả nguyên bản ghi, TRONG ĐÓ CÓ TIỀN (thucNhan, hoaHong, tongTien).
     * Danh sách `dong` dưới đây là danh sách CHO PHÉP nên mấy cột đó không lọt ra
     * ngoài — đừng đổi thành kiểu sao chép cả bản ghi rồi xoá vài cột. */
    const ds = (d.rows || []).filter((b) => {
      if (q.tour && !khongDau(b.tour || b.sanPham).includes(khongDau(q.tour))) return false;
      if (q.san && !khongDau(b.kenh).includes(khongDau(q.san))) return false;
      return true;
    });

    const soKhach = ds.reduce((s, b) => s + Number(b.tongKhach || 0), 0);
    const dong = (b) => ({
      ma: b.maBooking || '',
      tour: b.tour || b.sanPham || '',
      ngayDi: b.ngayDi ? ngayVN(ms(b.ngayDi)) : '',
      san: b.kenh || '',
      khach: b.tenKhach || '',
      soKhach: Number(b.tongKhach || 0),
      nguoiLon: Number(b.nguoiLon || 0),
      treEm: Number(b.treEm || 0),
      diemDon: b.diemDon || '',
      ngonNgu: b.ngonNgu || '',
      trangThai: nhan(b.trangThai),
    });

    const chiTiet = ds.slice(0, 40).map((b) => gon(dong(b)));
    return {
      tomTat: ds.length
        ? 'Có ' + ds.length + ' booking' + (k ? ' đi tour ' + k.nhan : '') +
          ', tổng ' + soKhach + ' khách. ' +
          chiTiet.slice(0, 6).map((x) => x.ngayDi + ' — ' + x.tour + ' (' + x.san +
            ', ' + x.soKhach + ' khách)').join('; ') +
          (ds.length > 6 ? '; và ' + (ds.length - 6) + ' booking nữa.' : '.')
        : 'Không có booking nào' + (k ? ' đi tour ' + k.nhan : '') + '.',
      so: ds.length,
      soKhach,
      khoang: k ? k.nhan : 'tất cả',
      chiTiet,
      catBot: ds.length > 40 ? ds.length - 40 : 0,
    };
  },
};

const ngayISO = (t) => {
  const x = new Date(t + LECH_VN);
  const p = (n) => String(n).padStart(2, '0');
  return x.getUTCFullYear() + '-' + p(x.getUTCMonth() + 1) + '-' + p(x.getUTCDate());
};

/* ==========================================================================
   Nhánh HTTP
   ========================================================================== */

/** Mỗi công cụ gắn với module nào. */
const MOD_CUA = { lich: 'lich-tac-nghiep', viec: 'cong-viec', booking: 'ota' };

/** Token phải đủ dài mới coi là có. Chuỗi ngắn kiểu "bot" hay "123" là để ngỏ cửa. */
const TOI_THIEU_TOKEN = 24;
function tokenThat() {
  const t = String(process.env.BOT_API_TOKEN || '').trim();
  return t.length >= TOI_THIEU_TOKEN ? t : '';
}
const dangBat = () => !!tokenThat();

/**
 * So token bằng thời gian không đổi. So bằng `===` thì thời gian trả lời hé ra
 * độ dài phần khớp — đủ để dò từng ký tự nếu người ta kiên nhẫn.
 */
function bangNhau(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
/**
 * Lấy chìa người gọi đưa. Nhận cả ba dạng, vì mỗi nền tảng làm một kiểu và người
 * khai cấu hình không có cách nào biết nền tảng của mình thuộc kiểu nào:
 *
 *   Authorization: Bearer <chia>     dạng chuẩn
 *   Authorization: <chia>            Coze và nhiều nơi khác gửi nguyên giá trị
 *   ?token=<chia>                    cho lúc thử bằng trình duyệt
 *
 * Nhận thêm dạng thứ hai KHÔNG làm yếu gì: vẫn đúng một bí mật đó, vẫn so bằng
 * thời gian không đổi. Đổi lại là người khai cấu hình khỏi phải đoán, và khỏi mất
 * một lượt thử chỉ để biết nên gõ chữ "Bearer" hay không.
 */
function chiaNguoiGoi(req, u) {
  const h = String(req.headers.authorization || '').trim();
  if (h) return h.replace(/^Bearer\s+/i, '').trim();
  return String(u.searchParams.get('token') || '').trim();
}

function coQuyen(req, u) {
  const that = tokenThat();
  if (!that) return false;
  const dua = chiaNguoiGoi(req, u);
  return !!dua && bangNhau(dua, that);
}

/* ---------------- chặn gọi dồn ----------------
 * Cửa ra Internet nên phải có mức trần: bộ não lỗi mà gọi vòng lặp thì nó vừa
 * đốt CPU của Render vừa đốt hạn mức API Lark. Cửa sổ trượt, giữ trong RAM —
 * Render restart là quên, chấp nhận được vì đây là trần chống lỗi, không phải
 * hạn mức tính tiền.
 */
const GOI = [];
const TRAN_PHUT = 60;
function quaTran(now) {
  while (GOI.length && now - GOI[0] > 60000) GOI.shift();
  if (GOI.length >= TRAN_PHUT) return true;
  GOI.push(now);
  return false;
}

/* ---------------- sổ ghi ----------------
 * Giữ 200 lượt gần nhất để anh Hùng mở ra xem bot đang hỏi cái gì, và để biết
 * có ai đang dò cửa hay không. Không ghi ra tệp: ổ đĩa Render là tạm.
 */
const SO = [];
function ghiSo(muc) {
  SO.push(muc);
  if (SO.length > 200) SO.shift();
}
const docSo = () => SO.slice().reverse();

/**
 * Sinh schema OpenAPI 3 để nhập vào Coze (Coze tạo plugin từ schema, khỏi khai
 * tay từng tham số). Sinh từ chính bảng CONG_CU nên thêm công cụ là schema tự có.
 */
function openapi(goc) {
  const paths = {};
  for (const [ten, cc] of Object.entries(CONG_CU)) {
    paths['/bot/' + ten] = {
      get: {
        operationId: ten,
        /* Khai CẢ summary VÀ description bằng cùng một câu. Coze lấy `description`
         * làm "Tool description"; chỉ khai `summary` thì nó điền mặc định "new api"
         * — mà mô tả tool chính là thứ bộ não đọc để chọn gọi tool nào, để "new
         * api" là nó chọn bừa. Nền tảng khác lại đọc `summary`, nên khai cả hai. */
        summary: cc.moTa,
        description: cc.moTa,
        parameters: Object.entries(cc.thamSo).map(([k, v]) => ({
          name: k, in: 'query', required: false,
          description: v.moTa, schema: { type: 'string' },
        })),
        responses: {
          200: {
            description: 'Lookup result. The `tomTat` field is already a complete ' +
              'Vietnamese sentence answering the question - read it out. `chiTiet` is the ' +
              'full row list, use it when the user asks to enumerate.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    tomTat: { type: 'string', description: 'Ready-made Vietnamese answer' },
                    so: { type: 'integer', description: 'Number of matching records' },
                    chiTiet: { type: 'array', items: { type: 'object' } },
                  },
                },
              },
            },
          },
        },
      },
    };
  }
  /* `goc` sinh từ PUBLIC_URL. Khai sai (hoặc bỏ trống) thì schema trỏ Coze về
   * localhost — Coze gọi vào chính máy nó, không lỗi rõ ràng, chỉ "không có dữ
   * liệu". Nên nói thẳng ra trong chính schema thay vì để anh Hùng đi đoán. */
  const noiBo = !/^https:\/\//.test(goc);
  return {
    openapi: '3.0.1',
    info: {
      /* Ba giới hạn dưới đây đo từ chính màn hình Import của Coze, đừng đoán lại:
       *   - ASCII: Coze làm rụng hết chữ có dấu ("Chi doc" -> "Ch c"), mà đây lại
       *     là thứ bộ não đọc để biết gọi tool nào và để biết không được trả lời
       *     câu hỏi về tiền;
       *   - tên: tối đa 30 ký tự, CHỈ chữ / số / gạch dưới. Form của Coze ghi là
       *     "letters, numbers, underscores or spaces" nhưng backend lại chặn cả
       *     khoảng trắng ("invalid name_for_model name") — tin backend, đừng tin
       *     dòng hướng dẫn trên form. Dấu gạch ngang thì form chặn ngay;
       *   - mô tả: Coze cắt ở 200 ký tự, nên câu chốt về tiền phải nằm TRƯỚC mốc
       *     đó và câu cuối phải kết thúc gọn trong 200.
       * Vượt khuôn thì người nhập phải sửa tay giữa lúc đang làm. */
      title: 'Rooty_Trip_Marketing_data',
      version: '1',
      /* Cảnh báo đặt LÊN ĐẦU: Coze cắt mô tả ở 200 ký tự, để cuối là nó bị cắt
       * mất gần hết — cảnh báo mà không ai đọc được thì bằng không có. */
      description: (noiBo ? 'WARNING: server address "' + goc + '" is internal. ' +
        'PUBLIC_URL on Render is wrong, this schema will not work. ' : '') +
        'Read-only, always current: every call reads Lark Base live. This source has NO ' +
        'cost, budget, revenue or commission data. Never answer a money question from it.',
    },
    servers: [{ url: goc, description: noiBo ? 'INTERNAL ADDRESS - see warning above' : 'Marketing Hub' }],
    paths,
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
    },
    security: [{ bearer: [] }],
  };
}

/**
 * Xử lý một request /bot/*. Trả `false` nếu đường dẫn không thuộc nhánh này để
 * server tiếp tục định tuyến như thường.
 *
 * @param timMod  (id) => module | null   — lấy từ server, tránh phụ thuộc vòng
 * @param khoiDong (mod) => void          — bảo đảm module con đang chạy
 */
async function xuLy(req, res, u, { timMod, khoiDong, send, goc }) {
  const p = u.pathname;
  if (!/^\/bot(\/|$)/.test(p)) return false;

  const traLoi = (code, body) => send(res, code, body, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });

  /* Chưa khai BOT_API_TOKEN thì nhánh này coi như KHÔNG TỒN TẠI — trả 404 chứ
   * không trả 401. Trả 401 là đã tự thừa nhận "có cửa ở đây, chỉ thiếu chìa". */
  if (!dangBat()) return traLoi(404, { error: 'Không có đường này' });

  if (req.method !== 'GET') {
    return traLoi(405, { error: 'Nguồn số liệu của trợ lý chỉ nhận GET' });
  }
  if (!coQuyen(req, u)) {
    ghiSo({ luc: Date.now(), duong: p, ket: 'sai-token' });
    return traLoi(401, { error: 'Thiếu hoặc sai token' });
  }

  const now = Date.now();
  if (quaTran(now)) {
    ghiSo({ luc: now, duong: p, ket: 'qua-tran' });
    return traLoi(429, {
      error: 'Gọi quá dày: tối đa ' + TRAN_PHUT + ' lượt mỗi phút. Chờ một chút rồi hỏi lại.',
    });
  }

  if (p === '/bot' || p === '/bot/') {
    return traLoi(200, {
      ten: 'Nguồn số liệu cho trợ lý Marketing',
      congCu: Object.entries(CONG_CU).map(([ten, cc]) => ({
        goi: goc + '/bot/' + ten, nhan: cc.nhan, moTa: cc.moTa,
        thamSo: Object.fromEntries(Object.entries(cc.thamSo).map(([k, v]) => [k, v.moTa])),
      })),
      luuY: 'Chỉ đọc, không có dữ liệu chi phí / doanh thu.',
      schemaChoCoze: goc + '/bot/openapi.json',
      ...(/^https:\/\//.test(goc) ? {} : {
        canhBao: 'PUBLIC_URL chưa khai đúng trên Render nên địa chỉ ở trên là nội bộ ("' +
          goc + '"). Bộ não ở ngoài sẽ không gọi vào được.',
      }),
    });
  }

  if (p === '/bot/openapi.json') return traLoi(200, openapi(goc));

  if (p === '/bot/so') return traLoi(200, { ds: docSo() });

  const ten = p.replace(/^\/bot\//, '').replace(/\/$/, '');
  const cc = CONG_CU[ten];
  if (!cc) {
    return traLoi(404, {
      error: 'Không có công cụ "' + ten + '". Có: ' + Object.keys(CONG_CU).join(', '),
    });
  }

  const mod = timMod(MOD_CUA[ten]);
  if (!mod || mod.kieu !== 'local' || !mod.bat) {
    return traLoi(503, { error: 'Base "' + MOD_CUA[ten] + '" chưa được bật trong panel' });
  }
  khoiDong(mod);

  const q = Object.fromEntries(u.searchParams.entries());
  delete q.token;
  try {
    const kq = await cc.chay(mod, q, now);
    ghiSo({ luc: now, duong: p, hoi: u.search.replace(/token=[^&]*/, 'token=***'),
      ket: kq.loi ? 'tham-so-sai' : 'ok', so: kq.so });
    if (kq.loi) return traLoi(400, { error: kq.loi });
    return traLoi(200, kq);
  } catch (e) {
    ghiSo({ luc: now, duong: p, ket: 'loi', vi: e.message });
    /* Nói được lý do cho bộ não hiểu, nhưng không đổ stack trace ra Internet. */
    return traLoi(502, { error: 'Không đọc được dữ liệu từ Base: ' + e.message });
  }
}

module.exports = {
  xuLy, dangBat, CONG_CU, NGUOI_BOT, TU_KHOA,
  // để test gọi trực tiếp
  khoang, khongDau, khopTen, ngayVN, gioVN, thuVN, dauNgayVN, openapi, bangNhau, gon,
  chiaNguoiGoi,
  TOI_THIEU_TOKEN,
};
