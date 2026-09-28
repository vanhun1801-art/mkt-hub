'use strict';
/**
 * Nối TAY một hội thoại quảng cáo với một lead Tourwell, rồi ghi mã quảng cáo
 * vào ghi chú của lead đó.
 *
 * VÌ SAO PHẢI CÓ. Đo ngày 28/09/2026: 97% hội thoại TikTok có gắn quảng cáo mà
 * không kèm số điện thoại, nên đường ghi công `số điện thoại → lead → đơn` mù
 * gần hết. Mọi hướng lấy số tự động đều đã dò và chết (xem khối "CHỖ MÙ 96%"
 * đầu sync/roas.js). Phần còn lại chỉ có NGƯỜI biết: sales đang chat với khách
 * thì biết khách đó thành lead nào.
 *
 * Module này KHÔNG tự nối. Nó chỉ xếp ra những cặp ĐÁNG NGỜ LÀ MỘT, kèm lý do,
 * để người bấm xác nhận. Ba nguyên tắc:
 *
 *   1. Chỉ gợi ý hội thoại quy về ĐÚNG MỘT quảng cáo. Hội thoại dính hai quảng
 *      cáo thì bản thân nó đã không trả lời được câu "quảng cáo nào", nối vào
 *      chỉ là đẩy chỗ đoán xuống một tầng.
 *   2. Chỉ gợi ý lead CHƯA có mã quảng cáo trong ghi chú. Ghi đè lên một quyết
 *      định đã có là xoá dấu vết của người trước.
 *   3. Mỗi lead chỉ nhận MỘT gợi ý — cái điểm cao nhất. Bày ba lựa chọn cho một
 *      lead là bắt người dùng đoán hộ máy.
 *
 * Ghi vào ghi chú chứ không vào một bảng riêng, vì Tourwell cho PUT ghi chú
 * (tourwellapi.ghiGhiChuLead) và bản đọc lead trả luôn ghi chú về — nên vòng
 * ghi-rồi-đọc-lại khép kín, không cần thêm kho nào.
 */
const { chuanTen } = require('./pancake');

/** Dòng máy đọc được, nằm trong khối mốc của tourwellapi.ghepGhiChu. */
const KHOA_QC = 'QC=';
const KHOA_HT = 'HT=';
const KHOA_NT = 'NT=';

const cachNgay = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/**
 * Đọc mã quảng cáo mà người đã ghi vào ghi chú lead.
 *
 * Bắt cả khi ai đó sửa tay khoảng trắng hay xuống dòng: chỉ cần chuỗi `QC=<số>`
 * xuất hiện là nhận. Không đòi đúng khối mốc, vì đòi thế thì một lần sửa tay
 * vô hại cũng làm mất luôn quyết định đã ghi.
 */
function docMaQC(ghiChu) {
  const m = String(ghiChu || '').match(/QC=\s*([A-Za-z0-9_-]+)/);
  return m ? m[1] : '';
}

/** Thân ghi chú máy ghi — một dòng một khoá, dễ đọc bằng mắt lẫn bằng regex. */
function thanGhiChu({ adId, tenQC, hoiThoaiId, nenTang, nguoiNoi, luc }) {
  return [
    `${KHOA_QC}${adId}`,
    tenQC ? `TEN=${tenQC}` : '',
    hoiThoaiId ? `${KHOA_HT}${hoiThoaiId}` : '',
    nenTang ? `${KHOA_NT}${nenTang}` : '',
    nguoiNoi ? `NGUOI=${nguoiNoi}` : '',
    `LUC=${luc || new Date().toISOString()}`,
  ].filter(Boolean).join('\n');
}

/**
 * Xếp ra các cặp (hội thoại × lead) đáng ngờ là một.
 *
 * Hàm THUẦN — đây là chỗ quyết định app gợi ý gì, và gợi ý sai ở đây là dẫn
 * người dùng gán doanh thu cho nhầm quảng cáo. Phải kiểm được mà không cần mạng.
 *
 * @param {Array}  hoiThoai  hội thoại đã chuẩn hoá (sync/pancake chuanHoa)
 * @param {Array}  leads     lead Tourwell (có apiId, khach, ngay, ghiChu, nguon)
 * @param {Array}  don       đơn Tourwell — chỉ để biết lead nào đã ra tiền
 * @param {number} cuaSo     số ngày tối đa giữa hội thoại và lead
 * @returns {{capDoi: Array, boQua: Object}}
 */
