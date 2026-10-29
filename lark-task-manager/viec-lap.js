'use strict';
/**
 * VIỆC LẶP LẠI (29/10/2026)
 *
 * Anh Hùng: "người quản lý có thể tạo những công việc lặp lại theo ngày hoặc
 * theo tuần hoặc theo tháng, đơn giản là thêm kiểu có thể setup việc đấy".
 *
 * Một MẪU = nội dung việc (tên, chi tiết, người, loại việc…) + chu kỳ. Tới kỳ
 * thì máy chủ tạo một việc thật trong Base Tracking, hạn trong chính ngày đó.
 *
 * Mẫu cất ở kho cấu hình trên Base (cùng bảng bot nhắc nghiệm thu dùng), mỗi
 * mẫu một dòng `viec-lap:v1:<json>`. Không cất trên ổ Render: ổ đó mất sau mỗi
 * lần deploy, mẫu mất là việc lặp lại lặng lẽ dừng.
 *
 * Chống tạo trùng: mẫu nhớ `lanCuoi` (ngày VN đã tạo gần nhất). Ghi mốc đó
 * TRƯỚC khi tạo việc; tạo hỏng thì trả mốc về như cũ để lượt sau thử lại.
 * Chỉ bản trên Render chạy lịch (xem server.js), máy cá nhân không tạo, nên
 * không có hai nơi cùng tạo một việc.
 */

const LECH = 7 * 3600000;                 // giờ Việt Nam, không đổi giờ mùa hè
const PREFIX = 'viec-lap:v1:';
const GIO_TAO = 7;                        // tạo việc từ 07:00 sáng ngày đến kỳ
const THU = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];  // theo getUTCDay()
const p2 = (n) => String(n).padStart(2, '0');

/** Ngày giờ Việt Nam của một thời điểm. */
function ngayVN(now) {
  const d = new Date(now + LECH);
  return {
    ngay: d.toISOString().slice(0, 10),
    thu: d.getUTCDay(),
    date: d.getUTCDate(),
    cuoiThang: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(),
    gio: d.getUTCHours(),
  };
}

/**
 * Hôm nay (theo `v` của ngayVN) mẫu này có đến kỳ không.
 * Hằng tháng chọn ngày 29–31 mà tháng không có ngày đó thì tạo vào ngày cuối
 * tháng — không thì việc "ngày 31" bỏ trống năm tháng trong năm.
 */
function denKy(mau, v) {
  if (!mau || mau.tat) return false;
  if (mau.chuKy === 'ngay') return !(mau.boCN && v.thu === 0);
  if (mau.chuKy === 'tuan') return (mau.thu || []).includes(v.thu);
  if (mau.chuKy === 'thang') {
    return (mau.ngay || []).some((n) => n === v.date || (n > v.cuoiThang && v.date === v.cuoiThang));
  }
  return false;
}

/** Hạn của việc tạo hôm nay: ngày đó, giờ trong mẫu, múi giờ VN. */
function hanCua(mau, v) {
  const [h, m] = String(mau.gioHan || '17:00').split(':');
  return v.ngay + 'T' + p2(+h || 0) + ':' + p2(+m || 0) + ':00+07:00';
}

/** Câu tả chu kỳ cho người đọc: "Hằng tuần · T2, T5 · hạn 17:00". */
function moTa(mau) {
  const han = 'hạn ' + (mau.gioHan || '17:00');
  if (mau.chuKy === 'ngay') return 'Hằng ngày' + (mau.boCN ? ' trừ CN' : '') + ' · ' + han;
  if (mau.chuKy === 'tuan') {
    const ds = [1, 2, 3, 4, 5, 6, 0].filter((x) => (mau.thu || []).includes(x)).map((x) => THU[x]);
    return 'Hằng tuần · ' + ds.join(', ') + ' · ' + han;
  }
  if (mau.chuKy === 'thang') {
    return 'Hằng tháng · ngày ' + [...(mau.ngay || [])].sort((a, b) => a - b).join(', ') + ' · ' + han;
  }
  return '';
}

/**
 * Kiểm và gọt dữ liệu mẫu từ màn hình. Trả { mau } hoặc { loi }.
 * Chỉ giữ đúng các ô một việc cần; người là mảng {id, name}.
 */
