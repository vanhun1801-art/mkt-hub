'use strict';
/**
 * HÀNG CHỜ KHỚP NGƯỜI ĐĂNG — nằm ở máy chủ, không nằm trong trình duyệt.
 *
 * Vì sao phải có. Tiện ích bắt được tên người đăng NGAY LÚC BẤM ĐĂNG, nhưng bài
 * chỉ vào Base sau một lượt đồng bộ, mà đồng bộ thì sáu tiếng một lần — còn bài
 * hẹn giờ thì lên sóng lúc nào không ai canh. Bản trước để hàng chờ trong
 * chrome.storage của người đăng và chỉ thử lại KHI TAB FACEBOOK CÒN MỞ. Kết quả
 * đúng như phải đến: bắt tên lúc 10:24, thử lần cuối 11:05, bài lên sóng 12:01 —
 * lúc còn thử thì chưa có bài, lúc có bài thì không còn ai thử. Tên vẫn nằm
 * trong máy người đó nhưng phải đợi họ mở Facebook lại mới ghi được, mà bài hẹn
 * giờ gần như luôn lên sóng sau khi người ta đã tắt máy.
 *
 * Giữ ở máy chủ thì sau MỖI lần đồng bộ tự khớp lại, không phụ thuộc ai mở gì.
 *
 * Khớp xong thì XOÁ dòng: bảng này chỉ trả lời một câu — "còn ai đang chờ".
 * Bằng chứng ai đăng bài nào nằm ở cột Người đăng của bảng Bài đăng, và mỗi lần
 * ghi đều có một dòng nhật ký.
 */
const cfg = require('./config');
const lark = require('./lark');
const store = require('./store');
const nguoiDang = require('./nguoi-dang');

const T = cfg.tables.pending;
const f = T.f;

/* Quá hạn thì thôi, nhưng KHÔNG xoá — để còn nhìn ra cái gì chưa bao giờ khớp.
 * Xoá đi là mất luôn dấu vết của đúng loại lỗi cần thấy. */
const HAN_NGAY = 31;

/* GIỜ VIỆT NAM, không phải giờ Base.
 *
 * Bản trước ghi theo tzOffsetHours của Base (+8) vì nghĩ là cho nhất quán với
 * các cột ngày khác. Sai: mấy cột đó là ô NGÀY, Lark tự vẽ theo múi giờ Base.
 * Ba cột ở đây là ô VĂN BẢN — Lark không vẽ lại gì cả, chuỗi ghi sao thì hiện
 * vậy. Nên người đọc thấy 17:06 cho việc xảy ra lúc 16:06 theo đồng hồ của
 * chính họ. Bảng này chỉ có một người đọc, ngồi ở Việt Nam. */
const TZ_MS = 7 * 3600000;
const gioVN = (t) => new Date((t || Date.now()) + TZ_MS)
  .toISOString().slice(0, 19).replace('T', ' ');

const gonTen = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/* Một mục là DUY NHẤT theo (vân nội dung, người đăng). Tiện ích gửi lại cùng
 * một bài mỗi năm phút, nên không có khoá này thì bảng đầy bản sao trong một
 * buổi sáng. */
const khoa = (van, nguoi, nenTang) =>
  JSON.stringify([nguoiDang.gonVan(van).slice(0, 40), gonTen(nguoi), nenTang || 'Facebook']);

/** Đọc cả bảng, dạng đã bóc field. */
async function nap() {
  const rows = await lark.listAll(T.id);
  return rows.map((r) => ({
    id: r.id,
    van: store.clean(r.c[f.van]),
    nguoi: store.clean(r.c[f.nguoi]),
    batLuc: store.clean(r.c[f.batLuc]),
    thuCuoi: store.clean(r.c[f.thuCuoi]),
    soLan: store.num(r.c[f.soLan]) || 0,
    trangThai: store.sel(r.c[f.trangThai]) || 'Đang chờ',
    /* Dòng ghi từ trước khi có TikTok thì ô Nền tảng trống — hiểu là Facebook,
     * đúng như lúc nó được ghi. */
    nenTang: store.sel(r.c[f.nenTang]) || 'Facebook',
    kenh: store.clean(r.c[f.kenh]),
  }));
}

/**
 * Ghi những mục CHƯA khớp vào hàng chờ.
 *
 * `items` là các mục tiện ích vừa gửi mà chưa tìm được bài — dạng
 * { nguoi, van }. Mục đã có thì chỉ cộng số lần thử, không đẻ dòng mới.
 */
async function luu(items, dsCho) {
  const ds = Array.isArray(items) ? items.filter((x) => x && gonTen(x.nguoi) && x.van) : [];
  if (!ds.length) return { them: 0, capNhat: 0 };

  const dang = dsCho || await nap();
  const co = new Map(dang.map((x) => [khoa(x.van, x.nguoi, x.nenTang), x]));
  /* Giờ theo múi giờ của Base, không phải UTC. Bảng này không có giao diện nào
   * — người ta mở thẳng Lark ra đọc, mà đọc "06:57" cho một việc xảy ra lúc
   * 13:57 thì lệch bảy tiếng đủ để kết luận sai xem bài nào tới trước. */
  const luc = gioVN();

  const moi = [];
  const sua = {};
  const daXet = new Set();
  ds.forEach((x) => {
    const k = khoa(x.van, x.nguoi, x.nenTang);
    if (daXet.has(k)) return;              // cùng một lượt gửi lặp lại chính nó
    daXet.add(k);
    const cu = co.get(k);
    if (cu) {
      sua[cu.id] = { [f.thuCuoi]: luc, [f.soLan]: (cu.soLan || 0) + 1 };
      return;
    }
    moi.push({
      [f.van]: String(x.van).slice(0, 200),
      [f.nguoi]: gonTen(x.nguoi),
      [f.nenTang]: x.nenTang || 'Facebook',
      [f.kenh]: String(x.kenh || ''),
      [f.batLuc]: luc,
      [f.thuCuoi]: luc,
      [f.soLan]: 1,
      [f.trangThai]: 'Đang chờ',
    });
  });

  if (moi.length) await lark.createMany(T.id, moi);
  if (Object.keys(sua).length) await lark.updateMany(T.id, sua);
  return { them: moi.length, capNhat: Object.keys(sua).length };
}