function goiY({ hoiThoai = [], leads = [], don = [], cuaSo = 3 } = {}) {
  /* Tách `leadLechNgay` ra khỏi `khongThayLead`: hai lý do khác hẳn nhau, mà gộp
   * lại thì màn hình nói "không tìm được lead khớp" trong khi sự thật là tìm
   * được nhưng lead có TRƯỚC hội thoại. Đo 28/09: 17/18 ca khớp tên rơi đúng vào
   * ô này — gộp là giấu mất phát hiện quan trọng nhất của cả phép đo. */
  const boQua = { daCoMaQC: 0, nhieuQuangCao: 0, coSoDienThoai: 0,
    khongTenDungDuoc: 0, khongThayLead: 0, leadLechNgay: 0 };

  /* Lead nào đã có mã quảng cáo rồi thì không đụng tới. */
  const leadMo = leads.filter((l) => {
    if (docMaQC(l.ghiChu)) { boQua.daCoMaQC += 1; return false; }
    return !!l.apiId;
  });

  /* Tra theo tên và theo ngày. Tên TRÙNG giữa nhiều lead thì bỏ hẳn — hai khách
   * cùng tên thì không ai biết hội thoại thuộc ai, kể cả người bấm. */
  const theoTen = new Map();
  const tenTrung = new Set();
  leadMo.forEach((l) => {
    const t = chuanTen(l.khach);
    if (!t) return;
    if (theoTen.has(t)) { tenTrung.add(t); return; }
    theoTen.set(t, l);
  });
  tenTrung.forEach((t) => theoTen.delete(t));

  const theoNgay = new Map();
  leadMo.forEach((l) => {
    if (!l.ngay) return;
    if (!theoNgay.has(l.ngay)) theoNgay.set(l.ngay, []);
    theoNgay.get(l.ngay).push(l);
  });

  const donTheoKH = new Map();
  don.forEach((d) => {
    if (!d.kh) return;
    if (!donTheoKH.has(d.kh)) donTheoKH.set(d.kh, []);
    donTheoKH.get(d.kh).push(d);
  });

  /* Mỗi lead chỉ giữ MỘT gợi ý, cái điểm cao nhất. */
  const tot = new Map();
  hoiThoai.forEach((h) => {
    if ((h.sdt || []).filter(Boolean).length) { boQua.coSoDienThoai += 1; return; }
    const ads = [...new Set(h.adIds || [])];
    if (ads.length !== 1) { if (ads.length > 1) boQua.nhieuQuangCao += 1; return; }

    const tens = [...new Set([...(h.tenKhachDs || []), h.tenKhach]
      .filter(Boolean).map(chuanTen).filter(Boolean))];
    if (!tens.length) { boQua.khongTenDungDuoc += 1; return; }

    /* Tên khớp là tín hiệu mạnh nhất còn lại. Nhiều tên của cùng hội thoại chỉ
     * về nhiều lead khác nhau thì bỏ — không chọn bừa cái đầu. */
    const ung = [...new Set(tens.map((t) => theoTen.get(t)).filter(Boolean))];
    if (ung.length !== 1) { boQua.khongThayLead += 1; return; }
    const lead = ung[0];

    /* Ngày phải hợp lý: lead sinh ra SAU hội thoại (hoặc cùng ngày), trong cuaSo
     * ngày. Lead có trước hội thoại thì hội thoại này không sinh ra nó. */
    /* Lead phải sinh ra SAU hội thoại. Đo 28/09: 17 trong 18 ca khớp tên có lead
     * sinh ra TRƯỚC hội thoại 38–62 ngày — đó là KHÁCH CŨ quay lại nhắn, không
     * phải quảng cáo này sinh ra lead ấy. Gợi ý những cặp đó là dẫn người dùng
     * gán doanh thu tháng 6 cho quảng cáo tháng 8, rồi GHI LẠI cái sai đó. */
    const tre = (h.ngay && lead.ngay) ? cachNgay(h.ngay, lead.ngay) : null;
    if (tre == null || tre < 0 || tre > cuaSo) { boQua.leadLechNgay += 1; return; }

    const donCua = donTheoKH.get(lead.kh) || [];
    const tien = donCua.reduce((a, d) => a + (d.tien || 0), 0);

    /* Điểm: cùng ngày chắc hơn lệch ngày; có đơn thì đáng nối trước, vì nối nó
     * mới ra tiền. Điểm chỉ dùng để XẾP THỨ TỰ, không dùng để tự quyết. */
    const diem = 100 - tre * 10 + (donCua.length ? 20 : 0);
    const cu = tot.get(lead.apiId);
    if (cu && cu.diem >= diem) return;

    tot.set(lead.apiId, {
      diem,
      leadApiId: lead.apiId,
      leadMa: lead.ma || '',
      leadKhach: lead.khach || '',
      leadNgay: lead.ngay || '',
      leadNguon: lead.nguon || '',
      ghiChuCu: lead.ghiChu || '',
      hoiThoaiId: h.id,
      hoiThoaiNgay: h.ngay || '',
      pageId: h.pageId || '',
      khachId: h.khachId || '',
      tenKhachPancake: (h.tenKhachDs || [])[0] || h.tenKhach || '',
      nenTang: h.platform || '',
      adId: ads[0],
      soTinNhan: h.soTinNhan || 0,
      soDon: donCua.length,
      tien,
      leTre: tre,
      lyDo: tre === 0
        ? 'Tên khách trùng khớp và lead tạo cùng ngày với hội thoại'
        : `Tên khách trùng khớp, lead tạo sau hội thoại ${tre} ngày`,
    });
  });

  const capDoi = [...tot.values()].sort((a, b) => (b.tien - a.tien) || (b.diem - a.diem));
  return { capDoi, boQua };
}

module.exports = { goiY, docMaQC, thanGhiChu, KHOA_QC };