function chuanHoa(vao) {
  const x = vao || {};
  const nguoi = (ds) => (Array.isArray(ds) ? ds : []).slice(0, 10)
    .map((u) => (typeof u === 'string' ? { id: u } : u))
    .filter((u) => u && /^ou_[A-Za-z0-9]+$/.test(String(u.id)))
    .map((u) => ({ id: String(u.id), name: String(u.name || '').slice(0, 80) }));
  const ten = String(x.title || '').trim().slice(0, 200);
  if (!ten) return { loi: 'Thiếu tên công việc' };
  const chuKy = ['ngay', 'tuan', 'thang'].includes(x.chuKy) ? x.chuKy : '';
  if (!chuKy) return { loi: 'Chưa chọn lặp lại theo ngày, tuần hay tháng' };
  const thu = [...new Set((x.thu || []).map(Number).filter((n) => n >= 0 && n <= 6))];
  const ngay = [...new Set((x.ngay || []).map(Number).filter((n) => n >= 1 && n <= 31))];
  if (chuKy === 'tuan' && !thu.length) return { loi: 'Chọn ít nhất một thứ trong tuần' };
  if (chuKy === 'thang' && !ngay.length) return { loi: 'Chọn ít nhất một ngày trong tháng' };
  const gioHan = /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(x.gioHan || '')) ? String(x.gioHan) : '17:00';
  const chu = (k, n) => (x[k] == null ? '' : String(x[k]).slice(0, n));
  return {
    mau: {
      title: ten, detail: chu('detail', 4000), workType: chu('workType', 80),
      priority: chu('priority', 40), campaign: chu('campaign', 120),
      channel: (Array.isArray(x.channel) ? x.channel : []).map(String).slice(0, 10),
      owner: nguoi(x.owner), helper: nguoi(x.helper), requester: nguoi(x.requester),
      chuKy, thu, ngay, gioHan, boCN: !!x.boCN, tat: !!x.tat,
    },
  };
}

/* ---------------- kho mẫu trên Base ---------------- */
function kho(B) {
  const docMau = (r) => {
    try { return Object.assign(JSON.parse(String(r['Ô']).slice(PREFIX.length)), { rowId: r.recordId }); }
    catch (_) { return null; }
  };
  const ghiChuoi = (mau) => {
    const sach = Object.assign({}, mau);
    delete sach.rowId;
    return PREFIX + JSON.stringify(sach);
  };
  return {
    async list() {
      return (await B.docHet()).filter((r) => String(r['Ô'] || '').startsWith(PREFIX)).map(docMau).filter(Boolean);
    },
    async them(mau) {
      const id = 'vl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const rowId = await B.tao({ 'Ô': ghiChuoi(Object.assign({ id }, mau)) });
      if (!rowId) throw new Error('Base chưa xác nhận lưu mẫu việc lặp lại.');
      return Object.assign({ id, rowId }, mau);
    },
    async sua(mau) { await B.ghi(mau.rowId, { 'Ô': ghiChuoi(mau) }); return mau; },
    async xoa(rowId) { await B.xoa(rowId); },
  };
}

/* ---------------- nhịp tạo việc ---------------- */
function create({ kho: K, taoViec, now = Date.now, log = console.error }) {
  let ban = false;
  async function tick() {
    if (ban) return { tao: 0 };
    ban = true;
    let tao = 0;
    try {
      const v = ngayVN(now());
      if (v.gio < GIO_TAO) return { tao };
      for (const mau of await K.list()) {
        if (!denKy(mau, v) || mau.lanCuoi === v.ngay) continue;
        const cu = mau.lanCuoi;
        mau.lanCuoi = v.ngay;
        await K.sua(mau);                         // giữ chỗ trước, chống tạo trùng
        try {
          await taoViec(mau, v);
          tao++;
        } catch (e) {
          mau.lanCuoi = cu;                       // trả mốc để lượt sau thử lại
          await K.sua(mau).catch(() => {});
          log('[Việc lặp lại] "' + mau.title + '": ' + e.message);
        }
      }
    } catch (e) {
      log('[Việc lặp lại] ' + e.message);
    } finally { ban = false; }
    return { tao };
  }
  return { tick };
}

module.exports = { PREFIX, GIO_TAO, ngayVN, denKy, hanCua, moTa, chuanHoa, kho, create };
