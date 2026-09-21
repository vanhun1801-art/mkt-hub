'use strict';
/**
 * ============================================================================
 * XUẤT DANH SÁCH TÁC NGHIỆP — để TRÌNH ĐỐI TÁC
 * ============================================================================
 *
 * Không phải bản đổ dữ liệu thô. Anh Hùng xuất cái này ra để ngồi với Vinwonders
 * hay Grand World và nói "tháng 9 bên em chạy chừng này buổi cho bên anh". Nên:
 *
 *   · CHI PHÍ MẶC ĐỊNH KHÔNG RA. Đưa nhầm bảng có cột tiền cho đối tác là hỏng
 *     chuyện lớn hơn mọi lỗi kỹ thuật trong app này. Muốn có thì phải tự tick,
 *     và chỉ ai có quyền xem chi phí mới tick được.
 *   · CHỈ LẤY BUỔI ĐÃ CHẠY THẬT. Nháp, chờ duyệt, bị huỷ, bị từ chối — không ai
 *     muốn đối tác thấy. Mặc định là "Đã hoàn tất"; đổi được nếu cần.
 *   · Cột chọn theo thứ tự đối tác đọc: ngày → làm gì → ở đâu → ai đi → sản
 *     phẩm. Mục đích, kế hoạch, phản hồi nội bộ đều KHÔNG ra.
 *
 * Ba lối ra dùng CHUNG một bộ dòng: .xlsx · .csv · bản in (PDF). Tách ra ba chỗ
 * dựng dòng riêng là ba chỗ lệch nhau sau vài lần sửa.
 */
const { ghiXlsx, ghiCsv } = require('../lark-chung/xlsx-ghi');
const { coAnh } = require('../lark-chung/logo');

const chu = (v) => String(v == null ? '' : v).trim();

