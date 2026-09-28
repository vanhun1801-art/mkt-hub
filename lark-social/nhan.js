'use strict';
/**
 * Gắn nhãn bài đăng theo hashtag, để lọc và báo cáo cho đối tác.
 *
 * Anh Hùng ra quy định cho đội nội dung gắn hashtag trên từng bài, rồi cuối
 * tháng lọc theo hashtag lấy số gửi đối tác. Module này đọc bảng "Nhãn bài"
 * trên Base — mỗi dòng là một nhãn kèm danh sách hashtag của nó — rồi soi
 * caption từng bài.
 *
 * VÌ SAO CẦN BẢNG NHÃN chứ không đọc thẳng hashtag:
 *   · Một đối tác có nhiều hashtag. Báo cáo Vinpearl phải gộp cả
 *     #vinpearlsafariphuquoc, #vinpearlvinwondersphuquoc và
 *     #vinpearlgrandworldphuquoc — đọc thẳng hashtag thì ra ba dòng rời.
 *   · Hashtag là chuỗi không dấu viết dính; báo cáo gửi đối tác cần tên người
 *     đọc được ("VinWonders Phú Quốc").
 *   · Quy định sẽ đổi. Sửa một dòng trong Base xong là số tính lại cho cả lịch
 *     sử, không phải nhờ ai sửa code rồi deploy.
 *
 * ĐÃ NÓI TRƯỚC VỚI ANH HÙNG, để sau này đọc lại không tưởng là bỏ sót: đo bằng
 * hashtag thì bài nào content quên gõ sẽ không vào báo cáo. Đo trên 1.329 bài
 * đang có: 198 bài nhắc "Vinwonder" trong caption nhưng chỉ 162 bài có hashtag
 * tương ứng — hụt 36 bài. Anh chọn đo theo hashtag và sẽ siết quy định để từ nay
 * gắn đủ; module vì thế CHỈ đọc hashtag, đúng như vậy.
 */

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Tách chuỗi hashtag người dùng gõ trong Base thành mảng đã chuẩn hoá.
 *
 * LOẠI TRÙNG. Gắn thẻ nhiều lần qua giao diện, hoặc gõ tay rồi quên, là ô hashtag
 * thành "#rootytripphuquoc #rooty #rootytripphuquoc #rootytrip". Không lọc thì
 * phép soát báo "thẻ bị hai nhãn cùng giữ" trong khi thật ra chỉ một nhãn khai
 * lặp — mất công đi tìm nhãn thứ hai không tồn tại.
 */
