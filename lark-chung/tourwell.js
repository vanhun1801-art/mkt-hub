'use strict';
/**
 * ============================================================================
 * TẠO ĐƠN CHI PHÍ TRÊN TOURWELL — module dùng chung
 * ============================================================================
 *
 * Dùng bởi HAI app: "Lịch tác nghiệp" (bấm Đã thanh toán) và "Quỹ chi phí"
 * (khai một khoản chi). Để chung một chỗ vì mọi con số ở đây — nhà cung cấp
 * Quỹ Marketing, VAT 8% đã gồm, nguồn Khác — là quy ước kế toán của công ty.
 * Chép đôi thì sửa VAT một nơi là nơi kia sai lặng lẽ, và sai đúng vào tiền.
 *
 * Anh Hùng vẫn làm tay 22 thao tác cho mỗi khoản chi: tạo đơn → chuyển thành
 * công → nhận điều hành → gõ dòng chi phí Quỹ Marketing → hoàn thành. Phần dễ
 * sai nhất là đoạn gõ số (tên, giá, VAT, số lượng, nhà cung cấp), và đúng đoạn
 * đó thì Open API của Tourwell làm được.
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
/* Ba chỗ tìm token, theo thứ tự: biến môi trường (Render) → tourwell.json cạnh
 * module này → chỗ cũ trong app Lịch tác nghiệp. Giữ chỗ cũ để anh Hùng không
 * phải khai lại token lần nữa sau khi tách module. */
const CAC_TEP = [
  path.join(__dirname, 'tourwell.json'),
  path.join(__dirname, '..', 'lark-lich-tac-nghiep', 'tourwell.json'),
];

/* Đọc lại tệp mỗi lần gọi, không cache: đổi token thì không phải khởi động lại
 * máy chủ. Cùng lối với quyen.json. */
/**
 * Chuẩn hoá địa chỉ máy chủ về ĐÚNG phần gốc, bỏ mọi đường dẫn phía sau.
 *
 * Cắt tay bằng replace() là chưa đủ: biến trên Render có thể mang cả đường dẫn
 * (`https://rootytrip.tourwell.net/admin`), và khi đó mọi lời gọi thành
 * `/admin/api/v1/...` → Tourwell trả 404 "Resource not found". Đúng lỗi đã xảy
 * ra trên bản web ngày 12/09/2026, trong khi cùng token chạy tốt ở máy vì ở máy
 * đọc host từ tệp, không qua biến đó.
 *
 * Dùng URL() để lấy origin, hỏng thì lùi về cách cắt tay.
 */
function chuanHost(v) {
  let s = String(v == null ? '' : v).trim();
  if (!s) return 'https://' + MAC_DINH_HOST;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    return new URL(s).origin;
  } catch (_) {
    return 'https://' + String(v).trim()
      .replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  }
}

function docCauHinh() {
  let tep = {};
  for (const t of CAC_TEP) {
    try { tep = JSON.parse(fs.readFileSync(t, 'utf8')); break; } catch (_) { /* thử chỗ kế */ }
  }
  /* TOURWELL_BASE_URL là cái tên anh Hùng đã đặt sẵn trên Render cho app Ads
   * Manager, và Hub truyền cả process.env xuống app con — nên app này phải
   * nhận đúng cái tên đó, đừng bắt khai thêm một biến nữa cho cùng một máy chủ. */
  const host = chuanHost(process.env.TOURWELL_HOST || process.env.TOURWELL_BASE_URL
    || tep.host || MAC_DINH_HOST);
  const token = String(process.env.TOURWELL_TOKEN || tep.token || '').trim();
  /* Tắt được bằng tay: "bật" chỉ khi có token VÀ không bị tắt hẳn. Người dùng
   * phải có cách dừng tính năng này mà không cần xoá token. */
  const tat = process.env.TOURWELL_TAT === '1' || tep.tat === true;
  return { host, token, bat: !!token && !tat };
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
       * không tồn tại). Đưa nguyên văn ra cho người bấm nút đọc, đừng nuốt.
       *
       * Kèm cả HOST vào câu lỗi: một cái 404 mà không biết gọi vào địa chỉ nào
       * thì mò rất lâu — đúng chuyện đã xảy ra trên bản web hôm 12/09/2026. */
      const ly = json ? JSON.stringify(json) : text;
      throw new Error('Tourwell ' + cf.host + duong + ': HTTP ' + r.status + ' — '
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

/**
 * Tên khoản chi đi vào Ghi chú đơn hàng và dòng chi phí — hai chỗ DUY NHẤT
 * Tourwell nhận được chữ (ô "Tên dịch vụ" không đặt được qua API).
 *
 * @param k {{ten, ngay, tien}} khoản chi — app gọi tự quy đổi về hình dạng này
 */
function moTa(k) {
  const ten = String((k && k.ten) || '').trim() || 'Chi phí Marketing';
  const ngay = ngayVN(k && k.ngay);
  return ngay ? ten + ' (' + ngay + ')' : ten;
}

function thanDon(k) {
  const ten = moTa(k);
  return {
    /* Khách: đúng người vẫn đứng tên đơn khi anh Hùng làm tay. Trùng số/email
     * thì Tourwell nối vào khách sẵn có, không đẻ bản ghi khách mới. */
    contact_name: 'Lê Văn Hùng',
    contact_phone: '0344784461',
    contact_email: 'hunglv@rootytrip.com',
    product_id: SO.sanPham,
    service_id: SO.loaiDichVu,
    depart_date: ngayVN(k && k.ngay),
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

function thanChiPhi(k) {
  const ten = moTa(k);
  return {
    type_of_service_id: SO.loaiDichVu,
    supplier_id: SO.ncc,
    description: ten,
    price: Math.round(Number(k && k.tien) || 0),
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
 * Tạo đơn + bắn dòng chi phí cho MỘT khoản chi.
 *
 * @param k {{ten, ngay, tien}}
 *
 * Người gọi phải tự chốt một điều TRƯỚC khi gọi, vì chỉ người gọi biết: bản ghi
 * này đã có mã đơn chưa. Gọi hai lần là hai đơn thật — Tourwell không chống
 * trùng hộ.
 */
async function taoDon(k) {
  const tien = Math.round(Number(k && k.tien) || 0);
  if (!(tien > 0)) throw new Error('Khoản chi chưa có số tiền nên không tạo đơn');

  /* 1) Đơn. Từ đây trở đi trên Tourwell ĐÃ CÓ một đơn thật; mọi lỗi phía sau
   *    phải trả kèm mã đơn để người dùng còn vào xử lý tiếp, đừng nuốt mất. */
  const r1 = await goi('POST', '/api/v1/orders/products', thanDon(k));
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
    await goi('POST', '/api/v1/order-items/' + dv.id + '/costs', thanChiPhi(k));
    return { ...don, itemId: dv.id, tien, dayDu: true };
  } catch (e) {
    /* Đơn đã tạo mà chi phí chưa vào: KHÔNG huỷ đơn hộ. Người dùng có thể đã
     * kịp thấy nó; việc cần làm là nói rõ đơn nào còn thiếu gì. */
    return { ...don, tien, dayDu: false, loi: e.message };
  }
}

module.exports = { SO, docCauHinh, bat, ngayVN, moTa, thanDon, thanChiPhi, taoDon, GIAN_MS };
