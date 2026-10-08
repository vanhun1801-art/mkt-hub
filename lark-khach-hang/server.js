'use strict';
/**
 * ============================================================================
 * APP "KHÁCH HÀNG" — bản chạy local để xem thử
 * ============================================================================
 * Gom hồ sơ khách từ các kênh về một chỗ: tra cứu một người, xem nhu cầu, xem
 * nguồn khách, và bản đồ nhiệt theo quốc gia.
 *
 * KHÔNG ghi gì lên Lark Base. Dữ liệu nằm trong du-lieu/ trên máy này.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const hoso = require('./hoso');
const mkt = require('./marketing');
const cd = require('./chandung');
const qc = require('./nguon/quangcao');
const ht = require('./nguon/hoithoai');
const spn = require('./nguon/sanpham');
const soc = require('./nguon/social');
const tnp = require('./nguon/tacnghiep');
const nguon = require('./nguon/tourwell');
const khoBase = require('./kho-base');

const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

/* Vân tay tệp tĩnh — cùng cách đã chuẩn hoá cho 12 app hôm nay: đổi tệp là đổi
 * địa chỉ, nên cache lâu mà không bao giờ lấy nhầm bản cũ. */
const VAN_TAY = (() => {
  const h = require('crypto').createHash('sha1');
  try {
    fs.readdirSync(PUBLIC).sort().forEach((f) => {
      try { h.update(fs.readFileSync(path.join(PUBLIC, f))); } catch (_) {}
    });
  } catch (_) { h.update(String(Date.now())); }
  return h.digest('hex').slice(0, 10);
})();

const gui = (res, ma, than, dau = {}) => {
  const b = Buffer.isBuffer(than) ? than : Buffer.from(String(than), 'utf8');
  res.writeHead(ma, Object.assign({ 'Content-Length': b.length }, dau));
  res.end(b);
};
const json = (res, o, ma = 200) =>
  gui(res, ma, JSON.stringify(o), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });

/* ---------------- kho trong bộ nhớ ---------------- */
let KHO = { luc: null, ds: [], tq: null, loi: '', mtime: 0 };
const NHO_QC = {};   // nhớ tạm chi phí quảng cáo theo khoảng ngày
const QUET = {};     // lượt quét hội thoại đang chạy, theo khoảng ngày
const NHO_TINH = {}; // nhớ tạm số liệu tỉnh thành theo khoảng ngày
const NHO_SP = {};   // nhớ tạm danh mục sản phẩm
const NHO_SOC = {};  // nhớ tạm số liệu Social theo khoảng ngày

/**
 * Một cửa duy nhất để lấy số liệu Social.
 *
 * Trước đây /api/social và /api/tac-nghiep mỗi đường tự đọc bảng "Số liệu
 * theo ngày" một lượt — đo được 6,1 giây và 6,2 giây, tức mất sáu giây chỉ để
 * đọc lại thứ vừa đọc xong. Dùng chung lời hứa (promise) thì lượt thứ hai chờ
 * lượt thứ nhất thay vì gọi lại: đường nào tới trước thì đi lấy, đường tới sau
 * dùng ké.
 */
async function laySocial(tu, den) {
  /* Đọc CẢ BẢNG một lần rồi cắt, thay vì nhớ theo từng khoảng ngày.
   *
   * soc.doc() vốn đã tải hết bảng rồi mới lọc trong bộ nhớ, nên nhớ theo
   * khoảng chỉ tạo ra ảo giác tiết kiệm: /api/social xin tới ngày X, còn
   * /api/tac-nghiep xin tới X+7 — hai khoá khác nhau, hai lượt tải cùng một
   * bảng, đo được 7,0 và 6,0 giây. Bỏ khoá theo khoảng thì lượt thứ hai còn
   * vài mili giây. */
  if (!NHO_SOC.tho) {
    NHO_SOC.tho = soc.doc('', '').catch((e) => { delete NHO_SOC.tho; throw e; });
  }
  return soc.loc(await NHO_SOC.tho, tu, den);
}
const NHO_TN = {};   // nhớ tạm buổi tác nghiệp theo khoảng ngày

/**
 * Đọc lại nếu tệp trên đĩa đã đổi.
 *
 * Lượt kéo ghi dở dang mỗi 20 trang, và có khi chạy từ tiến trình khác. Chỉ
 * đọc lúc khởi động thì mở màn hình ra vẫn thấy số cũ trong suốt mười bốn
 * phút, mà người xem không có cách nào biết là nó cũ.
 */