function tachThe(s) {
  return [...new Set(String(s || '')
    .split(/[\s,;|]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
    .map((x) => (x.startsWith('#') ? x : '#' + x)))];
}

/** Mọi hashtag trong một caption, viết thường, không trùng. */
function theCuaBai(caption) {
  const ds = String(caption || '').match(/#[\p{L}\p{N}_]+/gu) || [];
  return [...new Set(ds.map((x) => x.toLowerCase()))];
}

/**
 * Chuẩn hoá bảng nhãn đọc từ Base.
 * @returns [{ nhan, nhom, doiTac, the: [...], ghiChu }]
 */
function chuanHoaNhan(rows) {
  return (rows || [])
    .map((r) => ({
      nhan: String(r.nhan || '').trim(),
      nhom: String(r.nhom || '').trim(),
      doiTac: String(r.doiTac || '').trim(),
      ghiChu: String(r.ghiChu || '').trim(),
      bat: r.bat !== false,
      the: tachThe(r.hashtag),
      /* Từ khoá — dùng cho những thứ KHÔNG mang hashtag. Trước đây chỉ để gắn
       * bù bài cũ; từ 28/09/2026 còn dùng cho phiên LIVE, vì tiêu đề phiên
       * ("Show Tiên cá Thuỷ cung Vinwonders Phú Quốc") không bao giờ có hashtag
       * — người dẫn gõ tên show và tên địa điểm, không gõ thẻ. */
      tuKhoa: tachTuKhoa(r.tuKhoa),
    }))
    .filter((x) => x.nhan && x.bat && (x.the.length || x.tuKhoa.length));
}

/**
 * Tách ô "Từ khoá" thành mảng đã bỏ dấu, viết thường.
 *
 * Bỏ dấu vì đội nội dung gõ cả hai kiểu và tiêu đề phiên LIVE thì gõ vội —
 * "Vinwonders" với "VinWonders" với "vin wonder" phải coi như một.
 */
function tachTuKhoa(s) {
  return [...new Set(String(s || '')
    .split(/\s*[,;|]\s*/)
    .map((x) => khongDau(x).trim())
    .filter((x) => x.length >= 3))];          // dưới 3 ký tự thì bắt bừa
}

/**
 * Gắn nhãn cho một PHIÊN LIVE, dựa vào tiêu đề.
 *
 * Anh Hùng 28/09/2026: "bên LIVE có tiêu đề nội dung để xác định tên show, tên
 * địa điểm để biết thuộc hashtag nào luôn".
 *
 * Khác bài đăng ở chỗ KHÔNG CÓ HASHTAG để bám. Người dẫn đặt tiêu đề phiên là
 * "Show Tiên cá Thuỷ cung Vinwonders Phú Quốc" — tên show và tên địa điểm nằm
 * ngay trong câu chữ. Nên khớp bằng cột "Từ khoá" của bảng Nhãn, đúng cột đã có
 * sẵn cho việc gắn bù bài cũ.
 *
 * Vẫn soi cả hashtag: thỉnh thoảng có người gõ thẻ vào tiêu đề, bắt được thì
 * bắt, mà bắt theo thẻ thì chắc hơn theo chữ.
 *
 * Đo trên 35 phiên đang có: 21 phiên (60%) khớp ngay bằng từ khoá sẵn có, 14
 * phiên còn lại đều là "Symphony of the sea" — chưa nhãn nào khai từ khoá đó.
 * Thêm một từ vào bảng Nhãn là xong, không phải sửa mã.
 */
const DAI_THE_TOI_THIEU = 8;

function nhanCuaLive(live, dsNhan) {
  const ra = new Set();
  const tieuDe = String((live && live.title) || '');
  if (!tieuDe.trim()) return [];

  const the = new Set(theCuaBai(tieuDe));
  if (the.size) dsNhan.forEach((n) => { if (n.the.some((t) => the.has(t))) ra.add(n.nhan); });

  const g = khongDau(tieuDe);
  dsNhan.forEach((n) => {
    if ((n.tuKhoa || []).some((w) => g.includes(w))) ra.add(n.nhan);
  });

  /* HASHTAG DÙNG LUÔN LÀM TỪ KHOÁ, sau khi bóp hết dấu cách và dấu câu.
   *
   * Nhãn "Sunset Town" đã khai sẵn #symphonyofthesea, #cauhon, #diatrunghai…
   * — tức phòng ĐÃ nói những thứ đó thuộc về nó. Bắt người ta gõ lại y hệt vào
   * ô Từ khoá là chép tay hai lần rồi hai nơi lệch nhau. Bóp "#symphonyofthesea"
   * thành "symphonyofthesea" thì khớp được tiêu đề "Symphony of the sea".
   *
   * TỐI THIỂU 8 KÝ TỰ, và đây là con số phải đo chứ không đoán. Trên 35 phiên
   * thật:
   *     ngưỡng 6-7 → 35/35 khớp, NHƯNG nhãn "Du lịch Phú Quốc" dán vào 34 phiên
   *                  vì #phuquoc (7 ký tự) nằm trong mọi tiêu đề — vô nghĩa
   *     ngưỡng 8   → 34/35 khớp, đúng ba nhãn có ý nghĩa, không nhãn rác nào
   * Một phiên không khớp là "Lễ Quốc Khánh 2/9 Phú Quốc" — nó thật sự không
   * thuộc điểm đến nào, để trống mới đúng. */
  const bop = (x) => khongDau(x).replace(/[^a-z0-9]/g, '');
  const gBop = bop(tieuDe);
  dsNhan.forEach((n) => {
    if (ra.has(n.nhan)) return;
    if ((n.the || []).some((t) => { const k = bop(t); return k.length >= DAI_THE_TOI_THIEU && gBop.includes(k); })) {
      ra.add(n.nhan);
    }
  });
  return [...ra];
}

/**
 * Đọc chuỗi nhãn người ta gõ tay, chỉ giữ tên CÓ THẬT trong bảng Nhãn.
 *
 * Gõ sai một chữ thì thà không tính còn hơn đẻ ra một nhãn ma chỉ tồn tại ở
 * đúng một dòng — nhãn ma không bao giờ vào báo cáo đối tác, mà nhìn bảng thì
 * vẫn thấy có gắn.
 */
function nhanGanTay(chuoi, dsNhan) {
  const hopLe = new Set(dsNhan.map((n) => n.nhan));
  return [...new Set(String(chuoi || '').split(/\s*[,;|]\s*/)
    .map((x) => x.trim())
    .filter((x) => x && hopLe.has(x)))];
}

/**
 * Nhãn của một NGÀY LIVE (bản xuất TikTok LIVE Center).
 *
 * Khác hẳn phiên LIVE Facebook: bản xuất chỉ có ngày và số, KHÔNG có tiêu đề —
 * không có chữ nào để suy ra điểm đến. Nên nhãn ở đây do người trực LIVE chọn
 * tay, họ biết hôm đó quay ở đâu.
 *
 * Anh Hùng chọn cách này ngày 28/09/2026, sau khi cân với phương án bỏ hẳn
 * nhãn cho TikTok LIVE.
 */
function nhanCuaLiveNgay(dong, dsNhan) {
  return nhanGanTay(dong && dong.nhanTay, dsNhan);
}

/**
 * Gắn nhãn cho một bài.
 * Một bài có thể mang nhiều nhãn (vừa là địa điểm, vừa là mã tour) — đó là
 * chuyện bình thường, không phải lỗi.
 */
function nhanCuaBai(bai, dsNhan) {
  const ra = new Set();
  const the = new Set(theCuaBai(bai.title));
  if (the.size) {
    dsNhan.forEach((n) => { if (n.the.some((t) => the.has(t))) ra.add(n.nhan); });
  }
  /* Nhãn gắn bù cho bài cũ, hoặc người phụ trách gắn tay trong Base. Chỉ nhận
   * những tên có thật trong bảng Nhãn — gõ sai một chữ thì thà không tính còn
   * hơn đẻ ra một nhãn ma chỉ tồn tại ở đúng một bài. */
  if (bai.nhanBu) {
    const hopLe = new Set(dsNhan.map((n) => n.nhan));
    String(bai.nhanBu).split(/\s*[,;|]\s*/).forEach((x) => {
      const t = x.trim();
      if (t && hopLe.has(t)) ra.add(t);
    });
  }
  return [...ra];
}

/**
 * Đổi tên một nhãn trong chuỗi "Nhãn gắn bù" của một bài.
 *
 * Cột đó lưu TÊN nhãn, không lưu id. Đổi tên nhãn mà không sửa theo là mọi bài
 * gắn bù trỏ vào một cái tên không còn tồn tại — nhanCuaBai() lọc chúng ra
 * (đúng, để tránh nhãn ma), nên 105 bài lặng lẽ mất nhãn và không có gì báo.
 *
 * @returns chuỗi mới, hoặc null nếu bài này không liên quan
 */
function doiTenTrongNhanBu(nhanBu, tenCu, tenMoi) {
  const ds = String(nhanBu || '').split(/\s*[,;|]\s*/).map((x) => x.trim()).filter(Boolean);
  if (!ds.includes(tenCu)) return null;
  const moi = [...new Set(ds.map((x) => (x === tenCu ? tenMoi : x)))];
  return moi.join(', ');
}

/** Bài này nhận nhãn nhờ hashtag hay nhờ gắn bù — để màn hình nói rõ. */
function nguonNhan(bai, dsNhan) {
  const the = new Set(theCuaBai(bai.title));
  const coThe = dsNhan.some((n) => n.the.some((t) => the.has(t)));
  return coThe ? 'hashtag' : (bai.nhanBu ? 'gắn bù' : '');
}

/**
 * Bỏ dấu tiếng Việt, để "#hònthơm" và "#honthom" coi như một khi đi tìm thẻ
 * gần giống. Đội nội dung gõ cả hai kiểu, tuỳ bàn phím và tuỳ người.
 */
function khongDau(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

/* Những mảnh chữ xuất hiện trong gần như mọi caption của Rooty Trip. Lấy chúng
 * làm manh mối tìm thẻ gần giống thì thẻ nào cũng "gần giống" — gợi ý ra bốn
 * trăm thẻ là không còn là gợi ý nữa. */
const QUA_CHUNG = new Set(['phu', 'quoc', 'phuquoc', 'dulich', 'du', 'lich', 'tour',
  'rooty', 'trip', 'rootytrip', 'viral', 'xuhuong', 'fyp', 'reels', 'reelsfb', 'combo',
  'island', 'travel', 'video', 'tiktok', 'shorts']);

/**
 * Độ dài tiền tố chung của hai chuỗi.
 *
 * Cần vì đội nội dung viết cả "#vinwonders" lẫn "#vinwonderphuquoc" — không
 * chuỗi nào chứa chuỗi nào, nhưng chung gốc "vinwonder". Ngưỡng 6 đủ chặt để
 * "combophuquoc" và "combodulich" (chung "combo", 5) không kéo nhau vào.
 */
function goiChung(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/**
 * Gợi ý hashtag có thể thuộc về một nhãn, để đỡ bỏ sót.
 *
 * Manh mối lấy từ hai chỗ: các hashtag ĐÃ khai cho nhãn đó, và tên nhãn. Một thẻ
 * được gợi ý khi nó chứa (hoặc nằm trong) một manh mối đủ dài — "#honthom" kéo
 * theo "#captreohonthom", "#honthomphuquoc".
 *
 * Chỉ gợi ý thẻ CHƯA thuộc nhãn nào khác: thẻ đã có chủ mà còn đem gợi ý cho
 * nhãn thứ hai thì hai nhãn cùng đếm một bài, và tổng của hai đối tác cộng lại
 * lớn hơn số bài thật.
 */
function goiYThe(nhanNay, tatCaThe, daThuocNhanKhac, tongBai) {
  const manhMoi = [];
  tachThe(nhanNay.hashtag || (nhanNay.the || []).join(' ')).forEach((t) => {
    const g = khongDau(t).replace(/^#/, '');
    if (g.length >= 4 && !QUA_CHUNG.has(g)) manhMoi.push(g);
  });
  /* Token từ TÊN nhãn phải dài từ 6 ký tự.
   *
   * Ngưỡng 5 kéo "world" ra khỏi "Grand World Phú Quốc", và "world" nằm trong
   * "#sunworld" — thế là app gợi ý thẻ của Sun Group cho một nhãn Vinpearl.
   * Tên nhãn là chữ cho người đọc, nên mảnh của nó dễ trùng nhau hơn hashtag. */
  khongDau(nhanNay.nhan || '').split(/[^a-z0-9]+/).forEach((w) => {
    if (w.length >= 6 && !QUA_CHUNG.has(w)) manhMoi.push(w);
  });
  if (!manhMoi.length) return [];

  const daCo = new Set(tachThe(nhanNay.hashtag || (nhanNay.the || []).join(' ')));
  /* Thẻ phủ hơn một phần tư số bài là thẻ kênh chứ không phải thẻ chủ đề —
   * #phuquoc, #dulichphuquoc, #rootytrip. Gán chúng cho một đối tác là đối tác
   * đó bỗng "có" gần hết số bài của công ty. Danh sách QUA_CHUNG không bao giờ
   * kể hết được, nên chặn thêm bằng độ phủ. */
  const tranPhu = num(tongBai) ? num(tongBai) * 0.25 : Infinity;
  return (tatCaThe || [])
    .filter((x) => !daCo.has(x.the) && !daThuocNhanKhac.has(x.the))
    .filter((x) => {
      /* Loại cả thẻ CỤT của một thẻ kênh chung: "#phuquo", "#phuqu" là #phuquoc
       * gõ thiếu, vẫn là thẻ kênh chứ không phải thẻ chủ đề. Chỉ so tiền tố nên
       * "#vinwonde" (cụt của #vinwonders, một thẻ chủ đề thật) vẫn được giữ. */
      const g = khongDau(x.the).replace(/^#/, '');
      if (QUA_CHUNG.has(g)) return false;
      return ![...QUA_CHUNG].some((c) => c.length > g.length && c.startsWith(g));
    })
    .filter((x) => num(x.soBai) <= tranPhu)
    .filter((x) => {
      const g = khongDau(x.the).replace(/^#/, '');
      /* Thẻ một hai ký tự (#h, #1, #ho — đội nội dung gõ nhầm hoặc cắt dở) nằm
       * trong mọi chuỗi, nên `m.includes(g)` cho chúng khớp với tất cả. Gợi ý
       * "#h" cho nhãn Hòn Thơm thì người dùng mất tin vào cả danh sách. */
      if (g.length < 4) return false;
      return manhMoi.some((m) => {
        /* g NẰM TRONG m chỉ tính khi g đủ dài. "#phuqu" (gõ thiếu #phuquoc) nằm
         * trong "vinpearlgrandworldphuquoc", nên thẻ cụt của một thẻ kênh chung
         * lại được gợi ý cho đối tác. */
        if (m.includes(g)) return g.length >= 6;
        return g.includes(m) || goiChung(g, m) >= 6;
      });
    })
    .sort((a, b) => b.soBai - a.soBai)
    .slice(0, 12);
}

/**
 * Hỏi ngược lại goiYThe: một THẺ chưa có chủ thì hợp với những NHÃN nào đã có?
 *
 * Vì sao cần: bấm một thẻ trong danh sách "chưa thuộc nhãn nào" mà lúc nào cũng
 * mở hộp tạo nhãn mới thì sớm muộn có hai nhãn cùng nói về một chỗ — "Hòn Thơm"
 * và "Cáp treo Hòn Thơm" — rồi báo cáo Sun Group tách làm hai dòng không ai gộp
 * lại được. Gắn vào nhãn sẵn có mới là việc thường gặp; tạo mới là ngoại lệ.
 *
 * Điểm: khớp với hashtag đã khai của nhãn ăn điểm cao hơn khớp với tên nhãn,
 * vì hashtag là thứ đội nội dung gõ thật, còn tên nhãn là chữ cho người đọc.
 *
 * @returns [{ nhan, diem, viSao }] — chỉ những nhãn thật sự liên quan
 */
function nhanHopVoiThe(the, dsNhan) {
  const g = khongDau(the).replace(/^#/, '');
  if (g.length < 3) return [];

  const ra = [];
  (dsNhan || []).forEach((n) => {
    let diem = 0;
    let viSao = '';

    n.the.forEach((t) => {
      const m = khongDau(t).replace(/^#/, '');
      if (!m || m === g || QUA_CHUNG.has(m)) return;
      if (g.includes(m) || (m.includes(g) && g.length >= 6)) {
        if (diem < 3) { diem = 3; viSao = 'gần với ' + t; }
      } else if (goiChung(g, m) >= 6) {
        if (diem < 2) { diem = 2; viSao = 'chung gốc với ' + t; }
      }
    });

    if (!diem) {
      khongDau(n.nhan || '').split(/[^a-z0-9]+/).forEach((w) => {
        if (w.length < 6 || QUA_CHUNG.has(w)) return;
        if (g.includes(w) || w.includes(g) || goiChung(g, w) >= 6) {
          if (diem < 1) { diem = 1; viSao = 'trùng chữ trong tên nhãn'; }
        }
      });
    }

    if (diem) ra.push({ nhan: n.nhan, nhom: n.nhom, doiTac: n.doiTac, diem, viSao });
  });

  return ra.sort((a, b) => b.diem - a.diem || a.nhan.localeCompare(b.nhan));
}

/** Mọi hashtag xuất hiện trong bài, kèm số bài và nhãn đang giữ nó (nếu có). */
function thongKeThe(posts, dsNhan) {
  const chu = new Map();
  (dsNhan || []).forEach((n) => n.the.forEach((t) => chu.set(t, n.nhan)));
  const m = new Map();
  (posts || []).forEach((p) => {
    theCuaBai(p.title).forEach((t) => {
      if (!m.has(t)) m.set(t, { the: t, soBai: 0, views: 0, thuocNhan: chu.get(t) || '' });
      const o = m.get(t);
      o.soBai++;
      o.views += num(p.views);
    });
  });
  return [...m.values()].sort((a, b) => b.soBai - a.soBai);
}

const CONG = ['views', 'reach', 'impressions', 'likes', 'comments', 'shares', 'saves', 'engagement'];

/**
 * Gộp số theo từng nhãn.
 *
 * `soBai` đếm mọi bài mang nhãn; `soCoXem` chỉ đếm bài đo được lượt xem —
 * Facebook không trả lượt xem cho bài chữ, nên cộng cả số 0 của chúng vào rồi
 * chia trung bình là ra một con số thấp giả tạo.
 */
/**
 * Gộp số LIVE theo nhãn — ĐỂ RIÊNG, không cộng vào số bài đăng.
 *
 * Anh Hùng chốt 28/09/2026: tách riêng. Lý do: lượt xem một phiên LIVE và lượt
 * xem một bài đăng không phải cùng một loại số. Một phiên hai tiếng với một
 * reel mười lăm giây mà cộng chung thành "lượt xem của đối tác" là tự tay làm
 * mờ đúng cái mà đối tác cần nhìn.
 *
 * Hai nguồn, nhãn đến từ hai đường khác nhau:
 *   · Phiên LIVE Facebook — nhãn SUY TỪ TIÊU ĐỀ (nhanCuaLive).
 *   · Ngày LIVE TikTok    — nhãn GẮN TAY, vì bản xuất LIVE Center không có
 *     tiêu đề (nhanCuaLiveNgay).
 *
 * Số phiên của TikTok là số phiên TRONG NGÀY, không phải một dòng một phiên.
 *
 * @returns Map(tên nhãn → { soPhien, luotXem })
 */
function gopLiveTheoNhan(lives, liveNgay, dsNhan) {
  const m = new Map(dsNhan.map((n) => [n.nhan, { soPhien: 0, luotXem: 0 }]));
  (lives || []).forEach((l) => {
    nhanCuaLive(l, dsNhan).forEach((ten) => {
      const o = m.get(ten);
      if (!o) return;
      o.soPhien += 1;
      o.luotXem += num(l.views);
    });
  });
  (liveNgay || []).forEach((d) => {
    nhanCuaLiveNgay(d, dsNhan).forEach((ten) => {
      const o = m.get(ten);
      if (!o) return;
      o.soPhien += num(d.soPhien);
      o.luotXem += num(d.luotXem);
    });
  });
  return m;
}

/** Cùng phép trên, nhưng gộp theo ĐỐI TÁC.
 *
 * Một phiên mang hai nhãn của CÙNG một đối tác thì vẫn chỉ là một phiên — cùng
 * luật với gopTheoDoiTac() cho bài đăng.
 */
function gopLiveTheoDoiTac(lives, liveNgay, dsNhan) {
  const theoTen = new Map(dsNhan.map((n) => [n.nhan, n]));
  const m = new Map();
  const cong = (tens, soPhien, luotXem) => {
    const dts = new Set();
    tens.forEach((t) => { const n = theoTen.get(t); if (n && n.doiTac) dts.add(n.doiTac); });
    dts.forEach((dt) => {
      if (!m.has(dt)) m.set(dt, { soPhien: 0, luotXem: 0 });
      const o = m.get(dt);
      o.soPhien += soPhien;
      o.luotXem += luotXem;
    });
  };
  (lives || []).forEach((l) => cong(nhanCuaLive(l, dsNhan), 1, num(l.views)));
  (liveNgay || []).forEach((d) => cong(nhanCuaLiveNgay(d, dsNhan), num(d.soPhien), num(d.luotXem)));
  return m;
}

function gopTheoNhan(posts, dsNhan) {
  const m = new Map();
  dsNhan.forEach((n) => m.set(n.nhan, {
    nhan: n.nhan, nhom: n.nhom, doiTac: n.doiTac, the: n.the,
    soBai: 0, soCoXem: 0, soGanBu: 0, bai: [],
    ...CONG.reduce((o, k) => (o[k] = 0, o), {}),
  }));

  (posts || []).forEach((p) => {
    nhanCuaBai(p, dsNhan).forEach((ten) => {
      const o = m.get(ten);
      if (!o) return;
      o.soBai++;
      if (nguonNhan(p, dsNhan) === 'gắn bù') o.soGanBu++;
      if (num(p.views) > 0) o.soCoXem++;
      CONG.forEach((k) => { o[k] += num(p[k]); });
      o.bai.push(p);
    });
  });

  return [...m.values()].map((o) => ({
    ...o,
    bai: o.bai.sort((a, b) => num(b.views) - num(a.views)),
    /* Mẫu số chọn theo từng bài rồi mới cộng — cùng luật với metrics.agg(). */
    tyLeTuongTac: (() => {
      const mau = o.bai.reduce((s, p) => s + (num(p.reach) || num(p.views)), 0);
      return mau ? o.engagement / mau : 0;
    })(),
  })).sort((a, b) => b.views - a.views || b.soBai - a.soBai);
}

/**
 * Gộp theo ĐỐI TÁC, đếm mỗi bài đúng một lần.
 *
 * KHÔNG được cộng dồn số của các nhãn con. Một bài gắn cả #vinwonders lẫn
 * #safari mang hai nhãn — đúng, vì nó nói về cả hai chỗ — nhưng nó vẫn chỉ là
 * MỘT bài của Vinpearl. Cộng dồn nhãn thì đo trên dữ liệu thật ngày 18/09:
 * Vinpearl thành 312 bài / 3.508.124 lượt xem trong khi sự thật là 276 bài /
 * 3.360.667 — thừa 36 bài và 147.457 lượt xem. Đây là con số gửi cho đối tác.
 */
function gopTheoDoiTac(posts, dsNhan) {
  const theoTen = new Map(dsNhan.map((n) => [n.nhan, n]));
  const m = new Map();
  (posts || []).forEach((p) => {
    const dts = new Set();
    nhanCuaBai(p, dsNhan).forEach((ten) => {
      const n = theoTen.get(ten);
      if (n && n.doiTac) dts.add(n.doiTac);
    });
    dts.forEach((dt) => {
      if (!m.has(dt)) {
        m.set(dt, {
          doiTac: dt, nhan: [], soBai: 0, mauSo: 0,
          ...CONG.reduce((o, k) => (o[k] = 0, o), {}),
        });
      }
      const o = m.get(dt);
      o.soBai++;
      o.mauSo += num(p.reach) || num(p.views);
      CONG.forEach((k) => { o[k] += num(p[k]); });
    });
  });
  /* Danh sách nhãn của đối tác lấy từ bảng Nhãn, không lấy từ bài — để đối tác
   * chưa có bài nào trong kỳ vẫn hiện đủ tên nhãn. */
  dsNhan.forEach((n) => {
    if (n.doiTac && m.has(n.doiTac)) m.get(n.doiTac).nhan.push(n.nhan);
  });
  return [...m.values()]
    .map((o) => ({ ...o, tyLeTuongTac: o.mauSo ? o.engagement / o.mauSo : 0 }))
    .sort((a, b) => b.views - a.views);
}

/** Bài không mang nhãn nào — để biết quy định đang được theo tới đâu. */
function baiKhongNhan(posts, dsNhan) {
  return (posts || []).filter((p) => !nhanCuaBai(p, dsNhan).length);
}

/**
 * Một dòng CSV.
 *
 * Excel của Việt Nam mặc định đọc CSV bằng dấu chấm phẩy và bảng mã hệ thống.
 * Dùng dấu phẩy + UTF-8 không BOM là mở ra thấy "Ph├║ Qu盻托" và mọi cột dồn vào
 * một ô — file gửi đối tác mà thế thì hỏng việc. Nên: phân tách bằng dấu chấm
 * phẩy, và bên gọi phải thêm BOM.
 */
function dongCsv(cot) {
  return cot.map((v) => {
    const s = String(v == null ? '' : v);
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(';');
}

const BOM = '﻿';

/** Bảng CSV cho một nhãn: mỗi bài một dòng, kèm một dòng tổng ở cuối. */
function csvChoNhan(o, khoang) {
  const d = [];
  d.push(dongCsv(['Báo cáo nhãn', o.nhan]));
  if (o.doiTac) d.push(dongCsv(['Đối tác', o.doiTac]));
  d.push(dongCsv(['Hashtag', o.the.join(' ')]));
  d.push(dongCsv(['Khoảng thời gian', (khoang && khoang.tu) + ' → ' + (khoang && khoang.den)]));
  d.push('');
  d.push(dongCsv(['Ngày đăng', 'Nền tảng', 'Kênh', 'Dạng', 'Nội dung', 'Link',
    'Lượt xem', 'Tiếp cận', 'Thích', 'Bình luận', 'Chia sẻ', 'Tương tác']));
  o.bai.forEach((p) => d.push(dongCsv([
    String(p.date || '').slice(0, 10), p.platform || '', p.channel || '', p.type || '',
    String(p.title || '').replace(/\s+/g, ' ').slice(0, 300), p.url || '',
    num(p.views), num(p.reach), num(p.likes), num(p.comments), num(p.shares), num(p.engagement),
  ])));
  d.push('');
  d.push(dongCsv(['TỔNG', o.soBai + ' bài', '', '', '', '',
    o.views, o.reach, o.likes, o.comments, o.shares, o.engagement]));
  return BOM + d.join('\r\n');
}

module.exports = {
  tachThe, tachTuKhoa, theCuaBai, khongDau, nhanCuaLive, nhanCuaLiveNgay, nhanGanTay,
  gopLiveTheoNhan, gopLiveTheoDoiTac,
  DAI_THE_TOI_THIEU,
  goiYThe, thongKeThe, QUA_CHUNG,
  chuanHoaNhan, nhanCuaBai, nguonNhan, doiTenTrongNhanBu, nhanHopVoiThe,
  gopTheoNhan, gopTheoDoiTac, baiKhongNhan,
  dongCsv, csvChoNhan, BOM, CONG,
};
