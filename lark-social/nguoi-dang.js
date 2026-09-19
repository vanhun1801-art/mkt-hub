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
 * Chuẩn hoá văn bản để so khớp: bỏ dấu câu, gộp khoảng trắng, về chữ thường.
 * Facebook nối các khối chữ lại không có khoảng trắng giữa, còn Base thì lưu caption
 * nguyên văn — so thô là trượt.
 */
const gonVan = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * KHỚP THEO CAPTION khi link không dùng được.
 *
 * Link trong feed của Facebook nhiều khi ở dạng `pfbid0…` — mã mờ, không phải
 * số, không đối chiếu được với ID trong Base. Nhưng khối bài trên màn hình luôn
 * chứa caption, mà caption thì Base cũng có. Lấy 40 ký tự đầu của caption làm dấu
 * vân tay: đủ dài để không đụng nhau, đủ ngắn để không phụ thuộc phần bị cắt đuôi.
 */
const DAI_VAN = 40;

function ghepTheoVan(van, posts) {
  const v = gonVan(van);
  if (v.length < DAI_VAN) return null;
  let trung = null;
  for (const p of posts) {
    if (p.platform !== 'Facebook') continue;
    const t = gonVan(p.title).slice(0, DAI_VAN);
    if (t.length < DAI_VAN || !v.includes(t)) continue;
    /* Hai bài cùng mở đầu giống hệt thì không dám chọn bừa — thà bỏ qua còn hơn
     * gán sai rồi KPI đếm cho người khác. */
    if (trung) return null;
    trung = p;
  }
  return trung;
}

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
    const nguoi = gonTen(x && x.nguoi);
    if (!nguoi) return;
    if (!hopLe.has(nguoi)) { tenLa.push({ link: x && x.link, nguoi }); return; }
    const id = idTuLink(x && x.link);
    /* Link trước, caption sau. Link chính xác tuyệt đối khi có ID số; còn dạng
     * pfbid thì phải nhờ caption. */
    const p = (id && tra.get(id)) || ghepTheoVan(x && x.van, posts);
    if (!p) { khongKhop.push({ link: x && x.link, nguoi }); return; }
    if (daThay.has(p.id)) return;
    daThay.add(p.id);
    /* Đã có người và trùng khớp thì bỏ qua, khác thì vẫn ghi đè: màn hình
     * Facebook là nguồn thật, còn cột trong Base có thể do ai đó gán nhầm tay. */
    if (gonTen(p.poster) === nguoi) return;
    capNhat.push({ id: p.id, key: p.key, nguoi, cu: p.poster || '' });
  });

  return { capNhat, khongKhop, tenLa };
}

module.exports = { NGUOI_DANG, idTuLink, banhTra, ghep, ghepTheoVan, gonVan };
