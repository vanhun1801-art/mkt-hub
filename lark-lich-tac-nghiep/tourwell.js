'use strict';
/**
 * ============================================================================
 * TỰ TẠO ĐƠN TOURWELL KHI QUẢN LÝ BẤM "ĐÃ THANH TOÁN"
 * ============================================================================
 *
 * Anh Hùng vẫn làm tay 22 thao tác cho mỗi buổi tác nghiệp: tạo đơn → chuyển
 * thành công → nhận điều hành → gõ dòng chi phí Quỹ Marketing → hoàn thành.
 * Phần dễ sai nhất là đoạn gõ số (tên, giá, VAT, số lượng, nhà cung cấp), và
 * đúng đoạn đó thì Open API của Tourwell làm được.
 *
 * Module này làm hai lời gọi ghi, đúng hai lời gọi:
 *
 *   1) POST /api/v1/orders/products      — tạo đơn "Dịch vụ khác"
 *   2) POST /api/v1/order-items/{id}/costs — dòng chi phí Quỹ Marketing
 *
 * Đã kiểm chứng trên hệ thống thật ngày 11/09/2026 (đơn RT16407, RT16408):
 * chi phí bắn ở CẤP ĐƠN tự chảy sang phiếu điều hành và Tourwell tự sinh luôn
 * Phiếu đặt dịch vụ cho Quỹ Marketing. Nghĩa là bước 13–21 của quy trình tay
 * biến mất hẳn, không phải nhập lại lần nữa bên điều hành.
 *
 * NHỮNG GÌ API KHÔNG LÀM ĐƯỢC, và đừng mất công tìm:
 *   · chuyển đơn sang "Thành công" + gửi điều hành  (bước 7–8)
 *   · tải tệp đính kèm UNC / hoá đơn                 (bước 9)
 *   · nhận điều hành, hoàn thành phiếu               (bước 11–12, 22)
 *   · đặt ô "Tên dịch vụ" — thử 5 tên trường, máy chủ nhận hết nhưng bỏ qua hết
 * Nên đơn tạo ra dừng ở "Đang xử lý" và app phải nói rõ cho người bấm biết còn
 * phải làm gì. Giấu chuyện đó đi thì tệ hơn là không tự động hoá.
 */
const fs = require('fs');
const path = require('path');

/* ---------------------------------------------------------------------------
 * Số của Rooty Trip. Tất cả đều DÒ ĐƯỢC từ máy chủ thật, không cái nào đoán —
 * xem .tmp/tourwell-do.json. Ghi hằng số ở đây thay vì gọi API tra mỗi lần:
 * chúng là danh mục, cả năm không đổi, mà mỗi lời gọi thêm là thêm một chỗ hỏng.
 * ------------------------------------------------------------------------- */
const SO = {
  nguon: 17,          // Nguồn bán hàng "Khác"
  sale: 33,           // Lê Văn Hùng — người tạo đơn sẽ luôn là "Api Official",
                      // không đổi được, nên ít nhất phải để đúng sale phụ trách
  ncc: 274,           // SUP274 · QUỸ MARKETING (KHÔNG phải 280 "Hoạt động Marketing")
  sanPham: 280,       // *CÔNG TÁC — API đòi product_id, mượn khuôn đơn nội bộ sẵn có
  loaiDichVu: 7,      // "Dịch vụ khác". Tài liệu bảo service_id chỉ nhận 6/10,
                      // nhưng máy chủ nhận 7 — đã thử thật.
  chiNhanh: 1,        // Trụ Sở chính
  vat: 8,             // Anh Hùng chốt: chi phí tác nghiệp luôn 8% ĐÃ GỒM
};

const MAC_DINH_HOST = 'rootytrip.tourwell.net';
const TEP = path.join(__dirname, 'tourwell.json');

/* Đọc lại tệp mỗi lần gọi, không cache: đổi token thì không phải khởi động lại
 * máy chủ. Cùng lối với quyen.json. */
function docCauHinh() {
  let tep = {};
  try { tep = JSON.parse(fs.readFileSync(TEP, 'utf8')); } catch (_) {}
  const host = String(process.env.TOURWELL_HOST || tep.host || MAC_DINH_HOST)
    .trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const token = String(process.env.TOURWELL_TOKEN || tep.token || '').trim();
  /* Tắt được bằng tay: "bật" chỉ khi có token VÀ không bị tắt hẳn. Người dùng
   * phải có cách dừng tính năng này mà không cần xoá token. */
  const tat = process.env.TOURWELL_TAT === '1' || tep.tat === true;
  return { host: 'https://' + host, token, bat: !!token && !tat };
}

const bat = () => docCauHinh().bat;

/* ---------------------------------------------------------------------------
 * Nhịp gọi
 * ------------------------------------------------------------------------- */
