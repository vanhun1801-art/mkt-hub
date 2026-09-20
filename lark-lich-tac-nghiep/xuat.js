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
function loc(items, dk) {
  const tu = chu(dk.tu);
  const den = chu(dk.den);
  const dd = chu(dk.diaDiem);
  const lh = chu(dk.loaiHinh);
  /* trangThai rỗng = mọi trạng thái. Nhiều trạng thái ngăn bằng dấu phẩy. */
  const tt = chu(dk.trangThai) ? chu(dk.trangThai).split(',').map(chu).filter(Boolean) : null;

  return items.filter((t) => {
    const n = ngayISO(t.start);
    if (tu && (!n || n < tu)) return false;
    if (den && (!n || n > den)) return false;
    if (dd && chu(t.diaDiem) !== dd) return false;
    if (lh && chu(t.loaiHinh) !== lh) return false;
    if (tt && !tt.includes(chu(t.status))) return false;
    return true;
  }).sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));
}

/**
 * Dựng cột + dòng. Một chỗ duy nhất, ba lối ra dùng lại.
 *
 * @param {boolean} keTien có kèm cột chi phí không (đã kiểm quyền ở chỗ gọi)
 */
function dungBang(ds, keTien) {
  const cot = [
    { ten: 'Ngày', rong: 11 },
    { ten: 'Giờ', rong: 12 },
    { ten: 'Nội dung tác nghiệp', rong: 42 },
    { ten: 'Địa điểm', rong: 20 },
    { ten: 'Loại hình', rong: 18 },
    { ten: 'Thời lượng', rong: 11 },
    { ten: 'Nhân sự', rong: 30 },
    { ten: 'Link sản phẩm', rong: 34 },
    { ten: 'Trạng thái', rong: 18 },
  ];
  if (keTien) {
    cot.push({ ten: 'Chi phí dự kiến', rong: 15 }, { ten: 'Chi phí thực tế', rong: 15 });
  }

  const hang = ds.map((t) => {
    /* Buổi nhập từ sổ cũ không có giờ, nên start rơi về 00:00. In "00:00" lên
     * bảng đưa đối tác là một con số không nói gì — để trống thì người đọc hiểu
     * ngay là "không ghi giờ". Có giờ kết thúc thì vẫn hiện cả hai, vì lúc đó
     * 00:00 là giờ thật. */
    const g1 = gioVN(t.start);
    const g2 = gioVN(t.end);
    const gio = (!g2 && g1 === '00:00') ? '' : [g1, g2].filter(Boolean).join(' – ');
    /* Phụ trách đứng đầu rồi tới người đi cùng, không trùng tên. Đối tác đọc
     * cột này để biết bên mình cử mấy người. */
    const nguoi = [...new Set([...dsTen(t.owner), ...dsTen(t.staff)])].join(', ');
    const h = [
      ngayVN(t.start),
      gio,
      chu(t.title),
      chu(t.diaDiem),
      chu(t.loaiHinh),
      chu(t.duration),
      nguoi,
      chu(t.link),
      chu(t.status),
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
  if (chu(dk.diaDiem)) p.push(chu(dk.diaDiem));
  if (chu(dk.loaiHinh)) p.push(chu(dk.loaiHinh));
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
  if (chu(dk.diaDiem)) p.push(sach(dk.diaDiem));
  if (chu(dk.tu)) p.push(chu(dk.tu));
  if (chu(dk.den)) p.push(chu(dk.den));
  return p.join('_').toLowerCase() + '.' + duoi;
}

const TIEU_DE = 'ROOTY TRIP · BÁO CÁO TÁC NGHIỆP';

function xuatXlsx(ds, dk, keTien) {
  const { cot, hang } = dungBang(ds, keTien);
  return {
    tep: tenTep(dk, 'xlsx'),
    kieu: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    than: ghiXlsx({
      ten: 'Tác nghiệp', cot, hang,
      tieuDe: TIEU_DE, phuDe: moTaLoc(dk, ds.length),
    }),
  };
}

function xuatCsv(ds, dk, keTien) {
  const { cot, hang } = dungBang(ds, keTien);
  return { tep: tenTep(dk, 'csv'), kieu: 'text/csv; charset=utf-8', than: ghiCsv(cot, hang) };
}

module.exports = {
  loc, dungBang, demTheo, loiThoat, moTaLoc, tenTep,
  xuatXlsx, xuatCsv, ngayVN, gioVN, ngayISO, TIEU_DE,
};
