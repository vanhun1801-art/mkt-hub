'use strict';
/**
 * Soát chữ trước khi gửi thư (anh Hùng 28/10/2026: "nhấn gửi thì cho xem hình
 * thức trước, tự soát được chính tả rồi mới gửi").
 *
 * Hàm thuần, chạy ngay không cần mạng: viết tắt kiểu chat, dấu cách thừa hay
 * thiếu quanh dấu câu, chữ lặp, đầu câu chưa viết hoa. Có khoá Claude thì
 * ai.soatChinhTa() soát thêm lỗi dấu, lỗi chính tả thật, và kết quả gộp vào
 * cùng một danh sách. Không tự sửa gì: người viết bấm "Sửa" từng lỗi hoặc
 * "Sửa hết".
 *
 * Mỗi lỗi: { vt, dai, sai, sua, ly } — vt/dai là vị trí trong chữ gốc.
 */

/* Viết tắt kiểu chat → chữ đầy đủ. Chỉ khớp nguyên từ, không đụng chữ dài hơn.
 * Bỏ qua những chữ một ký tự dễ nhầm (a, e, c, v) vì cũng là chữ thật. */
const VIET_TAT = {
  ko: 'không', k: 'không', kh: 'không', khg: 'không', kg: 'không', hok: 'không', hông: 'không',
  dc: 'được', đc: 'được', dk: 'được', đk: 'được',
  vs: 'với', j: 'gì', z: 'vậy', r: 'rồi', ntn: 'như thế nào', bt: 'biết', bít: 'biết',
  mn: 'mọi người', mng: 'mọi người', ng: 'người', trc: 'trước', sdt: 'số điện thoại', sđt: 'số điện thoại',
  cty: 'công ty', tks: 'cảm ơn', thks: 'cảm ơn', thanks: 'cảm ơn', tk: 'cảm ơn', oke: 'được', okie: 'được',
  nhe: 'nhé', nha: 'nhé', ak: 'ạ', ah: 'ạ', uk: 'ừ', uh: 'ừ', bh: 'bây giờ', h: 'giờ',
};

const CHU = 'A-Za-zÀ-ỹĐđ';
const laTu = new RegExp('[' + CHU + ']');

/* Đoạn không được soát: link, email, số, mã viết hoa (VD: PITO, RH-PITO-261028). */
function vungBoQua(chu) {
  const vung = [];
  const re = /https?:\/\/\S+|[\w.+-]+@[\w-]+\.[\w.]+|\b[\w-]+\.(com|vn|net|org|io|asia|info)\b\S*|\b[A-Z0-9][A-Z0-9-]{2,}\b|\d[\d.,:/-]*\d/g;
  let m;
  while ((m = re.exec(chu))) vung.push([m.index, m.index + m[0].length]);
  return (vt) => vung.some(([a, b]) => vt >= a && vt < b);
}

