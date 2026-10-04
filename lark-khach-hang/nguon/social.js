'use strict';
/**
 * ============================================================================
 * PHẦN TỰ NHIÊN — công sức đăng bài đổi lấy được gì
 * ============================================================================
 * App Khách hàng tới giờ chỉ biết hai đầu: tiền quảng cáo bỏ ra, và đơn thu
 * về. Phần ở giữa — nội dung tự nhiên mà cả phòng làm hằng ngày — không xuất
 * hiện ở đâu cả. Nên mọi con số đều ngầm quy công cho quảng cáo, kể cả phần
 * do bài đăng kéo về.
 *
 * App Social đã gom sẵn theo NGÀY từng kênh: lượt xem tự nhiên, tiếp cận,
 * tương tác, số bài đăng, số buổi live, và quan trọng nhất là `messages` —
 * bao nhiêu người nhắn tin. Chính `messages` mới là cầu nối với app này: người
 * nhắn tin hôm nay là người có thể thành đơn hôm sau.
 *
 * GIỚI HẠN PHẢI NÓI TRƯỚC: đây là TƯƠNG QUAN theo ngày, không phải ghi công.
 * Hôm nào đăng nhiều và hôm đó nhiều đơn thì chỉ có nghĩa hai việc cùng xảy
 * ra, không chứng minh bài đăng tạo ra đơn. Đường ghi công thật (số điện thoại
 * → lead → đơn) đã dò cạn và loại từ 28/09/2026 cho TikTok.
 */
const path = require('path');

/* ĐỌC BASE QUA LỚP CỦA CHÍNH APP ẤY, không tự gọi lark-cli — lark-cli chỉ có
 * trên máy cá nhân, trên Render nó không tồn tại và app sẽ lặng lẽ trả rỗng,
 * trông y như "kỳ này không có số liệu". `lark.js` tự chuyển sang Open API
 * khi cfg.mode === 'api'. */
const CFG = require(path.join(__dirname, '..', '..', 'lark-social', 'config.js'));
const LARK = require(path.join(__dirname, '..', '..', 'lark-social', 'lark.js'));
const DAILY = (CFG.tables || {}).daily || {};
const BANG = DAILY.id;
const F = DAILY.f;


