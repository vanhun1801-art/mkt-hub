'use strict';
/**
 * ============================================================================
 * Đầu việc lấy từ app Bảng công việc (Tracking)
 * ============================================================================
 * Anh Hùng: "các công việc các bạn thực hiện thì đang cố gắng đưa về phần ứng
 * dụng tracking, nên phần giao diện đầu, anh muốn nó sẽ linh hoạt theo các đầu
 * công việc bạn đang đảm nhận có thể chọn được, còn tùy chọn nhập tên công việc
 * thì chỉ nên là loại công việc khác."
 *
 * Nên ô "Công việc" không còn là ô gõ tự do: nó là danh sách việc app Tracking
 * đang giao cho chính người đó. Gõ tay chỉ còn đường duy nhất là nhóm "Khác".
 * Được cái gì: tên việc trong báo cáo khớp TỪNG CHỮ với tên việc bên Tracking,
 * nên sau này ghép hai nguồn lại không phải đoán "Edit clip" với "Edit Clip" có
 * phải một việc không.
 *
 * App này KHÔNG đọc Base của Tracking. Nó gọi API của app đó, vì bảng phân
 * quyền, luật lọc và cách tính hạn nằm ở đó — chép lại là sớm muộn hai bên nói
 * khác nhau.
 */
const http = require('http');

/* Cổng của app Bảng công việc. Cả hai app con đều chạy trên cùng máy (hub bật
 * chúng lên như tiến trình con), nên gọi thẳng loopback. */
const CONG = Number(process.env.BC_CONG_TRACKING || 5173);
const HOST = process.env.BC_HOST_TRACKING || '127.0.0.1';
/* 20 giây, không phải 6.
 *
 * Bản đầu để 6s và trên máy thì không bao giờ lộ — Base đã nằm sẵn trong cache
 * của Tracking nên nó trả về trong tích tắc. Trên Render thì khác hẳn: gói Free
 * ngủ sau ~15 phút, lần gọi đầu Tracking phải đọc 425 bản ghi từ Base, và 6 giây
 * là quá ngắn. Anh Hùng mở app ra thấy đúng dòng "Không nối được Bảng công việc"
 * trong khi Tracking vẫn sống nhăn ở tab bên cạnh. */
const CHO_MS = Number(process.env.BC_TIMEOUT_TRACKING || 20000);

const NGAY = 86400000;

/* Danh sách việc đổi chậm và màn nhập gọi nó mỗi lần mở phiếu. Khoá theo NGƯỜI
 * vì kết quả nay phụ thuộc danh tính gửi kèm — dùng chung một ô nhớ thì người mở
 * sau thấy việc của người mở trước. */
const dem = new Map();

/**
 * Header danh tính gửi sang Tracking.
 *
 * Bắt buộc phải có. `visibleFor()` bên Tracking viết:
 *     const me = await whoAmI(req);
 *     if (!me) return [];
 * — không danh tính thì nó trả về MẢNG RỖNG, không báo lỗi gì. Trên máy anh Hùng
 * chuyện này không lộ vì `quyen.json` xếp anh vào quản lý nên Tracking trả hết;
 * trên Render thì nhân sự mở ra thấy menu trống trơn.
 *
 * Cờ quản lý chỉ gửi khi người gọi THẬT SỰ là quản lý — lúc đó Tracking trả toàn
 * bộ việc và app này tự lọc lấy việc của người đang được xem. Không bao giờ gắn
 * cờ đó để "cho chắc": đây là app đọc việc của người khác, mạo quyền ở đây là mở
 * đúng cái cửa mà bảng phân quyền đang giữ.
 */
function headerNguoi(nguoi, quanLy) {
  const h = { accept: 'application/json' };
  if (!nguoi) return h;
  if (nguoi.id) h['x-hub-user-id'] = nguoi.id;
  const ten = nguoi.ten || nguoi.name;
  if (ten) h['x-hub-user-name'] = encodeURIComponent(ten);
  if (nguoi.email) h['x-hub-user-email'] = encodeURIComponent(nguoi.email);
  if (quanLy) h['x-hub-user-manager'] = '1';
  return h;
}

function goiTracking(duong, headers) {
  return new Promise((ok, ko) => {
    const req = http.request(
      { host: HOST, port: CONG, path: duong, method: 'GET', timeout: CHO_MS,
        headers: headers || { accept: 'application/json' } },
      (res) => {
        const buf = [];
        res.on('data', (c) => buf.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(buf).toString('utf8');
          if (res.statusCode >= 400) return ko(new Error('Tracking trả ' + res.statusCode));
          try { ok(JSON.parse(raw)); } catch (e) { ko(new Error('Tracking trả thứ không phải JSON')); }
        });
      });
    req.on('timeout', () => { req.destroy(new Error('Tracking không trả lời')); });
    req.on('error', ko);
    req.end();
  });
}

/**
 * Hỏi Tracking, KÈM danh tính, rồi vẫn tự lọc lại một lần nữa.
 *
 * Hai tầng lọc nghe như thừa nhưng mỗi tầng chữa một chuyện khác nhau. Tầng của
 * Tracking là hàng rào thật: nó quyết ai được thấy việc nào, và đó là luật của
 * app đó chứ không phải của app này. Tầng ở đây là để khớp người khi id lệch —
 * open_id do TỪNG app Lark cấp riêng, nên `cuaAi()` bên dưới còn dò cả tên và
 * email; và nó cũng là chỗ cắt hẹp khi Tracking trả về toàn bộ việc cho quản lý.
 */