function soat(chu) {
  const s = String(chu || '');
  const boQua = vungBoQua(s);
  const loi = [];
  const them = (vt, dai, sua, ly) => {
    if (boQua(vt)) return;
    if (loi.some((x) => vt < x.vt + x.dai && x.vt < vt + dai)) return;   // không chồng lên lỗi đã có
    loi.push({ vt, dai, sai: s.slice(vt, vt + dai), sua, ly });
  };

  /* Viết tắt */
  const reTu = new RegExp('(^|[^' + CHU + '])([' + CHU + ']+)(?=$|[^' + CHU + '])', 'g');
  let m;
  while ((m = reTu.exec(s))) {
    const tu = m[2];
    const vt = m.index + m[1].length;
    const day = VIET_TAT[tu.toLowerCase()];
    if (day && tu !== tu.toUpperCase()) {
      them(vt, tu.length, tu[0] === tu[0].toUpperCase() ? day[0].toUpperCase() + day.slice(1) : day, 'Viết tắt');
    }
    reTu.lastIndex = vt + tu.length;
  }

  /* Chữ lặp liền nhau: "của của" */
  const reLap = new RegExp('(^|[^' + CHU + '])([' + CHU + ']{2,})(\\s+)\\2(?=$|[^' + CHU + '])', 'gi');
  while ((m = reLap.exec(s))) {
    const vt = m.index + m[1].length;
    them(vt, m[2].length + m[3].length + m[2].length, m[2], 'Chữ bị lặp');
    reLap.lastIndex = vt + m[2].length;
  }

  /* Dấu cách trước dấu câu: "anh ," */
  const reTruoc = new RegExp('[ \\t]+([,.;:!?])([' + CHU + ']?)', 'g');
  while ((m = reTruoc.exec(s))) {
    them(m.index, m[0].length, m[1] + (m[2] ? ' ' + m[2] : ''), 'Sai dấu cách quanh dấu câu');
  }

  /* Thiếu dấu cách sau dấu câu: "anh,em" (bỏ qua số 1,5 và link) */
  /* Cả "thứ 6.em": số rồi dấu chấm rồi chữ. Số thập phân "1.5" không dính vì sau dấu là số. */
  const reSau = new RegExp('([' + CHU + '0-9])([,;:!?]|\\.)(?=[' + CHU + '])', 'g');
  while ((m = reSau.exec(s))) {
    if (m[2] === '.' && /[A-Za-z]/.test(s[m.index + 2] || '') && /\.\w+$/.test(s.slice(Math.max(0, m.index - 20), m.index + 6))) continue;
    /* Sau dấu chấm, chấm than, chấm hỏi là câu mới: viết hoa luôn chữ kế. */
    const sau = s[m.index + 2];
    const hoa = /[.!?]/.test(m[2]) ? sau.toUpperCase() : sau;
    them(m.index + 1, 2, m[2] + ' ' + hoa, 'Thiếu dấu cách sau dấu câu');
  }

  /* Nhiều dấu cách liền nhau giữa chữ */
  const reCach = /([^\s]) {2,}(?=[^\s])/g;
  while ((m = reCach.exec(s))) them(m.index + 1, m[0].length - 1, ' ', 'Thừa dấu cách');

  /* Đầu câu chưa viết hoa: đầu thư, sau ". ", "! ", "? " hoặc sau dòng trống */
  const reDau = new RegExp('(^|[.!?]\\s+|\\n\\s*\\n\\s*)([a-zà-ỹđ])', 'g');
  while ((m = reDau.exec(s))) {
    const vt = m.index + m[1].length;
    /* "vd." "v.v." "TP." không phải hết câu */
    if (/\b(vd|v\.v|tp|tr|st|ths|ts|q|p)\.\s+$/i.test(s.slice(Math.max(0, vt - 6), vt))) continue;
    them(vt, 1, m[2].toUpperCase(), 'Đầu câu nên viết hoa');
  }

  loi.sort((a, b) => a.vt - b.vt);
  return loi;
}

/** Áp các lỗi đã chọn (mặc định: tất cả) lên chữ gốc, từ cuối về đầu để vị trí không lệch. */
function sua(chu, loi) {
  let s = String(chu || '');
  for (const x of loi.slice().sort((a, b) => b.vt - a.vt)) {
    if (s.slice(x.vt, x.vt + x.dai) !== x.sai) continue;
    s = s.slice(0, x.vt) + x.sua + s.slice(x.vt + x.dai);
  }
  return s;
}

/** Gộp lỗi AI trả ({ sai, sua, ly }) vào danh sách: tìm vị trí trong chữ gốc. */
function gopAi(chu, loi, dsAi) {
  const s = String(chu || '');
  const kq = loi.slice();
  for (const a of dsAi || []) {
    if (!a || !a.sai || a.sai === a.sua) continue;
    let tu = 0, vt;
    while ((vt = s.indexOf(a.sai, tu)) >= 0) {
      if (!kq.some((x) => vt < x.vt + x.dai && x.vt < vt + a.sai.length)) {
        kq.push({ vt, dai: a.sai.length, sai: a.sai, sua: String(a.sua || ''), ly: a.ly || 'Chính tả', ai: true });
        break;
      }
      tu = vt + 1;
    }
  }
  return kq.sort((a, b) => a.vt - b.vt);
}

module.exports = { soat, sua, gopAi, VIET_TAT, _laTu: laTu };
