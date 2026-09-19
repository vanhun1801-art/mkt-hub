'use strict';
/**
 * Ghép "ai đăng bài nào" từ dữ liệu extension gửi về.
 *
 * VÌ SAO PHẢI LÀM KIỂU NÀY. Facebook hiện "Người đăng: …" dưới mỗi bài nhưng
 * không phát qua API. Đã truy đến cùng: admin_creator tồn tại mà luôn rỗng —
 * thử trên 4 loại mã, 6 phiên bản API, 5 edge, bài từ 2023 tới nay, kể cả mã
 * của người thật có business_management; 30 tên trường khác không tồn tại; nhật
 * ký hoạt động không có API; file xuất Business Manager chỉ ghi thao tác quản
 * trị. Cho nên đường duy nhất còn lại là đọc chính màn hình mà người dùng đang
 * xem, và việc đó phải do trình duyệt của họ làm.
 *
 * Ở đây chỉ lo phần ghép. Khớp theo ID TRONG LINK chứ không theo thời gian:
 * hai bài đăng cách nhau một phút là ghép sai, còn ID thì không nhầm được.
 */

/** Tên người được phép ghi — Base để cột này dạng chọn, tên lạ sẽ bị từ chối. */
const NGUOI_DANG = ['Võ Hằng', 'Lý Thư Bạch', 'Phương Ái'];

/**
 * Rút ID bài từ link Facebook, bất kể dạng nào.
 *
 * Dữ liệu thật: 1.001 bài /reel/<id>/, 558 bài /posts/<id>, 43 bài /videos/<id>.
 * Thêm story_fbid cho chắc vì link chia sẻ hay ra dạng đó.
 */
function idTuLink(u) {
  const s = String(u || '');
  const m = /\/(?:reel|reels|videos|posts|photos)\/(?:[\w.-]+\/)?(\d{6,})/.exec(s)
    || /[?&](?:story_fbid|fbid)=(\d{6,})/.exec(s);
  return m ? m[1] : '';
}

/** Gom bài trong Base thành bảng tra theo ID link. */
function banhTra(posts) {
  const m = new Map();
  (posts || []).forEach((p) => {
    if (p.platform !== 'Facebook') return;
    const id = idTuLink(p.url);
    if (id && !m.has(id)) m.set(id, p);
  });
  return m;
}

const gonTen = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/**
 * Ghép danh sách {link, nguoi} extension gửi về với bài trong Base.
 *
 * Trả về ba nhóm, và ba nhóm này đều phải hiện ra cho người dùng thấy: giấu
 * phần không khớp đi thì họ tưởng đã gán xong hết, trong khi KPI thiếu người.
 */
function ghep(items, posts) {
  const tra = banhTra(posts);
  const hopLe = new Set(NGUOI_DANG.map(gonTen));
  const capNhat = [];
  const khongKhop = [];
  const tenLa = [];
  const daThay = new Set();

  (Array.isArray(items) ? items : []).forEach((x) => {
    const id = idTuLink(x && x.link);
    const nguoi = gonTen(x && x.nguoi);
    if (!id || !nguoi) return;
    if (!hopLe.has(nguoi)) { tenLa.push({ link: x.link, nguoi }); return; }
    const p = tra.get(id);
    if (!p) { khongKhop.push({ link: x.link, nguoi }); return; }
    if (daThay.has(p.id)) return;
    daThay.add(p.id);
    /* Đã có người và trùng khớp thì bỏ qua, khác thì vẫn ghi đè: màn hình
     * Facebook là nguồn thật, còn cột trong Base có thể do ai đó gán nhầm tay. */
    if (gonTen(p.poster) === nguoi) return;
    capNhat.push({ id: p.id, key: p.key, nguoi, cu: p.poster || '' });
  });

  return { capNhat, khongKhop, tenLa };
}

module.exports = { NGUOI_DANG, idTuLink, banhTra, ghep };
