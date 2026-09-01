'use strict';
/**
 * Adapter Tourwell Open API — thay cho việc xuất Excel bằng tay.
 *
 * Vì sao trước đây kết luận là "không đọc được": tôi nhìn nhầm màn hình. Chỗ
 * `Cấu hình → API Key` chỉ có Danh mục `pancake` là dành cho tích hợp Pancake.
 * Token Open API nằm ở **Cấu hình → Quản lý tài khoản**, trên tài khoản tên
 * `Api Official` (email `api@admin.com`), và **không có hạn dùng**.
 *
 * Ba endpoint dùng ở đây:
 *   GET /api/v1/leads      ?created_at=DD/MM/YYYY - DD/MM/YYYY
 *   GET /api/v1/orders     ?created_at=DD/MM/YYYY - DD/MM/YYYY
 *   GET /api/v1/customers  (lấy số điện thoại — bản lead KHÔNG kèm số)
 *
 * Hai chỗ cố ý làm phòng thủ:
 *
 * 1. **Hình dạng dữ liệu trả về chưa được tài liệu hoá đầy đủ.** Riêng
 *    `Get all order` bỏ trống hẳn phần schema. Nên mọi trường đều đọc qua
 *    `lay()` dò nhiều tên, và `test()` in ra ĐÚNG những khoá thật sự nhận được
 *    thay vì để người dùng tin vào tài liệu.
 *
 * 2. **Tiền có thể là số, là chuỗi "40,000,000", hoặc là object {original,…}.**
 *    Đọc sai thì cả cột tiền về 0 mà không có lỗi nào — đúng cái bẫy đã xảy ra
 *    một lần với bản đọc Excel.
 *
 * Hình dạng trả ra GIỐNG HỆT `sync/tourwell.js` (bản đọc Excel), để `sync/roas.js`
 * không phải biết dữ liệu đến từ đường nào.
 */
const { request, scrub, hideSecret } = require('./http');

const NHAN = 'Tourwell';
const MOI_TRANG = 100;      // xin nhiều nhất có thể, máy chủ tự cắt nếu vượt
const MAX_TRANG = 200;      // chặn vòng lặp nếu phân trang không tiến

/* Tourwell ghi 60 yêu cầu/phút. Giãn 1,1 giây ra đúng 55/phút — sát trần, không
 * còn khoảng dư nào, và đã ăn 429 thật. 1,5 giây ra 40/phút, đủ thưa để chịu được
 * cả trường hợp một lượt cũ còn đang chạy dở. */
const GIAN_MS = Number(process.env.TOURWELL_GIAN_MS || 1500);

/* Chờ tối đa bao lâu khi bị 429. Hub cho mỗi lời gọi 4 phút nên không chờ quá lâu
 * được; chờ hết mức này mà vẫn 429 thì báo ra chứ đừng treo im. */
const CHO_429_MS = Number(process.env.TOURWELL_CHO_429_MS || 70000);

const nghi = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Điều nhịp Ở MỨC MODULE, không phải trong từng vòng lặp.
 *
 * Vì sao quan trọng: hub cắt lời gọi ở 4 phút nhưng module VẪN CHẠY TIẾP phần
 * việc còn lại. Người dùng thấy lỗi rồi bấm lại — thành hai luồng cùng gọi
 * Tourwell, mỗi luồng tự giãn 1,5 giây nhưng cộng lại là 80/phút. Vượt trần mà
 * không ai hiểu vì sao. Một hàng đợi dùng chung cho cả tiến trình thì không thể
 * xảy ra chuyện đó.
 */
let hangDoi = Promise.resolve();
let lucCuoi = 0;
function xepHang(viec) {
  const ketQua = hangDoi.then(async () => {
    const cach = Date.now() - lucCuoi;
    if (cach < GIAN_MS) await nghi(GIAN_MS - cach);
    lucCuoi = Date.now();
    return viec();
  });
  // Hàng đợi không được chết vì một việc lỗi, nếu không mọi lời gọi sau đều tắc
  hangDoi = ketQua.then(() => {}, () => {});
  return ketQua;
}