/** '2026-09-01T15:00:00+07:00' → '01/09/2026'. */
function ngayVN(v) {
  const d = new Date(v);
  if (!v || isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
}
function gioVN(v) {
  const d = new Date(v);
  if (!v || isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getHours()) + ':' + p(d.getMinutes());
}
/** 'YYYY-MM-DD' của một mốc, để so khoảng ngày mà không dính giờ. */
function ngayISO(v) {
  const d = new Date(v);
  if (!v || isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

const ten = (u) => chu(u && (u.name || u.id));
const dsTen = (arr) => (arr || []).map(ten).filter(Boolean);

/**
 * Lọc theo đúng những gì người dùng chọn trên màn hình xuất.
 * Ô nào để trống nghĩa là "không lọc theo nó".
 */
/**
 * Ba ô lọc đều nhận NHIỀU giá trị, ngăn bằng dấu phẩy. Rỗng = không lọc theo ô
 * đó. Anh Hùng cần gộp mấy địa điểm vào một bảng: Vinwonders + Grand World +
 * Sunset Town là ba khu của cùng một đối tác, xuất ba lần rồi dán tay lại là
 * việc app phải làm hộ.
 *
 * Dấu phẩy làm dấu ngăn được vì KHÔNG nhãn nào trong ba danh sách có dấu phẩy —
 * địa điểm, loại hình và trạng thái đều dùng gạch nối hoặc gạch chéo. Thêm nhãn
 * có dấu phẩy thì phải đổi chỗ này; `coDauPhay()` canh đúng điều đó.
 */
const tach = (v) => (chu(v) ? chu(v).split(',').map(chu).filter(Boolean) : null);

/** Nhãn nào lọt dấu phẩy vào là bộ lọc gãy âm thầm — dùng trong phép thử. */
const coDauPhay = (ds) => (ds || []).filter((x) => String(x).includes(','));

function loc(items, dk) {
  const tu = chu(dk.tu);
  const den = chu(dk.den);
  const dd = tach(dk.diaDiem);
  const lh = tach(dk.loaiHinh);
  const tt = tach(dk.trangThai);

  return items.filter((t) => {
    const n = ngayISO(t.start);
    if (tu && (!n || n < tu)) return false;
    if (den && (!n || n > den)) return false;
    if (dd && !dd.includes(chu(t.diaDiem))) return false;
    if (lh && !lh.includes(chu(t.loaiHinh))) return false;
    if (tt && !tt.includes(chu(t.status))) return false;
    return true;
  }).sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));
}

/**
 * Dựng cột + dòng. Một chỗ duy nhất, ba lối ra dùng lại.
 *
 * BỘ CỘT LÀ CỦA NGƯỜI NHẬN, KHÔNG PHẢI CỦA BASE. Bảng này đi ra ngoài phòng —
 * đối tác cầm nó để BỐ TRÍ: xin phép bay flycam, giữ chỗ ăn, cử người đón. Nên
 * cột nào không giúp họ bố trí được thì không có mặt:
 *
 *   · Trạng thái — chuyện nội bộ của phòng (chờ duyệt, đã hoàn tất). Đối tác
 *     đọc "Chờ duyệt/Xử lý" rồi tưởng buổi đó chưa chắc chạy.
 *   · Tên hoạt động — gõ tay, và cố tình chẻ chữ để né bộ lọc nền tảng:
 *     "Li/v/e/stre/a/m", "Liv/e/tream". Đóng mấy cái đó lên văn bản gửi đối tác
 *     thì khó coi. Địa điểm + Loại hình nói đúng chuyện đó mà sạch sẽ, và đó
 *     chính là lý do hai cột ấy ra đời.
 *   · Thời lượng, Link sản phẩm — số của phòng, không phải việc của họ.
 *
 * Đổi lại, ba thứ họ thật sự cần thì đưa vào: KẾ HOẠCH CHI TIẾT (lịch giờ từng
 * buổi), GHI CHÚ TRƯỚC TÁC NGHIỆP (chỗ ghi yêu cầu gửi họ: cấp phép flycam, vé
 * FOC, thiết bị), và tách nhân sự thành phụ trách / đi cùng để họ biết hỏi ai.
 *
 * @param {boolean} keTien có kèm cột chi phí không (đã kiểm quyền ở chỗ gọi)
 */
function dungBang(ds, keTien) {
  const cot = [
    { ten: 'Ngày', rong: 11 },
    { ten: 'Thời gian bắt đầu', rong: 14 },
    { ten: 'Kế hoạch chi tiết', rong: 52 },
    { ten: 'Địa điểm', rong: 19 },
    { ten: 'Loại hình', rong: 18 },
    { ten: 'Nhân sự phụ trách', rong: 22 },
    { ten: 'Nhân sự đi cùng', rong: 24 },
    { ten: 'Ghi chú trước tác nghiệp', rong: 38 },
  ];
  if (keTien) {
    cot.push({ ten: 'Chi phí dự kiến', rong: 15 }, { ten: 'Chi phí thực tế', rong: 15 });
  }

  const hang = ds.map((t) => {
    /* Buổi nhập từ sổ cũ không có giờ, nên start rơi về 00:00. In "00:00" lên
     * bảng đưa đối tác là một con số không nói gì — để trống thì người đọc hiểu
     * ngay là "không ghi giờ". Có giờ kết thúc thì 00:00 là giờ thật, vẫn in. */
    const g1 = gioVN(t.start);
    const gio = (!gioVN(t.end) && g1 === '00:00') ? '' : g1;

    /* Phụ trách và người đi cùng tách làm HAI cột. Gộp một cột thì đối tác đọc
     * ra một đám tên ngang hàng, không biết hỏi ai. Và người đã đứng ở cột phụ
     * trách thì không lặp lại ở cột đi cùng — trong sổ, người đăng ký thường
     * khai chính mình ở cả hai ô, in ra thành hai người đi. */
    const dsPT = dsTen(t.owner);
    const pt = new Set(dsPT);
    const diCung = dsTen(t.staff).filter((x) => !pt.has(x));

    const h = [
      ngayVN(t.start),
      gio,
      chu(t.plan),
      chu(t.diaDiem),
      chu(t.loaiHinh),
      dsPT.join(', '),
      diCung.join(', '),
      chu(t.report),
    ];
    if (keTien) {
      h.push(Number(t.costPlan) || 0, Number(t.costActual) || 0);
    }
    return h;
  });

  return { cot, hang };
}

/**
 * ĐẾM SẴN cho từng lựa chọn của ba ô lọc.
 *
 * Ngày 20/09/2026 anh Hùng lọc Vinwonders · tháng 9 · "Chờ duyệt/Xử lý" và ra
 * 0 buổi, tưởng hỏng. Không hỏng: bốn buổi Vinwonders tháng đó nằm ở "Đã hoàn
 * tất" và "Duyệt/Chờ tác nghiệp". Hai cái tên ấy dùng CÙNG BỘ CHỮ đảo thứ tự —
 * nhìn lướt không phân biệt được, và ô chọn thì bày cả hai như nhau.
 *
 * Nên mỗi lựa chọn mang theo số buổi của nó, tính với các ô lọc CÒN LẠI giữ
 * nguyên. Thấy "(0)" thì không ai chọn vào đó nữa — chặn được ngõ cụt thay vì
 * giải thích sau khi đã lạc vào.
 */
function demTheo(items, dk) {
  const mot = (khoa, lay) => {
    /* Bỏ đúng ô đang đếm ra khỏi bộ lọc: đếm "Đã hoàn tất" mà vẫn lọc theo
     * trạng thái hiện tại thì mọi lựa chọn khác đều ra 0. */
    const conLai = { ...dk, [khoa]: '' };
    const ds = loc(items, conLai);
    const d = {};
    ds.forEach((t) => { const v = chu(lay(t)); if (v) d[v] = (d[v] || 0) + 1; });
    return d;
  };
  return {
    trangThai: mot('trangThai', (t) => t.status),
    diaDiem: mot('diaDiem', (t) => t.diaDiem),
    loaiHinh: mot('loaiHinh', (t) => t.loaiHinh),
  };
}

/**
 * Khi không ra buổi nào: bỏ THỬ từng ô lọc một, xem ô nào đang chặn.
 * Trả về các lối thoát có thật, nhiều buổi nhất đứng trước.
 */
function loiThoat(items, dk) {
  const ten = { trangThai: 'trạng thái', diaDiem: 'địa điểm', loaiHinh: 'loại hình', ngay: 'khoảng ngày' };
  const thu = [];
  for (const k of ['trangThai', 'diaDiem', 'loaiHinh']) {
    if (!chu(dk[k])) continue;
    const so = loc(items, { ...dk, [k]: '' }).length;
    if (so > 0) thu.push({ bo: k, nhan: ten[k], so });
  }
  if (chu(dk.tu) || chu(dk.den)) {
    const so = loc(items, { ...dk, tu: '', den: '' }).length;
    if (so > 0) thu.push({ bo: 'ngay', nhan: ten.ngay, so });
  }
  return thu.sort((a, b) => b.so - a.so);
}

/** Dòng phụ đề: nói rõ bảng này lọc theo cái gì, để người nhận khỏi phải hỏi. */
function moTaLoc(dk, so) {
  const p = [];
  /* Nhiều địa điểm thì nối bằng " + " chứ không để nguyên dấu phẩy: dòng này
   * in lên đầu bảng đưa đối tác, "Vinwonders + Grand World" đọc ra một nhóm,
   * còn "Vinwonders,Grand World" đọc ra một chuỗi máy. */
  if (chu(dk.diaDiem)) p.push(tach(dk.diaDiem).join(' + '));
  if (chu(dk.loaiHinh)) p.push(tach(dk.loaiHinh).join(' + '));
  const tu = chu(dk.tu) ? ngayVN(chu(dk.tu) + 'T00:00:00') : '';
  const den = chu(dk.den) ? ngayVN(chu(dk.den) + 'T00:00:00') : '';
  if (tu || den) p.push((tu || '…') + ' – ' + (den || '…'));
  p.push(so + ' buổi');
  return p.join('  ·  ');
}

/** Tên tệp: có địa điểm và kỳ trong đó, vì tệp này sẽ nằm trong thư mục của đối tác. */
function tenTep(dk, duoi) {
  const sach = (s) => chu(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const p = ['tac-nghiep'];
  /* Ba địa điểm trở lên thì tên tệp dài loằng ngoằng mà vẫn không nói đủ — ghi
   * số lượng gọn hơn, chi tiết đã nằm ở dòng phụ đề trong tệp. */
  if (chu(dk.diaDiem)) {
    const ds = tach(dk.diaDiem);
    p.push(ds.length > 2 ? ds.length + '-dia-diem' : ds.map(sach).join('-'));
  }
  if (chu(dk.tu)) p.push(chu(dk.tu));
  if (chu(dk.den)) p.push(chu(dk.den));
  return p.join('_').toLowerCase() + '.' + duoi;
}

const TIEU_DE = 'ROOTY TRIP · BÁO CÁO TÁC NGHIỆP';

/* Logo đóng lên tệp cao 46px. Giữ nguyên tỉ lệ ảnh gốc: logo Rooty Trip là
 * chữ nằm ngang rất dài (3994×1385), ép vào một ô vuông là bẹp dí. Không đọc
 * được khổ ảnh thì lấy một khổ ngang mặc định còn hơn là bỏ logo. */
const LOGO_CAO = 46;
function khoLogo(logo) {
  if (!logo || !logo.buf || !logo.buf.length) return null;
  const co = coAnh(logo.buf);
  const rong = co && co.cao ? Math.round((co.rong / co.cao) * LOGO_CAO) : 133;
  return { buf: logo.buf, mime: logo.mime, rong, cao: LOGO_CAO };
}

function xuatXlsx(ds, dk, keTien, logo) {
  const { cot, hang } = dungBang(ds, keTien);
  return {
    tep: tenTep(dk, 'xlsx'),
    kieu: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    than: ghiXlsx({
      ten: 'Tác nghiệp', cot, hang,
      tieuDe: TIEU_DE, phuDe: moTaLoc(dk, ds.length),
      logo: khoLogo(logo),
    }),
  };
}

function xuatCsv(ds, dk, keTien) {
  const { cot, hang } = dungBang(ds, keTien);
  return { tep: tenTep(dk, 'csv'), kieu: 'text/csv; charset=utf-8', than: ghiCsv(cot, hang) };
}

module.exports = {
  loc, tach, coDauPhay, dungBang, demTheo, loiThoat, moTaLoc, tenTep,
  xuatXlsx, xuatCsv, khoLogo, ngayVN, gioVN, ngayISO, TIEU_DE, LOGO_CAO,
};