function napNeuDoi() {
  let m = 0;
  try { m = fs.statSync(cfg.tepTho).mtimeMs; } catch (_) { return; }
  if (m === KHO.mtime) return;
  KHO.mtime = m;
  napTuDia();
}

function napTuDia() {
  try {
    const d = JSON.parse(fs.readFileSync(cfg.tepTho, 'utf8'));
    KHO.ds = hoso.dung({ khach: d.khach || [], don: d.don || [], them: d.them || [] });
    KHO.tq = hoso.tongQuan(KHO.ds);
    KHO.luc = d.luc || null;
    KHO.loi = '';
    console.log('  nạp ' + KHO.ds.length + ' hồ sơ từ ' + (KHO.luc || '?'));
  } catch (e) {
    KHO.loi = e.code === 'ENOENT' ? 'chưa kéo dữ liệu lần nào' : e.message;
    console.log('  chưa có dữ liệu: ' + KHO.loi);
  }
}

/* ---------------- kéo lại (chạy nền) ---------------- */
let dangKeo = null;      // { bat, dong: [], xong }

async function keoLai() {
  if (dangKeo && !dangKeo.xong) return dangKeo;
  dangKeo = { bat: Date.now(), dong: [], xong: false, loi: '' };
  const bao = (s) => {
    dangKeo.dong.push(new Date().toISOString().slice(11, 19) + ' ' + s);
    if (dangKeo.dong.length > 200) dangKeo.dong.shift();
  };
  (async () => {
    try {
      const khach = await nguon.keoKhach(bao);
      bao('khách: ' + khach.length);
      const don = await nguon.keoDon(bao);
      bao('đơn: ' + don.length);
      const cu = (() => { try { return JSON.parse(fs.readFileSync(cfg.tepTho, 'utf8')); } catch (_) { return {}; } })();
      fs.mkdirSync(cfg.thuMucDuLieu, { recursive: true });
      fs.writeFileSync(cfg.tepTho, JSON.stringify({
        luc: new Date().toISOString(), khach, don, them: cu.them || [],
      }));
      napTuDia();
      bao('xong sau ' + Math.round((Date.now() - dangKeo.bat) / 1000) + ' giây');
      /* Cất lên Base NGAY sau khi kéo xong. Để lần sau — kể cả sau một lần
       * deploy — khỏi phải kéo lại mười lăm phút. Cất hỏng thì chỉ ghi log,
       * không làm hỏng lượt kéo vừa thành công. */
      bao('đang cất kho lên Lark Base…');
      bao(await khoBase.catLen(cfg.tepTho, 'kéo lúc ' + new Date().toISOString())
        ? 'đã cất lên Base, lần sau khởi động chỉ mất ~35 giây'
        : '! cất lên Base hỏng, kho chỉ còn trên máy chủ (mất khi cập nhật app)');
    } catch (e) {
      dangKeo.loi = String((e && e.message) || e);
      bao('Hỏng: ' + dangKeo.loi);
    } finally { dangKeo.xong = true; }
  })();
  return dangKeo;
}

/* ---------------- tìm kiếm ---------------- */
const khongDau = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

function tim(q, loc = {}) {
  const k = khongDau(q).trim();
  const so = String(q || '').replace(/[^\d]/g, '');
  let ds = KHO.ds;
  if (loc.muc) ds = ds.filter((o) => o.muc === loc.muc);
  if (loc.nuoc) ds = ds.filter((o) => o.nuoc === loc.nuoc);
  if (loc.coDon === '1') ds = ds.filter((o) => o.soDon > 0);
  if (loc.coDon === '0') ds = ds.filter((o) => !o.soDon);
  if (!k && !so) return ds;
  return ds.filter((o) => {
    if (so && so.length >= 4 && o.sdt && o.sdt.includes(so)) return true;
    if (k && khongDau(o.ten).includes(k)) return true;
    if (k && o.maTw && khongDau(o.maTw).includes(k)) return true;
    return false;
  });
}