/* Tourwell chặn ở 60 yêu cầu/phút. Một lần bấm nút chỉ tốn 3 lời gọi nên không
 * cần thưa như bản kéo dữ liệu hàng loạt; nhưng hàng đợi phải ở MỨC MODULE để
 * hai người cùng bấm "Đã thanh toán" một lúc vẫn không vượt trần. */
const GIAN_MS = Number(process.env.TOURWELL_GIAN_MS || 1100);
const nghi = (ms) => new Promise((r) => setTimeout(r, ms));
let hangDoi = Promise.resolve();
let lucCuoi = 0;
function xepHang(viec) {
  const kq = hangDoi.then(async () => {
    const cach = Date.now() - lucCuoi;
    if (cach < GIAN_MS) await nghi(GIAN_MS - cach);
    lucCuoi = Date.now();
    return viec();
  });
  // Hàng đợi không được chết vì một việc lỗi, nếu không mọi lời gọi sau đều tắc
  hangDoi = kq.then(() => {}, () => {});
  return kq;
}

/** Một lời gọi. Token đi ở header, và mọi câu lỗi đều bằng tiếng người. */
async function goi(method, duong, than) {
  const cf = docCauHinh();
  if (!cf.token) throw new Error('Chưa khai token Tourwell (tourwell.json hoặc biến TOURWELL_TOKEN)');

  /* Token có dấu tiếng Việt = gần như chắc chắn dán nhầm chữ mẫu (`<token
   * thật>`) chứ không phải token hỏng. Không chặn ở đây thì fetch ném "Cannot
   * convert argument to a ByteString because the character at index 16 has a
   * value of 7853" — một câu không nói lên điều gì, và người đọc sẽ đi tìm lỗi
   * trong code thay vì nhìn lại dòng lệnh mình vừa gõ. */
  if (/[^\x20-\x7E]/.test(cf.token)) {
    throw new Error('Token Tourwell chứa ký tự không phải chữ/số ASCII — nhiều khả năng '
      + 'còn là chữ mẫu chưa thay. Token thật là một chuỗi chữ và số không dấu, '
      + 'lấy ở Cấu hình → Quản lý tài khoản → tài khoản "Api Official".');
  }

  const lam = async () => {
    let r, text;
    try {
      r = await fetch(cf.host + duong, {
        method,
        headers: {
          Authorization: 'Bearer ' + cf.token,
          Accept: 'application/json',
          ...(than ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(than ? { body: JSON.stringify(than) } : {}),
      });
      text = await r.text();
    } catch (e) {
      throw new Error('Không gọi được Tourwell: ' + String(e.message || e).split(cf.token).join('***'));
    }
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}

    if (r.status === 401) {
      throw new Error('Tourwell từ chối token (401). Lấy lại ở Cấu hình → Quản lý tài khoản '
        + '→ tài khoản "Api Official".');
    }
    if (r.status === 429) {
      throw new Error('Tourwell đang chặn vì quá nhiều yêu cầu (429). Chờ một phút rồi bấm lại.');
    }
    if (!r.ok) {
      /* 422 là chuyện hay gặp nhất và luôn kèm lý do cụ thể (thiếu trường, id
       * không tồn tại). Đưa nguyên văn ra cho người bấm nút đọc, đừng nuốt. */
      const ly = json ? JSON.stringify(json) : text;
      throw new Error('Tourwell ' + duong + ': HTTP ' + r.status + ' — '
        + String(ly).split(cf.token).join('***').slice(0, 300));
    }
    if (!json) throw new Error('Tourwell trả về thứ không đọc được ở ' + duong);
    return json;
  };

  return xepHang(lam);
}

/* ---------------------------------------------------------------------------
 * Dựng thân yêu cầu — phần TINH KHIẾT, kiểm được bằng test không cần mạng
 * ------------------------------------------------------------------------- */

/** Tourwell nhận ngày dạng DD/MM/YYYY, không phải ISO. */
function ngayVN(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  /* Base ghi giờ Việt Nam, còn máy chủ Render chạy giờ UTC. Cộng 7 tiếng rồi
   * đọc theo UTC để buổi tác nghiệp 21h tối không bị lùi sang hôm trước. */
  const vn = new Date(d.getTime() + 7 * 3600000);
  const p = (n) => String(n).padStart(2, '0');
  return p(vn.getUTCDate()) + '/' + p(vn.getUTCMonth() + 1) + '/' + vn.getUTCFullYear();
}

/** Tên hoạt động đi vào Ghi chú đơn hàng và dòng chi phí — hai chỗ DUY NHẤT nhận được chữ. */
function moTa(lich) {
  const ten = String((lich && lich.title) || '').trim() || 'Tác nghiệp Marketing';
  const ngay = ngayVN(lich && lich.start);
  return ngay ? ten + ' (' + ngay + ')' : ten;
}

function thanDon(lich) {
  const ten = moTa(lich);
  return {
    /* Khách: đúng người vẫn đứng tên đơn khi anh Hùng làm tay. Trùng số/email
     * thì Tourwell nối vào khách sẵn có, không đẻ bản ghi khách mới. */
    contact_name: 'Lê Văn Hùng',
    contact_phone: '0344784461',
    contact_email: 'hunglv@rootytrip.com',
    product_id: SO.sanPham,
    service_id: SO.loaiDichVu,
    depart_date: ngayVN(lich && lich.start),
    note_order: ten,
    source_id: SO.nguon,
    branch_office_id: SO.chiNhanh,
    follower_id: SO.sale,
    vat_type: 'not-vat',
    /* Đơn chi phí nội bộ không có doanh thu: giá bán 0. Bảng này vẫn bắt buộc,
     * và `description` của nó hiện ra ở cột "Đối tượng" của đơn. */
    pricing: [{
      price_rule_id: 0,
      price: 0,
      quantity: 1,
      period: 1,
      vat: { type: 'percent', amount: 0 },
      description: ten,
      unit: 'lần',
    }],
  };
}

function thanChiPhi(lich) {
  const ten = moTa(lich);
  return {
    type_of_service_id: SO.loaiDichVu,
    supplier_id: SO.ncc,
    description: ten,
    price: Math.round(Number(lich && lich.costActual) || 0),
    quantity: 1,
    period: 1,
    unit: 'lần',
    /* 8% ĐÃ GỒM: Tourwell tự tách ra trước/sau VAT (100.000 → 92.593 + 7.407).
     * Đặt nhầm sang `not-vat` là số tiền chi vẫn đúng nhưng thuế lệch. */
    vat: SO.vat,
    vat_mode: 'percent',
    vat_type: 'inc-vat',
    currency_code: 'vnd',
    exchange_rate: 1,
    note: ten,
  };
}

/* ---------------------------------------------------------------------------
 * Việc thật
 * ------------------------------------------------------------------------- */

/**
 * Tạo đơn + bắn dòng chi phí cho một lịch tác nghiệp.
 *
 * Người gọi phải tự chốt hai điều TRƯỚC khi gọi (vì chỉ người gọi biết):
 *   · lịch chưa có mã đơn  — bấm hai lần là hai đơn, Tourwell không chống trùng hộ
 *   · chi phí thực tế > 0
 */
async function taoDonChoLich(lich) {
  const tien = Math.round(Number(lich && lich.costActual) || 0);
  if (!(tien > 0)) throw new Error('Lịch chưa có chi phí thực tế nên không tạo đơn');

  /* 1) Đơn. Từ đây trở đi trên Tourwell ĐÃ CÓ một đơn thật; mọi lỗi phía sau
   *    phải trả kèm mã đơn để người dùng còn vào xử lý tiếp, đừng nuốt mất. */
  const r1 = await goi('POST', '/api/v1/orders/products', thanDon(lich));
  const d1 = (r1 && r1.data) || {};
  if (!d1.id) throw new Error('Tourwell không trả về mã đơn vừa tạo');
  const don = {
    id: d1.id,
    ma: d1.code || ('#' + d1.id),
    link: d1.link_erp || (docCauHinh().host + '/admin/order/' + d1.id + '/show'),
  };

  try {
    /* 2) Đọc lại để lấy item_id. Không có đường tắt: bản tạo đơn chỉ trả id/code,
     *    còn item_id nằm ở services[].id của bản chi tiết. */
    const r2 = await goi('GET', '/api/v1/orders/' + don.id);
    const dv = ((((r2 || {}).data || {}).services) || [])[0] || {};
    if (!dv.id) throw new Error('Đơn vừa tạo chưa có dòng dịch vụ nào để gắn chi phí');

    /* 3) Dòng chi phí Quỹ Marketing. Đây mới là thứ điều hành và kế toán nhìn. */
    await goi('POST', '/api/v1/order-items/' + dv.id + '/costs', thanChiPhi(lich));
    return { ...don, itemId: dv.id, tien, dayDu: true };
  } catch (e) {
    /* Đơn đã tạo mà chi phí chưa vào: KHÔNG huỷ đơn hộ. Người dùng có thể đã
     * kịp thấy nó; việc cần làm là nói rõ đơn nào còn thiếu gì. */
    return { ...don, tien, dayDu: false, loi: e.message };
  }
}

module.exports = { SO, docCauHinh, bat, ngayVN, moTa, thanDon, thanChiPhi, taoDonChoLich, GIAN_MS };