/**
 * Thử khớp lại toàn bộ hàng chờ với bài trong Base. Gọi sau mỗi lần đồng bộ.
 *
 * Trả về { ghi, conCho, quaHan, ten } — `ten` là danh sách người vừa được ghi,
 * để nhật ký nói được ai chứ không chỉ một con số.
 */
async function khopLai(posts, kenhDS) {
  const dang = (await nap()).filter((x) => x.trangThai !== 'Quá hạn');
  if (!dang.length) return { ghi: 0, conCho: 0, quaHan: 0, ten: [], tenLa: [] };

  const capNhatBai = {};
  const xong = [];
  const heo = {};
  const ten = [];
  const daGan = new Set();
  const han = Date.now() - HAN_NGAY * 86400000;
  const fp = cfg.tables.post.f;

  /* Cột Người đăng trên Base là ô CHỌN: ghi một tên ngoài danh sách là Lark từ
   * chối cả lô, kéo theo mọi bài khớp được trong cùng lượt cũng mất. Tên lạ thì
   * để nằm chờ — khai tên vào Base và NGUOI_DANG_TEN xong là lượt sau tự ghi. */
  const hopLe = new Set(nguoiDang.NGUOI_DANG.map(gonTen));

  dang.forEach((x) => {
    if (!hopLe.has(gonTen(x.nguoi))) return;
    const p = nguoiDang.ghepTheoVan(x.van, posts,
      { nenTang: x.nenTang, kenh: x.kenh, kenhDS });
    if (!p) {
      /* Quá hạn thì dừng thử, nhưng giữ dòng lại. */
      /* batLuc ghi theo giờ Việt Nam và không mang hậu tố múi giờ, nên phải
       * trừ lại trước khi so — không thì hạn lệch đúng bảy tiếng. */
      const luc = Date.parse(String(x.batLuc || '').replace(' ', 'T') + 'Z') - TZ_MS;
      if (Number.isFinite(luc) && luc < han) heo[x.id] = { [f.trangThai]: 'Quá hạn' };
      return;
    }
    /* Hai mục cùng khớp vào một bài thì không dám chọn bừa — để cả hai lại,
     * đúng như phép khớp đã làm với hai bài cùng mở đầu giống nhau. */
    if (daGan.has(p.id)) return;
    daGan.add(p.id);
    if (gonTen(p.poster) !== gonTen(x.nguoi)) {
      capNhatBai[p.id] = { [fp.poster]: gonTen(x.nguoi) };
      ten.push(gonTen(x.nguoi));
    }
    xong.push(x.id);
  });

  if (Object.keys(capNhatBai).length) await lark.updateMany(cfg.tables.post.id, capNhatBai);
  if (xong.length) await lark.deleteRecords(T.id, xong);
  if (Object.keys(heo).length) await lark.updateMany(T.id, heo);

  return {
    ghi: Object.keys(capNhatBai).length,
    conCho: dang.length - xong.length - Object.keys(heo).length,
    quaHan: Object.keys(heo).length,
    tenLa: [...new Set(dang.filter((x) => !hopLe.has(gonTen(x.nguoi))).map((x) => x.nguoi))],
    ten: [...new Set(ten)],
  };
}

/**
 * Tiện ích phải GIỮ LẠI những mục nào để gửi lần sau?
 *
 * Câu trả lời ngắn: chỉ khi máy chủ không cất được vào hàng chờ.
 *
 * Đây từng là một dòng nằm lẫn trong server.js và đã sai theo kiểu khó thấy.
 * Bản cũ bảo tiện ích giữ MỌI mục chưa khớp, nên cứ năm phút nó gửi lại một
 * lượt. Hai hậu quả:
 *
 *   · cột "Số lần thử" leo tới 193 cho một bài thử nghiệm;
 *   · anh Hùng XOÁ dòng trên Base thì năm phút sau nó mọc lại y nguyên, vì
 *     luu() không tìm thấy khoá cũ nên tạo dòng mới. Người ta xoá một dòng là
 *     có ý bảo "bỏ cái này đi" — hệ thống lặng lẽ dựng lại là lấy mất cái
 *     quyền đó, và không còn cách nào bỏ.
 *
 * Từ khi hàng chờ về máy chủ, cất được rồi là máy chủ nhận trách nhiệm: sau mỗi
 * lượt đồng bộ nó tự khớp lại, không cần trình duyệt ai mở. Tiện ích chỉ còn
 * giữ phần máy chủ CHƯA nhận được — để Base trục trặc thì không mất bài.
 *
 * Tách ra thành hàm riêng vì đây là một luật, không phải một dòng tiện tay; và
 * luật một dòng là thứ dễ bị "dọn cho gọn" nhất.
 *
 * @param chuaKhop  vị trí các mục chưa ghi được vào bảng Bài đăng
 * @param ketQuaLuu kết quả của luu() — có `.loi` nghĩa là cất hỏng
 */
function viTriPhaiGiu(chuaKhop, ketQuaLuu) {
  const ds = Array.isArray(chuaKhop) ? chuaKhop : [];
  return (ketQuaLuu && ketQuaLuu.loi) ? ds : [];
}

module.exports = { nap, luu, khopLai, khoa, viTriPhaiGiu, HAN_NGAY };
