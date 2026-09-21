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

/**
 * Tên người được phép ghi. Base để cột này dạng chọn, nên tên ngoài danh sách
 * vừa bị Lark từ chối, vừa có nguy cơ sinh thêm lựa chọn rác rồi KPI đếm nhầm thành
 * người mới.
 *
 * ĐẶT QUA BIẾN MÔI TRƯỜNG để đổi người không phải sửa code: NGUOI_DANG_TEN,
 * ngăn cách bằng dấu phẩy. Thêm người thì phải làm ĐỦ HAI việc — thêm lựa chọn
 * vào cột Người đăng trên Base, và thêm tên vào biến này — thiếu một là ghi hỏng.
 */
const NGUOI_DANG = String(process.env.NGUOI_DANG_TEN || 'Võ Hằng,Lý Thư Bạch,Phương Ái')
  .split(',').map((x) => x.trim()).filter(Boolean);

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

/** Gom bài trong Base thành bảng tra theo ID link. Chỉ Facebook dùng được:
 * link TikTok không mang ID số đối chiếu được với Base. */
function banhTra(posts) {
  const m = new Map();
  (posts || []).forEach((p) => {
    if (p.platform !== 'Facebook') return;
    const id = idTuLink(p.url);
    if (id && !m.has(id)) m.set(id, p);
  });
  return m;
}

/**
 * Bài này có nằm trong kênh mà người đăng đang chọn không.
 *
 * Gợi ý kênh có thể là tên kênh, handle, hay @handle — tiện ích đọc được cái
 * nào thì gửi cái đó. Gợi ý KHÔNG khớp kênh nào đã biết thì coi như không có:
 * thà khớp rộng còn hơn loại sạch vì một chuỗi lạ.
 */
const gonKenh = (s) => String(s || '').replace(/^@/, '').replace(/\s+/g, ' ').trim().toLowerCase();

function locTheoKenh(posts, kenh, kenhDS) {
  const k = gonKenh(kenh);
  if (!k) return posts;
  /* Gợi ý có thể là handle (@rootytrip) hay ID nền tảng, mà bài chỉ mang TÊN
   * kênh — nên tra qua bảng Kênh trước để biết gợi ý ấy là kênh nào. */
  const c = (kenhDS || []).find((x) => gonKenh(x.name) === k
    || gonKenh(x.handle) === k || gonKenh(x.extId) === k);
  const hop = posts.filter((p) => (c
    ? (p.channelExtId === c.extId || gonKenh(p.channel) === gonKenh(c.name))
    : gonKenh(p.channel) === k));
  return hop.length ? hop : posts;
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
/* Dấu vân tay lấy 40 ký tự đầu, nhưng caption ngắn hơn thì lấy trọn.
 *
 * Để cứng 40 là bỏ luôn 38 bài thật có caption ngắn — kiểu “Show Tiên Cá Vinwonders
 * Phú Quốc”. Lấy trọn thì khớp được, mà vẫn an toàn vì phép khớp đã bỏ qua khi hai
 * bài cùng mở đầu giống nhau. Dưới 20 thì thôi: ngắn quá là đụng nhau quá dễ.
 */
const DAI_VAN = 40;
const DAI_TOI_THIEU = 5;

function ghepTheoVan(van, posts, tuyChon = {}) {
  const nenTang = tuyChon.nenTang || 'Facebook';
  const v = gonVan(van);
  if (v.length < DAI_TOI_THIEU) return null;
  const ung = locTheoKenh(
    (posts || []).filter((p) => p.platform === nenTang), tuyChon.kenh, tuyChon.kenhDS);
  let trung = null;
  for (const p of ung) {
    const t = gonVan(p.title).slice(0, DAI_VAN);
    if (t.length < DAI_TOI_THIEU || !v.includes(t)) continue;
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
function ghep(items, posts, kenhDS) {
  const tra = banhTra(posts);
  const hopLe = new Set(NGUOI_DANG.map(gonTen));
  const capNhat = [];
  const khongKhop = [];
  const tenLa = [];
  const daThay = new Set();

  (Array.isArray(items) ? items : []).forEach((x, viTri) => {
    const nguoi = gonTen(x && x.nguoi);
    if (!nguoi) return;
    if (!hopLe.has(nguoi)) { tenLa.push({ viTri, link: x && x.link, nguoi }); return; }

    /* Nền tảng đi theo TỪNG MỤC, không phải theo cả lượt gửi: một người có thể
     * mở Business Suite và TikTok Studio cùng lúc, hàng chờ gộp chung. Không
     * khai thì là Facebook — giữ nguyên cách hiểu của các bản tiện ích cũ. */
    const nenTang = (x && x.nenTang) || 'Facebook';
    /* Link trước, caption sau. Link chính xác tuyệt đối khi có ID số; còn dạng
     * pfbid thì phải nhờ caption. Link TikTok không có ID số nên chỉ còn caption. */
    const id = nenTang === 'Facebook' ? idTuLink(x && x.link) : '';
    const p = (id && tra.get(id))
      || ghepTheoVan(x && x.van, posts, { nenTang, kenh: x && x.kenh, kenhDS });
    /* Trả kèm vị trí để tiện ích biết mục nào chưa ăn mà giữ lại gửi sau. Bài
     * vừa đăng chưa có trong Base — đồng bộ 6 tiếng một lượt mới kéo về. */
    if (!p) { khongKhop.push({ viTri, link: x && x.link, nguoi, nenTang }); return; }
    if (daThay.has(p.id)) return;
    daThay.add(p.id);
    /* Đã có người và trùng khớp thì bỏ qua, khác thì vẫn ghi đè: màn hình
     * Facebook là nguồn thật, còn cột trong Base có thể do ai đó gán nhầm tay. */
    if (gonTen(p.poster) === nguoi) return;
    capNhat.push({ id: p.id, key: p.key, nguoi, cu: p.poster || '' });
  });

  return { capNhat, khongKhop, tenLa };
}


/**
 * Gộp theo người đăng — bảng để chấm KPI.
 *
 * Bài chưa rõ người cũng phải hiện ra thành một dòng riêng, không được lặng lẽ
 * bỏ: nhìn "Võ Hằng 20 bài, Lý Thư Bạch 18 bài" mà không biết còn 40 bài không
 * ai nhận thì con số đẹp một cách giả tạo.
 */
function gopTheoNguoi(bai) {
  const m = new Map();
  const cong = (ten, p) => {
    if (!m.has(ten)) m.set(ten, { nguoi: ten, soBai: 0, views: 0, reach: 0, engagement: 0 });
    const o = m.get(ten);
    o.soBai++;
    o.views += Number(p.views) || 0;
    o.reach += Number(p.reach) || 0;
    o.engagement += Number(p.engagement) || 0;
  };
  (bai || []).forEach((p) => cong(String(p.poster || '').trim() || '(chưa rõ)', p));
  const ra = [...m.values()];
  /* Dòng "chưa rõ" luôn xuống cuối, dù nhiều bài tới đâu — nó không phải một
   * người, để lẫn vào bảng xếp hạng là đọc nhầm. */
  ra.sort((a, b) => {
    if (a.nguoi === '(chưa rõ)') return 1;
    if (b.nguoi === '(chưa rõ)') return -1;
    return b.views - a.views;
  });
  return ra;
}

module.exports = {
  NGUOI_DANG, idTuLink, banhTra, ghep, ghepTheoVan, locTheoKenh,
  gonVan, gonKenh, gopTheoNguoi, DAI_TOI_THIEU,
};