/* ---------------- máy chủ ---------------- */
const may = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;

  try {
    if (p === '/healthz') return json(res, { ok: true, hoSo: KHO.ds.length, luc: KHO.luc });
    if (p === '/api/boi-canh') return json(res, { trongHub: cfg.trongHub });

    if (p === '/api/tong-quan') {
      napNeuDoi();
      /* Tính theo kỳ ngay lúc hỏi: đo được 6ms cho 16.605 hồ sơ, nên không cần
       * nhớ sẵn — mà nhớ sẵn thì lại phải nghĩ cách dọn khi dữ liệu đổi. */
      const loc = {
        tu: u.searchParams.get('tu') || '',
        den: u.searchParams.get('den') || '',
        theo: u.searchParams.get('theo') || 'dat',
      };
      const coLoc = !!(loc.tu || loc.den);
      /* Kỳ liền trước, dài bằng kỳ đang xem — để mọi ô số có mốc so. Tính
       * thêm một lượt soLieu nữa; đo được 6ms cho 16.600 hồ sơ nên không
       * đáng kể. */
      let truoc = null;
      if (coLoc && loc.tu && loc.den) {
        const a = Date.parse(loc.tu + 'T00:00:00+07:00');
        const z = Date.parse(loc.den + 'T00:00:00+07:00');
        const soNgay = Math.round((z - a) / 86400000) + 1;
        const z2 = new Date(a - 86400000);
        const a2 = new Date(z2.getTime() - (soNgay - 1) * 86400000);
        const ng = (d) => d.toISOString().slice(0, 10);
        truoc = mkt.soLieu(KHO.ds, { tu: ng(a2), den: ng(z2), theo: loc.theo });
        truoc.ky = { tu: ng(a2), den: ng(z2) };
      }
      return json(res, {
        luc: KHO.luc, loi: KHO.loi, tq: KHO.tq || null,
        mkt: KHO.ds.length ? mkt.soLieu(KHO.ds, coLoc ? loc : { theo: loc.theo }) : null,
        truoc,
        dangKeo: !!(dangKeo && !dangKeo.xong),
      });
    }

    if (p === '/api/chan-dung') {
      napNeuDoi();
      return json(res, KHO.ds.length ? cd.dungChanDung(KHO.ds) : { b2c: [], b2b: [], tong: null });
    }

    /* Danh sách khách của MỘT nhóm chân dung — để bấm vào nhóm là ra người,
     * và xuất được ra tệp mà chạy quảng cáo lại. Không có đường này thì các
     * con số chân dung chỉ để ngắm. */
    /* Chi phí quảng cáo ghép với doanh thu — câu hỏi "tiền bỏ ra đổi lấy
     * được gì". Kéo mất chừng 15 giây nên có nhớ tạm theo khoảng ngày; nếu
     * không thì mỗi lần đổi tab lại chờ. */
    if (p === '/api/quang-cao') {
      napNeuDoi();
      const tu = u.searchParams.get('tu') || '';
      const den = u.searchParams.get('den') || '';
      if (!tu || !den) return json(res, { error: 'Cần khoảng ngày' }, 400);
      const khoa = tu + '|' + den;
      if (!NHO_QC[khoa]) {
        NHO_QC[khoa] = qc.keoChiPhi(tu, den).catch((e) => {
          delete NHO_QC[khoa];      // hỏng thì đừng nhớ, để lần sau thử lại
          throw e;
        });
      }
      const chiPhi = await NHO_QC[khoa];
      if (!NHO_TINH[khoa]) {
        NHO_TINH[khoa] = qc.keoTinh(tu, den).catch((e) => { delete NHO_TINH[khoa]; throw e; });
      }
      const tinh = await NHO_TINH[khoa].catch(() => ({ tinh: [], loi: '' }));
      const sl = mkt.soLieu(KHO.ds, { tu, den, theo: u.searchParams.get('theo') || 'dat' });
      return json(res, {
        ky: { tu, den },
        bang: qc.ghepVoiDoanhThu(sl.kenh, chiPhi),
        khongGhep: qc.KHONG_GHEP,
        loi: chiPhi.loi,
        tongChi: Object.values(chiPhi.theoNenTang).reduce((a, b) => a + b, 0),
        tinh: tinh.tinh || [], loiTinh: tinh.loi || '',
      });
    }

    /* Khách hỏi gì, sợ gì — quét hội thoại. Mỗi hội thoại một lượt gọi API
     * nên chậm (chừng nửa giây một cái) và phải lấy mẫu; vì vậy chạy NỀN và
     * màn hình hỏi tiến độ, chứ không bắt người xem ngồi chờ một request. */
    if (p === '/api/hoi-thoai') {
      const tu = u.searchParams.get('tu') || '';
      const den = u.searchParams.get('den') || '';
      const gioiHan = Math.min(Number(u.searchParams.get('gioiHan')) || 80, 400);
      const khoa = tu + '|' + den + '|' + gioiHan;
      if (req.method === 'POST') {
        if (!QUET[khoa] || QUET[khoa].xong) {
          QUET[khoa] = { xong: false, dong: [], kq: null, loi: '' };
          const t = QUET[khoa];
          ht.quet({ tu, den, gioiHan, bao: (x) => t.dong.push(x) })
            .then((r) => { t.kq = r; })
            .catch((e) => { t.loi = String((e && e.message) || e); })
            .finally(() => { t.xong = true; });
        }
        return json(res, { dangChay: true });
      }
      const t = QUET[khoa];
      if (!t) return json(res, { chuaChay: true });
      /* Gắn TÊN quảng cáo nếu đã có sẵn trong bộ nhớ chi phí. Không có thì để
       * nguyên mã — thà hiện mã còn hơn chờ thêm 15 giây chỉ để đổi nhãn. */
      let tenQC = {};
      const kqc = NHO_QC[tu + '|' + den];
      if (kqc) { try { tenQC = (await kqc).tenQC || {}; } catch (_) {} }
      return json(res, { dangChay: !t.xong, dong: t.dong.slice(-6), loi: t.loi, kq: t.kq, tenQC });
    }

    /* Giá bán thật so với giá công bố trên app Sản phẩm. Đọc Base Sản phẩm
     * mất vài giây nên nhớ lại; danh mục ít đổi trong ngày. */
    if (p === '/api/gia') {
      napNeuDoi();
      if (!NHO_SP.ds) NHO_SP.ds = spn.doc().catch((e) => { NHO_SP.ds = null; throw e; });
      let sps = [];
      try { sps = await NHO_SP.ds; }
      catch (e) { return json(res, { error: String((e && e.message) || e).slice(0, 200) }, 502); }
      const r = spn.soGia(KHO.ds, sps, { laHuy: mkt.laHuy, laChiPhiNoiBo: mkt.laChiPhiNoiBo });
      return json(res, Object.assign(r, { soSP: sps.length, coGia: sps.filter((x) => x.giaNL).length }));
    }

    /* Công sức tự nhiên: bài đăng, live, lượt xem, tin nhắn — từ app Social. */
    if (p === '/api/social') {
      const tu = u.searchParams.get('tu') || '';
      const den = u.searchParams.get('den') || '';
      let ds = [];
      try { ds = await laySocial(tu, den); }
      catch (e) { return json(res, { error: String((e && e.message) || e).slice(0, 200) }, 502); }
      return json(res, { kenh: soc.gopTheoKenh(ds), soDong: ds.length });
    }

    /* Buổi tác nghiệp và những gì xảy ra SAU đó. */
    if (p === '/api/tac-nghiep') {
      napNeuDoi();
      const tu = u.searchParams.get('tu') || '';
      const den = u.searchParams.get('den') || '';
      const khoa = tu + '|' + den;
      if (!NHO_TN[khoa]) {
        NHO_TN[khoa] = (async () => {
          /* Nới cửa sổ Social và doanh thu thêm 7 ngày về SAU: buổi quay ngày
           * cuối kỳ thì hệ quả của nó rơi ra ngoài kỳ, cắt đúng kỳ là buổi
           * nào gần cuối cũng hiện "không có gì xảy ra sau đó". */
          const den7 = new Date(Date.parse(den + 'T00:00:00Z') + 7 * 86400000).toISOString().slice(0, 10);
          /* Dùng chung cửa Social. Lấy khoảng RỘNG (den7) rồi tự cắt khi cần
           * khoảng hẹp — đọc một lần rộng rẻ hơn hai lần hẹp. */
          const [buoi, sds] = await Promise.all([tnp.doc(tu, den), laySocial(tu, den7)]);
          const sl = mkt.soLieu(KHO.ds, { tu, den: den7, theo: 'dat' });
          return tnp.sauBuoi(buoi, sl.theoNgay, sds, 7);
        })().catch((e) => { delete NHO_TN[khoa]; throw e; });
      }
      try { return json(res, await NHO_TN[khoa]); }
      catch (e) { return json(res, { error: String((e && e.message) || e).slice(0, 200) }, 502); }
    }

    if (p === '/api/nhom-khach') {
      napNeuDoi();
      const nhanh = u.searchParams.get('nhanh') || 'b2c';
      const ten = u.searchParams.get('ten') || '';
      const ds = KHO.ds
        .map((o) => ({ o, g: cd.nhomCua(o) }))
        .filter((x) => x.g.nhanh === nhanh && x.g.ten === ten)
        .map(({ o, g }) => ({
          khoa: o.khoa, ten: o.ten, sdt: o.sdt, nuoc: o.nuoc, gioi: o.gioi,
          nhom: o.nhom, hang: o.hang, soDon: g.don.length, doanhThu: g.tien,
          lanCuoi: g.don.length ? g.don[g.don.length - 1].luc : '',
          kenh: [...new Set(g.don.map((d) => d.nguon).filter(Boolean))].join(', '),
        }))
        .sort((a, b) => b.doanhThu - a.doanhThu);

      if (u.searchParams.get('tep') === 'csv') {
        /* BOM ở đầu: không có nó thì Excel đọc UTF-8 thành chữ vỡ, và người
         * nhận tưởng tệp hỏng. */
        const o = (v) => '"' + String(v == null ? '' : v).split('"').join('""') + '"';
        const dong = [['Tên', 'Số điện thoại', 'Quốc gia', 'Giới tính', 'Nhóm', 'Hạng',
          'Số đơn', 'Doanh thu', 'Mua lần cuối', 'Kênh'].map(o).join(',')];
        for (const x of ds) {
          dong.push([x.ten, x.sdt ? "'+" + x.sdt : '', x.nuoc, x.gioi, x.nhom, x.hang,
            x.soDon, x.doanhThu, (x.lanCuoi || '').slice(0, 10), x.kenh].map(o).join(','));
        }
        const ten2 = 'khach-' + nhanh + '-' + ten.normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase().replace(/^-|-$/g, '');
        /* BOM đầu tệp: không có nó thì Excel đọc UTF-8 thành chữ vỡ, người
         * nhận tưởng tệp hỏng. Xuống dòng CRLF cũng vì Excel. */
        return gui(res, 200, '﻿' + dong.join('\r\n'), {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="' + ten2 + '.csv"',
          'Cache-Control': 'no-store',
        });
      }
      return json(res, { tong: ds.length, ds: ds.slice(0, 500) });
    }

    if (p === '/api/tim') {
      napNeuDoi();
      const ds = tim(u.searchParams.get('q') || '', {
        muc: u.searchParams.get('muc') || '',
        nuoc: u.searchParams.get('nuoc') || '',
        coDon: u.searchParams.get('coDon') || '',
      });
      const tu = Number(u.searchParams.get('tu') || 0);
      const soLuong = Math.min(Number(u.searchParams.get('so') || 50), 200);
      return json(res, {
        tong: ds.length,
        ds: ds.slice(tu, tu + soLuong).map((o) => ({
          khoa: o.khoa, ten: o.ten, sdt: o.sdt, nuoc: o.nuoc, gioi: o.gioi,
          hang: o.hang, nhom: o.nhom, muc: o.muc, soDon: o.soDon,
          doanhThu: o.doanhThu, lanCuoi: o.lanCuoi, kenh: o.kenh,
        })),
      });
    }

    if (p === '/api/khach') {
      const khoa = u.searchParams.get('khoa') || '';
      const o = KHO.ds.find((x) => x.khoa === khoa);
      if (!o) return json(res, { error: 'Không thấy hồ sơ' }, 404);
      return json(res, { khach: o });
    }

    if (p === '/api/keo' && req.method === 'POST') {
      const t = await keoLai();
      return json(res, { bat: t.bat, dangChay: !t.xong });
    }
    if (p === '/api/tien-do') {
      return json(res, dangKeo
        ? { dangChay: !dangKeo.xong, dong: dangKeo.dong.slice(-40), loi: dangKeo.loi }
        : { dangChay: false, dong: [], loi: '' });
    }

    if (p.startsWith('/api/')) return json(res, { error: 'Không có đường này' }, 404);

    /* ---- tệp tĩnh ---- */
    const rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
    const f = path.join(PUBLIC, rel);
    if (!f.startsWith(PUBLIC)) return json(res, { error: 'Từ chối' }, 403);
    let buf;
    try { buf = fs.readFileSync(f); } catch (_) { return json(res, { error: 'Không tìm thấy ' + rel }, 404); }
    if (rel === 'index.html') buf = Buffer.from(buf.toString('utf8').split('__V__').join(VAN_TAY), 'utf8');
    const coSoBan = /[?&]v=/.test(req.url);
    return gui(res, 200, buf, {
      'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': rel !== 'index.html' && coSoBan ? 'public, max-age=31536000, immutable' : 'no-store',
    });
  } catch (e) {
    console.error('[api]', p, '->', e.message);
    if (!res.headersSent) json(res, { error: e.message || 'Lỗi không xác định' }, 500);
  }
});