const chu = (v) => {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map((x) => (x && (x.text || x.name)) || x).filter(Boolean).join(', ');
  if (typeof v === 'object') return String(v.text || v.name || '');
  return String(v).trim();
};
const sonum = (v) => { const n = Number(chu(v).replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };
/* Ô ngày của Base là mốc thời gian (số ms). Đổi về YYYY-MM-DD theo giờ VN —
 * lấy theo UTC thì mọi số liệu của buổi tối bị đẩy sang ngày hôm sau. */
const ngayVN = (v) => {
  const n = Number(v);
  const d = Number.isFinite(n) && n > 1e11 ? new Date(n + 7 * 3600000) : new Date(chu(v));
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

/**
 * Tên kênh nằm ở bảng KHÁC — ô "channel" chỉ là liên kết, đọc ra là
 * [object Object]. Phải tra bảng Kênh một lượt rồi tự ghép.
 */
async function docTenKenh() {
  const T = (CFG.tables || {}).channel || {};
  if (!T.id || !T.f) return {};
  const recs = await LARK.listAll(T.id);
  const ra = {};
  for (const r of recs) {
    /* lark-social tra ve {id, c} chu khong phai {record_id, cells} nhu cac
     * app khac — moi app mot kieu, nen phai nhan ca hai. */
    const o = r.cells || r.c || {};
    ra[r.record_id || r.id] = { ten: chu(o[T.f.name]), nenTang: chu(o[T.f.platform]) };
  }
  return ra;
}

/** Lấy record_id từ một ô liên kết. */
const idLienKet = (v) => {
  if (!Array.isArray(v)) return '';
  const x = v[0];
  if (!x) return '';
  return (x.record_ids && x.record_ids[0]) || x.id || (typeof x === 'string' ? x : '');
};

/** Đọc số liệu theo ngày trong khoảng. */
async function doc(tu, den) {
  if (!BANG || !F) throw new Error('Không đọc được cấu hình app Social');
  const tenKenh = await docTenKenh();
  const recs = await LARK.listAll(BANG);
  const lay = (r, fid) => (r.cells || r.c || {})[fid];
  return recs.map((r) => ({
    ngay: ngayVN(lay(r, F.date)),
    kenh: (tenKenh[idLienKet(lay(r, F.channel))] || {}).ten
      || chu(lay(r, F.platform)) || '(không rõ kênh)',
    nenTang: chu(lay(r, F.platform))
      || (tenKenh[idLienKet(lay(r, F.channel))] || {}).nenTang || '',
    xemTuNhien: sonum(lay(r, F.viewsOrganic)),
    xem: sonum(lay(r, F.views)),
    tiepCan: sonum(lay(r, F.reach)),
    tuongTac: sonum(lay(r, F.engagement)),
    bam: sonum(lay(r, F.clicks)),
    nhanTin: sonum(lay(r, F.messages)),
    lead: sonum(lay(r, F.leads)),
    bai: sonum(lay(r, F.posts)),
    live: sonum(lay(r, F.lives)),
    theoDoi: sonum(lay(r, F.followers)),
  })).filter((x) => x.ngay && (!tu || x.ngay >= tu) && (!den || x.ngay <= den));
}

/**
 * Gộp theo ngày để vẽ chung với doanh thu.
 * @param theoNgay { 'YYYY-MM-DD': {tien, don} } từ marketing.soLieu
 */
function gopTheoNgay(ds, theoNgay) {
  const g = {};
  for (const r of ds) {
    const o = g[r.ngay] || (g[r.ngay] = { ngay: r.ngay, xemTuNhien: 0, nhanTin: 0, bai: 0, live: 0, tuongTac: 0, tien: 0, don: 0 });
    o.xemTuNhien += r.xemTuNhien || r.xem;
    o.nhanTin += r.nhanTin;
    o.bai += r.bai;
    o.live += r.live;
    o.tuongTac += r.tuongTac;
  }
  for (const [ngay, x] of Object.entries(theoNgay || {})) {
    const o = g[ngay] || (g[ngay] = { ngay, xemTuNhien: 0, nhanTin: 0, bai: 0, live: 0, tuongTac: 0, tien: 0, don: 0 });
    o.tien = x.tien; o.don = x.don;
  }
  return Object.values(g).sort((a, b) => a.ngay.localeCompare(b.ngay));
}

/** Gộp theo kênh — để so công sức tự nhiên với doanh thu của chính kênh đó. */
function gopTheoKenh(ds) {
  const g = {};
  for (const r of ds) {
    const k = r.kenh || r.nenTang || '(không rõ)';
    const o = g[k] || (g[k] = { kenh: k, nenTang: r.nenTang, xemTuNhien: 0, nhanTin: 0, bai: 0, live: 0, tuongTac: 0, theoDoi: 0 });
    o.xemTuNhien += r.xemTuNhien || r.xem;
    o.nhanTin += r.nhanTin;
    o.bai += r.bai;
    o.live += r.live;
    o.tuongTac += r.tuongTac;
    /* Người theo dõi là con số TỒN, không phải con số cộng dồn — lấy mốc mới
     * nhất chứ cộng lại là ra số vô nghĩa gấp mấy chục lần. */
    o.theoDoi = Math.max(o.theoDoi, r.theoDoi);
  }
  return Object.values(g).sort((a, b) => b.xemTuNhien - a.xemTuNhien);
}

/** Lọc theo khoảng — tách khỏi doc() để đọc một lần rồi cắt nhiều kiểu. */
const loc = (ds, tu, den) => ds.filter((x) => (!tu || x.ngay >= tu) && (!den || x.ngay <= den));

module.exports = { doc, loc, gopTheoNgay, gopTheoKenh };
