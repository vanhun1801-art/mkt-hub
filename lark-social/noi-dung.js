'use strict';
/**
 * Phân tích nội dung: đăng giờ nào ăn, dạng bài nào ăn, hashtag nào kéo người xem.
 *
 * Tất cả dựng từ bảng Bài đăng đã có sẵn — 1.275 bài, bài nào cũng có giờ đăng
 * chính xác. Không cần API mới, không cần quyền mới.
 *
 * DÙNG TRUNG VỊ, KHÔNG DÙNG TRUNG BÌNH. Lượt xem trên social lệch rất nặng: một
 * bài lên xu hướng 200.000 view nằm cạnh mười bài 800 view. Lấy trung bình thì
 * khung giờ nào tình cờ chứa bài viral sẽ leo lên đầu bảng, và cả phòng đi đăng
 * vào đúng khung giờ đó vì một sự tình cờ. Trung vị trả lời đúng câu người ta
 * thật sự muốn hỏi: "đăng giờ này thì một bài BÌNH THƯỜNG được bao nhiêu".
 *
 * NGƯỠNG SỐ BÀI TỐI THIỂU cũng vì lý do đó. Một khung giờ có đúng hai bài thì
 * trung vị của nó là số ngẫu nhiên; hiện nó lên như một phát hiện là tệ hơn
 * không hiện gì. Khung nào mỏng quá thì nói thẳng là chưa đủ dữ liệu.
 */

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Trung vị. Mảng rỗng trả 0. */
function trungVi(ds) {
  if (!ds.length) return 0;
  const a = ds.slice().sort((x, y) => x - y);
  const g = Math.floor(a.length / 2);
  return a.length % 2 ? a[g] : (a[g - 1] + a[g]) / 2;
}

/**
 * Giờ và thứ theo múi giờ của Base.
 *
 * `publishedAt` là ISO có sẵn offset (…+08:00). Dùng new Date() rồi getHours()
 * là lấy theo múi giờ của MÁY CHỦ — Render chạy UTC, nên "19:15 giờ Việt" sẽ
 * thành 12 giờ, và cả bảng giờ vàng lệch bảy tiếng. Nhìn vẫn hợp lý nên không
 * ai nghi. Vì thế đọc thẳng phần giờ trong chuỗi khi chuỗi có offset.
 */
function gioThu(iso, tzOffsetHours) {
  const s = String(iso || '');
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):/.exec(s);
  if (!m) return null;
  const coOffset = /[+-]\d{2}:\d{2}$/.test(s) || /Z$/.test(s);
  if (coOffset && !/Z$/.test(s)) {
    /* Chuỗi đã mang đúng giờ địa phương của Base — dùng thẳng, khỏi quy đổi. */
    const ngay = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return { gio: +m[4], thu: ngay.getUTCDay(), ngay: s.slice(0, 10) };
  }
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t + num(tzOffsetHours) * 3600000);
  return { gio: d.getUTCHours(), thu: d.getUTCDay(), ngay: d.toISOString().slice(0, 10) };
}

const TEN_THU = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

/** Khung giờ 2 tiếng: 0→"00–02", 1→"02–04"… */
const tenKhung = (i) => String(i * 2).padStart(2, '0') + '–' + String(i * 2 + 2).padStart(2, '0');

/**
 * Lưới thứ × khung giờ 2 tiếng.
 * @returns { o: [{thu, khung, soBai, xem, tuongTac, du}], toiThieu, tongBai }
 */
function gioVang(posts, { tz = 8, toiThieu = 4 } = {}) {
  const o = new Map();
  let tong = 0;
  posts.forEach((p) => {
    const g = gioThu(p.publishedAt || p.date, tz);
    if (!g) return;
    tong++;
    const k = g.thu + '|' + Math.floor(g.gio / 2);
    if (!o.has(k)) o.set(k, { thu: g.thu, khung: Math.floor(g.gio / 2), xem: [], tt: [], soBai: 0 });
    const x = o.get(k);
    x.soBai++;
    /* Chỉ bài CÓ lượt xem mới vào mẫu tính trung vị lượt xem — xem chú thích ở
     * theoNhom(). Tương tác thì mọi bài đều có nên lấy tất. */
    if (num(p.views) > 0) x.xem.push(num(p.views));
    x.tt.push(num(p.engagement));
  });
  const ra = [...o.values()].map((x) => ({
    thu: x.thu,
    tenThu: TEN_THU[x.thu],
    khung: x.khung,
    tenKhung: tenKhung(x.khung),
    soBai: x.soBai,
    soCoXem: x.xem.length,
    xem: x.xem.length ? Math.round(trungVi(x.xem)) : null,
    tuongTac: Math.round(trungVi(x.tt)),
    du: x.soBai >= toiThieu,
  }));
  return { o: ra, toiThieu, tongBai: tong };
}