async function docHet(nguoi, quanLy, force) {
  const khoa = (quanLy ? 'ql:' : 'ns:') + ((nguoi && (nguoi.email || nguoi.id)) || 'khuyet');
  const o = dem.get(khoa);
  if (!force && o && Date.now() - o.luc < 60000) return o.ds;
  const h = headerNguoi(nguoi, quanLy);
  let d;
  try {
    d = await goiTracking('/api/tasks', h);
  } catch (e) {
    /* Một lần thử lại: trên Render gói Free, lần gọi đầu sau khi container ngủ
     * dậy hay chạm trần thời gian chờ, còn lần thứ hai thì cache đã ấm. */
    d = await goiTracking('/api/tasks', h);
  }
  const ds = Array.isArray(d && d.tasks) ? d.tasks : [];
  dem.set(khoa, { luc: Date.now(), ds });
  return ds;
}

const chuan = (s) => String(s || '').trim().toLowerCase();

/** Người này có đứng tên trong việc đó không (phụ trách chính hoặc hỗ trợ). */
function cuaAi(viec, nguoi) {
  const ai = [].concat(viec.owner || [], viec.helper || []);
  const id = chuan(nguoi.id);
  const ten = chuan(nguoi.ten || nguoi.name);
  const mail = chuan(nguoi.email);
  return ai.some((u) => {
    if (!u) return false;
    if (id && chuan(u.id) === id) return true;
    if (ten && chuan(u.name) === ten) return true;
    if (mail && chuan(u.email) === mail) return true;
    return false;
  });
}

/* Trạng thái coi là "đã đóng" — việc đóng lâu rồi thì không cần nằm trong danh
 * sách chọn nữa, nó chỉ làm dài thêm cái menu. */
const DA_XONG = ['hoàn thành', 'xong', 'huỷ', 'hủy', 'đã huỷ', 'đã hủy'];
const daXong = (v) => DA_XONG.includes(chuan(v.status)) || DA_XONG.includes(chuan(v.flow));

/**
 * Việc để người này chọn khi làm báo cáo cho ngày `ngayMs`.
 *
 * Gồm: mọi việc đang mở, cộng việc vừa đóng trong 7 ngày gần đây — vì báo cáo
 * hôm nay thường nói về việc vừa làm xong hôm nay, mà lúc gõ báo cáo thì trạng
 * thái bên Tracking đã chuyển sang Hoàn thành rồi. Bỏ chúng đi là người ta
 * không tìm thấy đúng việc mình vừa làm, và quay về gõ tay.
 */
async function vieCuaNguoi(nguoi, ngayMs, force, quanLy) {
  const het = await docHet(nguoi, quanLy, force);
  const moc = (Number(ngayMs) || Date.now()) - 7 * NGAY;
  return het
    .filter((v) => cuaAi(v, nguoi))
    .filter((v) => {
      if (!daXong(v)) return true;
      const t = Date.parse(v.ngayGiaiQuyet || v.deadline || v.deadline1 || '') || 0;
      return t >= moc;
    })
    .map((v) => ({
      id: v.id,
      ten: v.title || '(việc không tên)',
      loai: v.workType || '',
      trangThai: v.status || '',
      hanChot: Date.parse(v.deadline || v.deadline1 || '') || 0,
      dong: daXong(v),
    }))
    .sort((a, b) => (a.dong - b.dong) || (a.hanChot || 9e15) - (b.hanChot || 9e15));
}

/**
 * Nhóm việc của app Báo cáo đoán từ "Loại công việc" bên Tracking.
 * Đoán trượt thì rơi về "Khác" — người dùng sửa được, và sai một nhãn thì cùng
 * lắm là biểu đồ theo nhóm hơi lệch, không mất dữ liệu.
 */
const BAN_DO_NHOM = [
  [/thiết kế|design/i, 'Thiết kế'],
  /* "dựng" đứng một mình khớp luôn cả "Xây dựng Profile" — việc xây dựng tài
   * liệu bị xếp vào Edit video. Phải nêu rõ dựng CÁI GÌ. */
  [/edit|video|dựng (phim|clip|video)/i, 'Edit video'],
  [/ảnh|photo|retouch/i, 'Chỉnh ảnh'],
  [/kịch bản|script|content|bài viết/i, 'Kịch bản'],
  [/chụp|quay|shoot/i, 'Chụp/Quay'],
  [/quảng cáo|ads|ad /i, 'Chạy quảng cáo'],
  [/tiktok/i, 'TikTok'],
  [/page|fanpage|facebook/i, 'Page'],
  [/họp|meeting/i, 'Họp'],
  [/báo cáo|report/i, 'Báo cáo'],
];

function doanNhom(loai, ten) {
  const s = (loai || '') + ' ' + (ten || '');
  for (const [mau, nhom] of BAN_DO_NHOM) if (mau.test(s)) return nhom;
  return 'Khác';
}

/** Tracking có đang chạy không — để giao diện nói thật thay vì im lặng hiện menu rỗng. */
async function song() {
  try { await docHet(null, false, true); return true; } catch (_) { return false; }
}

module.exports = { vieCuaNguoi, doanNhom, cuaAi, daXong, song, CONG };