napTuDia();

/**
 * Trên Render KHÔNG có sẵn kho dữ liệu: `du-lieu/` bị chặn khỏi kho mã (12 MB,
 * đổi mỗi lần kéo), và ổ đĩa Render là ổ tạm nên mỗi lần deploy là trắng.
 *
 * Nên tự kéo khi khởi động nếu chưa có gì hoặc đã quá cũ. Kéo mất chừng mười
 * lăm phút và ghi dở dang mỗi hai mươi trang, nên màn hình đầy dần lên chứ
 * không đứng im — nhưng PHẢI nói rõ cho người xem biết là đang kéo, nếu không
 * họ nhìn bảng vơi mà tưởng tháng này ít khách.
 *
 * Từ 04/10/2026 kho đã nằm trên Lark Base (xem kho-base.js), như ô phát và
 * logo của hub — nên deploy xong là có ngay và lượt kéo mười lăm phút chỉ còn
 * là đường lùi cuối cùng, không còn là việc thường ngày.
 */
async function tuKeoNeuCan() {
  /* Thứ tự: đĩa → Base → Tourwell. Mỗi bậc đắt hơn bậc trước mười lần, nên
   * chỉ xuống bậc dưới khi bậc trên không có.
   *
   *   đĩa      ~0 giây   nhưng mất sạch sau mỗi lần deploy (ổ Render là ổ tạm)
   *   Base     ~35 giây  sống qua deploy
   *   Tourwell ~15 phút  và nện vào trần 60 lượt/phút dùng chung với hai app khác
   */
  let cu = KHO.luc ? Date.now() - Date.parse(KHO.luc) : Infinity;
  if (!KHO.ds.length) {
    console.log('  đĩa trống — thử kéo kho từ Lark Base');
    if (await khoBase.veDia(cfg.tepTho)) {
      napTuDia();
      cu = KHO.luc ? Date.now() - Date.parse(KHO.luc) : Infinity;
      console.log('  lấy được từ Base: ' + KHO.ds.length + ' hồ sơ');
    } else {
      console.log('  Base cũng chưa có kho');
    }
  }
  if (KHO.ds.length && cu < cfg.hanCu) {
    console.log('  kho còn mới (' + Math.round(cu / 3600000) + ' giờ) — không kéo lại');
    return;
  }
  console.log('  ' + (KHO.ds.length ? 'kho đã cũ' : 'chưa có kho') + ' — bắt đầu kéo nền từ Tourwell');
  keoLai().catch((e) => console.error('  kéo nền hỏng:', e.message));
}

may.listen(cfg.port, '127.0.0.1', () => {
  console.log('');
  console.log('  Rooty Trip · Khách hàng' + (cfg.trongHub ? '  (trong Marketing Hub)' : '  (chạy một mình)'));
  console.log('  ->  http://localhost:' + cfg.port);
  console.log('  hồ sơ: ' + KHO.ds.length + (KHO.luc ? '  · kéo lúc ' + KHO.luc : ''));
  console.log('');
  /* Chờ một nhịp rồi mới kéo: để máy chủ kịp nhận yêu cầu đầu tiên, không thì
   * người mở trang ngay lúc khởi động phải đợi cả lượt kéo. */
  setTimeout(() => { tuKeoNeuCan().catch((e) => console.error('  khởi động kho hỏng:', e.message)); }, 3000).unref();
});