/** Xếp hạng theo một trường phân loại (loại bài, kênh…). */
function theoNhom(posts, layNhom, { toiThieu = 3 } = {}) {
  const m = new Map();
  posts.forEach((p) => {
    const k = layNhom(p);
    if (!k) return;
    if (!m.has(k)) m.set(k, { xem: [], tt: [], tyLe: [], soBai: 0 });
    const o = m.get(k);
    o.soBai++;
    /* CHỈ BÀI CÓ LƯỢT XEM mới được vào mẫu.
     *
     * Facebook chỉ trả lượt xem cho video; bài chữ và ảnh không có chỉ số đó.
     * Đổ số 0 của 522 bài viết vào cùng mẫu thì trung vị ra 0, và bảng hiện
     * "Bài viết — 0 lượt xem" như thể không ai đọc. Đó là nói sai: không phải
     * không ai xem, mà là không đo được. */
    if (num(p.views) > 0) o.xem.push(num(p.views));
    o.tt.push(num(p.engagement));
    const mau = num(p.reach) || num(p.views);
    if (mau) o.tyLe.push(num(p.engagement) / mau);
  });
  return [...m.entries()]
    .map(([ten, o]) => ({
      ten,
      soBai: o.soBai,
      soCoXem: o.xem.length,
      xem: o.xem.length ? Math.round(trungVi(o.xem)) : null,
      tuongTac: Math.round(trungVi(o.tt)),
      tyLeTuongTac: trungVi(o.tyLe),
      du: o.soBai >= toiThieu,
    }))
    .sort((a, b) => num(b.xem) - num(a.xem) || b.tuongTac - a.tuongTac);
}

/**
 * Hashtag rút từ caption.
 *
 * Chỉ xét hashtag xuất hiện từ `toiThieu` bài trở lên. Một hashtag dùng đúng một
 * lần mà bài đó tình cờ viral sẽ đứng đầu bảng với "trung vị 200.000 view" — đọc
 * xong ai cũng tưởng tìm ra bí quyết.
 */
function hashtag(posts, { toiThieu = 5, n = 25 } = {}) {
  const m = new Map();
  posts.forEach((p) => {
    const ds = String(p.title || '').match(/#[\p{L}\p{N}_]+/gu) || [];
    /* Cùng một thẻ lặp trong một caption chỉ tính một lần cho bài đó. */
    new Set(ds.map((x) => x.toLowerCase())).forEach((h) => {
      if (!m.has(h)) m.set(h, { xem: [], tt: [], soBai: 0 });
      const o = m.get(h);
      o.soBai++;
      if (num(p.views) > 0) o.xem.push(num(p.views));
      o.tt.push(num(p.engagement));
    });
  });
  return [...m.entries()]
    .filter(([, o]) => o.soBai >= toiThieu)
    .map(([the, o]) => ({
      the,
      soBai: o.soBai,
      soCoXem: o.xem.length,
      xem: o.xem.length ? Math.round(trungVi(o.xem)) : null,
      tuongTac: Math.round(trungVi(o.tt)),
    }))
    .sort((a, b) => num(b.xem) - num(a.xem) || b.tuongTac - a.tuongTac)
    .slice(0, n);
}

/** Toàn bộ số cho màn hình Nội dung, một lần gọi. */
function tongHop(posts, { tz = 8 } = {}) {
  const ds = posts || [];
  const coXem = ds.filter((p) => num(p.views) > 0);
  const chung = trungVi(coXem.map((p) => num(p.views)));
  return {
    soBai: ds.length,
    soCoXem: coXem.length,
    xemTrungVi: Math.round(chung),
    tuongTacTrungVi: Math.round(trungVi(ds.map((p) => num(p.engagement)))),
    gioVang: gioVang(ds, { tz }),
    theoLoai: theoNhom(ds, (p) => p.type || ''),
    theoKenh: theoNhom(ds, (p) => p.channel || p.channelExtId || ''),
    hashtag: hashtag(ds),
    tenThu: TEN_THU,
  };
}

module.exports = { trungVi, gioThu, gioVang, theoNhom, hashtag, tongHop, TEN_THU, tenKhung };