/** `rootytrip.tourwell.net`, có hay không có https, có hay không có / cuối — đều nhận. */
function chuanHost(v) {
  let s = String(v == null ? '' : v).trim();
  if (!s) return '';
  s = s.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    return `https://${u.host}`;
  } catch (_) { return ''; }
}

/** Tourwell lọc theo chuỗi `DD/MM/YYYY - DD/MM/YYYY`, không phải ISO. */
function khoangNgay(from, to) {
  const d = (s) => {
    const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
  };
  const a = d(from);
  const b = d(to);
  if (!a || !b) return '';
  return `${a} - ${b}`;
}

/** Đọc một trường qua nhiều tên có thể có, đi được cả đường `a.b.c`. */
function lay(o, ...duong) {
  for (const d of duong) {
    let v = o;
    for (const k of String(d).split('.')) {
      if (v == null || typeof v !== 'object') { v = undefined; break; }
      v = v[k];
    }
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

/**
 * Tiền: nhận số, chuỗi "40,000,000" / "40.000.000", hoặc object {original, forex}.
 * Đọc sai thì cả cột về 0 mà không có lỗi nào — đã trả giá một lần ở bản Excel.
 */
function tien(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'object') {
    /* Tourwell bọc tiền trong object. Ở phần `services[].prices` thấy dạng
     * {original, forex}; ở cấp đơn thì chưa có tài liệu nào mô tả, nên dò rộng.
     * Mảng thì cộng lại — có API trả [{amount}] cho từng đợt thanh toán. */
    if (Array.isArray(v)) return v.reduce((a, x) => a + tien(x), 0);
    const co = lay(v, 'original', 'value', 'amount', 'total', 'number', 'raw', 'net', 'vnd');
    if (co !== undefined) return tien(co);
    /* Không khớp tên nào: lấy số dương lớn nhất trong object một tầng. Thà đọc ra
     * số đúng còn hơn im lặng trả 0 — nhưng KHÔNG đi sâu quá một tầng, kẻo vớ
     * phải id hay mã tiền tệ ở nhánh khác. */
    const so = Object.entries(v)
      .filter(([k]) => !/^(id|code|currency|type|rate)$/i.test(k))
      .map(([, x]) => (typeof x === 'number' ? x : (typeof x === 'string' ? tien(x) : 0)))
      .filter((n) => Number.isFinite(n));
    return so.length ? Math.max(...so) : 0;
  }
  let s = String(v).replace(/[^\d.,-]/g, '').trim();
  if (!s) return 0;
  const am = s.startsWith('-');
  if (am) s = s.slice(1);
  const coCham = s.includes('.');
  const coPhay = s.includes(',');
  if (coCham && coPhay) {
    const thapPhan = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    const nghin = thapPhan === '.' ? ',' : '.';
    s = s.split(nghin).join('');
    s = s.split(thapPhan).join('.');
  } else if (coCham || coPhay) {
    const dau = coCham ? '.' : ',';
    const phan = s.split(dau);
    if (phan.length > 2 || phan[phan.length - 1].length === 3) s = phan.join('');
    else s = phan.join('.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? (am ? -n : n) : 0;
}

/** Ngày: nhận "23/07/2025 08:13:26", "2025-07-23…", hoặc mốc thời gian mili-giây. */
function ngay(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) {
    // mốc mili-giây; +7 giờ để ra ngày theo giờ Việt Nam
    return new Date(v + 7 * 3600 * 1000).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return '';
}

/** Cùng luật với sync/pancake.js và sync/pancakepos.js — ba nơi phải ra một kết quả. */
function chuanSdt(v) {
  let s = String(v == null ? '' : v).replace(/[^\d+]/g, '');
  if (!s) return '';
  s = s.replace(/^\+?84/, '0');
  if (!s.startsWith('0')) s = `0${s}`;
  return s.length >= 9 && s.length <= 12 ? s : '';
}

/** Mã lead → SỐ. Tourwell đệm số 0 không nhất quán (LU00998 và LU1997 cùng một bản xuất). */
function soLead(v) {
  const m = String(v == null ? '' : v).match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

const chu = (v) => String(v == null ? '' : v).trim();

function kiemTra(conf) {
  const host = chuanHost(conf && conf.host);
  const token = chu(conf && conf.token);
  if (!host) throw new Error('Chưa khai địa chỉ Tourwell (ví dụ rootytrip.tourwell.net)');
  if (!token) throw new Error('Chưa có token Open API của Tourwell');
  hideSecret(token);
  return { host, token };
}

/** Một lời gọi GET. Token đi ở header, không nhét vào URL kẻo lọt vào log. */
async function goi({ host, token }, duong, thamSo = {}) {
  const q = Object.entries(thamSo)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const url = `${host}${duong}${q ? '?' + q : ''}`;

  /* retries: 1 — KHÔNG để request() tự thử lại 429. Nó chờ 1,5 giây rồi gọi lại,
   * mà cửa sổ chặn của Tourwell tính theo PHÚT nên gần như chắc chắn 429 tiếp,
   * lại còn tiêu thêm lượt gọi. Việc chờ đúng do đoạn dưới lo. */
  const goiMot = () => request(url, {
    method: 'GET',
    label: `${NHAN} ${duong}`,
    retries: 1,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });

  let r = await xepHang(goiMot);
  if (r.status === 429) {
    // Máy chủ nói chờ bao lâu thì chờ đúng thế; không nói thì chờ hết một phút
    // vì cửa sổ chặn của Laravel tính theo phút.
    const noi = Number(r.headers && (r.headers.get('retry-after') || r.headers.get('Retry-After')));
    const cho = Math.min(Number.isFinite(noi) && noi > 0 ? (noi + 2) * 1000 : 62000, CHO_429_MS);
    await nghi(cho);
    r = await xepHang(goiMot);
  }
  if (r.status === 429) {
    throw new Error(`Tourwell đang chặn vì quá nhiều yêu cầu (429), đã chờ `
      + `${Math.round(CHO_429_MS / 1000)} giây vẫn chưa mở. Để yên vài phút rồi thử lại; `
      + `nếu hay gặp thì tăng TOURWELL_GIAN_MS (đang ${GIAN_MS}ms).`);
  }

  /* Phải tự đọc mã trạng thái: getJson() trả `json || {}` kể cả khi HTTP là 401,
   * miễn thân phản hồi là JSON. Tourwell trả 401 kèm thân JSON, nên token sai sẽ
   * hiện ra thành "0 dòng" và người dùng đi tìm nhầm chỗ. */
  if (r.status === 401) {
    throw new Error('Tourwell từ chối token (401). Lấy lại ở Cấu hình → Quản lý tài khoản '
      + '→ tài khoản "Api Official" (api@admin.com), không phải ở màn hình API Key.');
  }
  if (r.status === 403) {
    throw new Error(`Tourwell không cho tài khoản này đọc ${duong} (403). `
      + 'Kiểm quyền của tài khoản Api Official.');
  }
  if (r.status === 404) {
    throw new Error(`Không có đường dẫn ${duong} trên ${host} (404). `
      + 'Kiểm lại địa chỉ — phải là tên miền Tourwell của công ty mình.');
  }
  let json = null;
  try { json = JSON.parse(r.text); } catch (_) {}
  if (!r.ok) {
    const than = json ? JSON.stringify(json).slice(0, 200) : scrub(r.text).slice(0, 200);
    throw new Error(`${NHAN} ${duong}: HTTP ${r.status} — ${scrub(than)}`);
  }
  if (!json) {
    const laHtml = /^\s*<(!doctype|html)/i.test(r.text);
    throw new Error(`${NHAN} ${duong}: máy chủ trả về `
      + (laHtml ? 'một trang web, không phải dữ liệu — kiểm lại địa chỉ' : 'thứ không đọc được'));
  }
  return json;
}

/**
 * Duyệt hết các trang. Đi theo `meta.last_page` khi có, và luôn dừng khi một
 * trang không trả thêm dòng nào — máy chủ nào bỏ qua `page` thì cũng không quay vòng.
 */
async function duyetTrang(xt, duong, thamSo, log = () => {}, maxTrang = 0) {
  const rows = [];
  let trang = 1;
  let tongTrang = null;
  let khoaThay = null;
  const tran = maxTrang > 0 ? Math.min(maxTrang, MAX_TRANG) : MAX_TRANG;
  while (trang <= tran) {
    const res = await goi(xt, duong, { ...thamSo, page: trang, per_page: MOI_TRANG });
    const lo = (res && (res.data || res.items || res.results)) || [];
    if (!khoaThay && lo.length) khoaThay = Object.keys(lo[0]);
    if (!Array.isArray(lo) || !lo.length) break;
    rows.push(...lo);
    const meta = (res && res.meta) || {};
    if (tongTrang == null && Number(meta.last_page) > 0) tongTrang = Number(meta.last_page);
    if (tongTrang != null && trang >= tongTrang) break;
    if (tongTrang == null && lo.length < MOI_TRANG) break;
    trang += 1;
    // Không nghỉ ở đây nữa: xepHang() đã giãn nhịp cho MỌI lời gọi, nghỉ thêm chỉ
    // làm chậm gấp đôi mà không thưa hơn.
  }
  if (trang > tran) {
    /* Cắt ngang mà im lặng là tệ nhất: bảng trông đầy đủ nhưng thiếu dữ liệu.
     * Nói rõ đã bỏ bao nhiêu. */
    log(`  ! ${duong}: DỪNG Ở ${tran} TRANG`
      + (tongTrang ? ` — còn ${tongTrang - tran} trang chưa đọc` : ''));
  }
  log(`  ${duong}: ${rows.length} dòng${tongTrang ? ` (${tongTrang} trang)` : ''}`);
  return { rows, khoaThay, soTrang: trang };
}

/**
 * Bản đồ mã KH → số điện thoại.
 *
 * Cần vì `GET /api/v1/leads` KHÔNG kèm số điện thoại — chỉ có customer.code.
 * Thiếu bản đồ này thì mất hẳn đường ghép dự phòng theo số điện thoại; đường
 * khoá cứng (mã lead) vẫn chạy bình thường.
 */
async function banDoSdt(conf, log = () => {}, maxTrang = 0) {
  const xt = kiemTra(conf);
  const { rows } = await duyetTrang(xt, '/api/v1/customers', {}, log, maxTrang);
  const m = new Map();
  rows.forEach((c) => {
    const ma = chu(lay(c, 'code'));
    if (!ma) return;
    const sdt = chuanSdt(lay(c, 'phone.primary.number', 'phone.primary', 'phone', 'mobile', 'tel'));
    if (sdt) m.set(ma, sdt);
  });
  log(`  số điện thoại: ${m.size}/${rows.length} khách có số`);
  return m;
}

/** Lead — trả về ĐÚNG hình dạng của sync/tourwell.js docLead(). */
async function docLead(conf, from, to, log = () => {}, sdtTheoKH = null) {
  const xt = kiemTra(conf);
  const { rows: tho, khoaThay } = await duyetTrang(
    xt, '/api/v1/leads', { created_at: khoangNgay(from, to) }, log,
  );
  const rows = tho.map((r) => {
    const ma = chu(lay(r, 'code'));
    const kh = chu(lay(r, 'customer.code'));
    return {
      ma,
      // Khoá ghép với ghi chú đơn POS phải là SỐ rút từ mã, giống hệt bản Excel.
      id: soLead(ma) != null ? soLead(ma) : (Number(lay(r, 'id')) || null),
      apiId: Number(lay(r, 'id')) || null,   // id thật, cần cho PUT /leads/{id}
      kh,
      khach: chu(lay(r, 'customer.name')),
      sdt: (sdtTheoKH && sdtTheoKH.get(kh)) || '',
      // `created_at_iso` có sẵn thì dùng — khỏi phải đoán 03/09 là ngày 3 tháng 9
      // hay ngày 9 tháng 3. Thứ tự ngày/tháng là nguồn sai âm thầm kinh điển.
      ngay: ngay(lay(r, 'created_at_iso') || lay(r, 'created_at_timestamp') || lay(r, 'created_at')),
      nguon: chu(lay(r, 'source.name')),
      trangThai: chu(lay(r, 'state.title', 'state.name', 'state')),
      nguoiTao: chu(lay(r, 'creator.name')),
      // Bản API cho luôn danh sách đơn của lead — bản Excel chỉ có một ô chữ.
      donHang: (Array.isArray(r.orders) ? r.orders : [])
        .map((o) => chu(lay(o, 'code'))).filter(Boolean).join(', '),
      ngayDon: '',
      ghiChu: chu(lay(r, 'note')),
      dichVu: chu(lay(r, 'service')),
    };
  }).filter((r) => r.id != null);
  return { rows, khoaThay, tuApi: true };
}

/** Đơn hàng — hình dạng của sync/tourwell.js docDon(). */
async function docDon(conf, from, to, log = () => {}) {
  const xt = kiemTra(conf);
  const { rows: tho, khoaThay } = await duyetTrang(
    xt, '/api/v1/orders', { created_at: khoangNgay(from, to) }, log,
  );
  const rows = tho.map((r) => ({
    ma: chu(lay(r, 'code')),
    kh: chu(lay(r, 'customer.code')),
    khach: chu(lay(r, 'customer.name')),
    sdt: chuanSdt(lay(r, 'customer.phone.primary.number', 'customer.phone')),
    ngay: ngay(lay(r, 'created_at_iso', 'created_at')),
    ngayXong: ngay(lay(r, 'order_at_iso', 'order_at')),
    ngayDi: ngay(lay(r, 'services.0.departure_date')),
    tien: tien(lay(r, 'total_payment')),
    thu: tien(lay(r, 'total_paid')),
    conLai: tien(lay(r, 'total_remaining')),
    nguon: chu(lay(r, 'source.name')),
    trangThai: chu(lay(r, 'status')),
    ban: (Array.isArray(r.sales_person) ? r.sales_person : [])
      .map((s) => chu(lay(s, 'name'))).filter(Boolean).join(', '),
  })).filter((r) => r.ma);
  return { rows, khoaThay, tuApi: true };
}

/**
 * Thử kết nối. In ra ĐÚNG những khoá thật sự nhận được, không in theo tài liệu —
 * riêng `Get all order` tài liệu bỏ trống hẳn phần schema, nên chỉ có cách nhìn
 * dữ liệu thật mới biết đọc đúng hay không.
 */
async function test(conf, from, to) {
  const xt = kiemTra(conf);
  const kq = { host: xt.host, ok: false, lead: null, don: null, khach: null };
  const khoang = khoangNgay(from, to);

  const thu = async (duong, thamSo) => {
    const res = await goi(xt, duong, { ...thamSo, page: 1, per_page: 25 });
    const lo = (res && (res.data || res.items || res.results)) || [];
    return {
      soDong: Array.isArray(lo) ? lo.length : 0,
      tong: Number(lay(res, 'meta.total')) || null,
      khoa: Array.isArray(lo) && lo[0] ? Object.keys(lo[0]) : [],
      mau: Array.isArray(lo) && lo[0] ? lo[0] : null,
      loMau: Array.isArray(lo) ? lo : [],
    };
  };

  // Không nghỉ thủ công: xepHang() đã giãn nhịp cho mọi lời gọi.
  kq.lead = await thu('/api/v1/leads', { created_at: khoang });
  kq.don = await thu('/api/v1/orders', { created_at: khoang });
  kq.khach = await thu('/api/v1/customers', {});

  /* Đọc thử để biết có lấy đúng tiền và ngày không, thay vì tin tài liệu.
   *
   * Phải đếm trên CẢ LÔ MẪU chứ không phải đơn đầu tiên: đơn đầu danh sách rất
   * có thể là đơn vừa tạo, chưa có dịch vụ nào, và 0đ là ĐÚNG. Kêu "đọc sai tên
   * trường" trong trường hợp đó là bắt người dùng đi sửa một thứ không hỏng. */
  if (kq.don.mau) {
    kq.donDocThu = {
      ma: chu(lay(kq.don.mau, 'code')),
      kh: chu(lay(kq.don.mau, 'customer.code')),
      tien: tien(lay(kq.don.mau, 'total_payment')),
      thu: tien(lay(kq.don.mau, 'total_paid')),
      ngay: ngay(lay(kq.don.mau, 'created_at_iso', 'created_at')),
      nguon: chu(lay(kq.don.mau, 'source.name')),
      // Dạng THẬT của trường tiền, để nhìn tận mắt thay vì đoán
      dangTien: JSON.stringify(lay(kq.don.mau, 'total_payment') ?? null).slice(0, 200),
    };
    const loDon = kq.don.loMau || [];
    const coTien = loDon.filter((x) => tien(lay(x, 'total_payment')) > 0);
    kq.tienTrenLo = {
      tong: loDon.length,
      coTien: coTien.length,
      caoNhat: loDon.reduce((a, x) => Math.max(a, tien(lay(x, 'total_payment'))), 0),
      coKH: loDon.filter((x) => chu(lay(x, 'customer.code'))).length,
      coNgay: loDon.filter((x) => ngay(lay(x, 'created_at_iso', 'created_at'))).length,
    };

    kq.canhBao = [];
    if (!kq.donDocThu.ma) kq.canhBao.push('không đọc được mã đơn');
    if (kq.tienTrenLo.coKH < loDon.length) {
      kq.canhBao.push(`${loDon.length - kq.tienTrenLo.coKH}/${loDon.length} đơn không đọc được mã KH `
        + '— mất đường ghép lead với đơn');
    }
    // Chỉ kêu khi KHÔNG đơn nào trong cả lô có tiền: một đơn 0đ là bình thường,
    // cả lô 0đ mới là dấu hiệu đọc sai tên trường.
    if (loDon.length && !kq.tienTrenLo.coTien) {
      kq.canhBao.push(`cả ${loDon.length} đơn mẫu đều ra 0đ — nhiều khả năng đọc sai trường tiền. `
        + `Dạng thật của total_payment: ${kq.donDocThu.dangTien}`);
    }
    if (kq.tienTrenLo.coNgay < loDon.length) kq.canhBao.push('có đơn không đọc được ngày');
  }
  if (kq.lead.mau) {
    kq.leadDocThu = {
      ma: chu(lay(kq.lead.mau, 'code')),
      id: soLead(chu(lay(kq.lead.mau, 'code'))),
      kh: chu(lay(kq.lead.mau, 'customer.code')),
      ngay: ngay(lay(kq.lead.mau, 'created_at_timestamp') || lay(kq.lead.mau, 'created_at')),
    };
  }
  kq.ok = kq.lead.soDong > 0 || kq.don.soDong > 0;
  // Lô mẫu là dữ liệu thô của khách hàng thật — dùng để đếm xong thì bỏ, không
  // trả về giao diện.
  ['lead', 'don', 'khach'].forEach((k) => { if (kq[k]) { delete kq[k].loMau; delete kq[k].mau; } });
  return kq;
}

/**
 * Ghi ghi chú ngược sang lead Tourwell.
 *
 * ĐÂY LÀ HÀM DUY NHẤT TRONG FILE NÀY CÓ GHI. Nó sửa bản ghi CRM mà nhân viên
 * sales đang đọc, nên:
 *   - luôn NỐI THÊM vào ghi chú cũ, không bao giờ đè;
 *   - phần do máy viết nằm giữa hai mốc rõ ràng, chạy lại thì thay đúng phần đó
 *     chứ không nhân bản;
 *   - gọi được nhiều lần mà kết quả không đổi.
 * Người gọi phải tự bật; adapter không tự ý ghi.
 */
const MOC_DAU = '--- nguồn quảng cáo (máy ghi, đừng sửa tay) ---';
const MOC_CUOI = '--- hết ---';

function ghepGhiChu(cu, than) {
  const goc = String(cu == null ? '' : cu);
  const khoi = `${MOC_DAU}\n${than}\n${MOC_CUOI}`;
  const i = goc.indexOf(MOC_DAU);
  if (i < 0) return (goc.trim() ? goc.trimEnd() + '\n\n' : '') + khoi;
  const j = goc.indexOf(MOC_CUOI, i);
  const duoi = j < 0 ? '' : goc.slice(j + MOC_CUOI.length);
  return goc.slice(0, i) + khoi + duoi;
}

async function ghiGhiChuLead(conf, apiId, than, ghiChuCu) {
  const xt = kiemTra(conf);
  if (!apiId) throw new Error('Thiếu id lead');
  const note = ghepGhiChu(ghiChuCu, than);
  const url = `${xt.host}/api/v1/leads/${encodeURIComponent(apiId)}`
    + `?note=${encodeURIComponent(note)}`;
  const r = await request(url, {
    method: 'PUT',
    label: `${NHAN} cập nhật lead ${apiId}`,
    retries: 1,
    headers: { Authorization: `Bearer ${xt.token}`, Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`${NHAN} cập nhật lead ${apiId}: HTTP ${r.status} — `
    + scrub(r.text).slice(0, 200));
  return { apiId, note, res: scrub(r.text).slice(0, 200) };
}

/**
 * Kéo lead + đơn về kho, dùng chung cho cả nút bấm trên web và bộ hẹn giờ.
 *
 * Ghi vào ĐÚNG cái kho mà bản nhập Excel vẫn ghi, nên phần tính ROAS phía sau
 * không phải biết dữ liệu đến từ đường nào.
 */
async function keoVeKho(conf, from, to, log = () => {}, laySdt = false) {
  const kho = require('./khoroas');
  const excel = require('./tourwell');

  /* Số điện thoại phải lấy riêng vì bản lead của Tourwell KHÔNG kèm số, chỉ có mã KH.
   *
   * MẶC ĐỊNH TẮT, và đây là con số lý do: công ty có 15.948 khách = 160 trang, giãn
   * 1,5 giây một lượt là gần 4 phút CHỈ cho bước này — vượt hạn chờ của hub và ép
   * sát trần 60 yêu cầu/phút của Tourwell. Số điện thoại chỉ dùng cho đường ghép
   * DỰ PHÒNG; đường khoá cứng (mã lead trong ghi chú đơn POS) không cần tới nó. */
  let sdtTheoKH = null;
  if (laySdt) {
    try { sdtTheoKH = await banDoSdt(conf, log); }
    catch (e) { log('  ! không lấy được số điện thoại: ' + e.message); }
  } else {
    log('  bỏ qua số điện thoại (15.948 khách ≈ 4 phút) — chỉ dùng khoá cứng mã lead');
  }

  const lead = await docLead(conf, from, to, log, sdtTheoKH);
  const don = await docDon(conf, from, to, log);

  const moi = kho.ghi({
    luc: new Date().toISOString(),
    tuApi: true,
    khoang: [from, to],
    lead: { tomTat: excel.tomTat('lead', lead.rows), rows: lead.rows },
    don: { tomTat: excel.tomTat('don', don.rows), rows: don.rows },
  });
  return {
    luc: moi.luc, tuApi: true, khoang: moi.khoang,
    lead: moi.lead.tomTat, don: moi.don.tomTat,
    coSdt: !!laySdt,
    // Khoá thật sự nhận được — để nhìn ra ngay nếu Tourwell đổi tên trường
    khoaLead: lead.khoaThay, khoaDon: don.khoaThay,
  };
}

module.exports = {
  NHAN, chuanHost, khoangNgay, lay, tien, ngay, chuanSdt, soLead,
  // xepHang/GIAN_MS lộ ra để test được nhịp gọi — đây là phần dễ tưởng đúng mà sai
  xepHang, GIAN_MS,
  docLead, docDon, banDoSdt, test, keoVeKho, ghepGhiChu, ghiGhiChuLead,
  MOC_DAU, MOC_CUOI,
};
