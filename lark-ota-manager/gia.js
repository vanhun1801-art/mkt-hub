'use strict';
/* ============================================================================
 * BẢNG GIÁ NET — số tiền Rooty Trip thực nhận trên mỗi khách, theo hợp đồng OTA.
 *
 * VÌ SAO ĐÂY MỚI LÀ NGUỒN TIỀN ĐÁNG TIN NHẤT:
 * Hợp đồng của Rooty Trip với OTA là giá NET cố định — mình nhận đúng 650.000đ
 * cho một người lớn đi Tour cano 3 đảo, bất kể Klook bán 800k hay GetYourGuide
 * bán 40 EUR. Nên:
 *   - `thực nhận` tính từ bảng giá này CHÍNH XÁC, không phải ước tính;
 *   - booking bán bằng EUR/CNY vẫn ra được doanh thu VNĐ (bảng giá là VNĐ);
 *   - so được số OTA báo trả với bảng giá ⇒ PHÁT HIỆN OTA TRẢ THIẾU.
 * Cách tính theo % hoa hồng chỉ còn là phương án chót khi chưa map được sản phẩm.
 *
 * ⚠️ NGUỒN GIÁ THẬT LÀ BẢNG "DANH MỤC TOUR" TRONG BASE, KHÔNG PHẢI FILE NÀY.
 * Base tính "Doanh thu thu về" bằng [Tour].[Giá thu về NL/TE], nên nếu file này
 * giữ một bảng giá riêng thì sớm muộn hai bên lệch nhau mà không ai biết tin cái
 * nào. Vì vậy: nối được Base ⇒ giá lấy TỪ Danh mục Tour (capNhatTuDanhMuc), và
 * mỗi sản phẩm mang theo record_id để nối cột liên kết "Tour".
 *
 * Phần còn giữ lại trong file này — và là phần đáng giá nhất — là LUẬT NHẬN DIỆN:
 * tên tour OTA gửi ("Phu Quoc: 3-Island Speedboat + Hon Thom Cable Car", tiếng
 * Trung, tiếng Hàn) không bao giờ trùng tên trong danh mục. Luật dưới đây khớp
 * chúng về đúng một tour, rồi giá thì hỏi Base.
 *
 * Bảng giá dưới là PHƯƠNG ÁN DỰ PHÒNG khi chưa nối được Base (booking vẫn vào
 * hàng đợi cục bộ và vẫn cần ước tính doanh thu). Ghi đè bằng OTA_GIA_JSON.
 * ========================================================================== */

/**
 * Bỏ dấu tiếng Việt, bỏ khoảng trắng và dấu câu, GIỮ chữ của mọi hệ chữ.
 *
 * KHÔNG lọc về [a-z0-9]: Ctrip gửi tên tour tiếng Trung, WAUG/MyRealTrip gửi
 * tiếng Hàn — lọc kiểu đó thì tên tour thành chuỗi rỗng, mọi booking châu Á đều
 * "không nhận ra sản phẩm". Giữ nguyên chữ để khai được alias tiếng Trung/Hàn.
 */
function chuan(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/* ------------------------------------------------------------------
 * Quy tắc nhận sản phẩm từ TÊN TOUR mà OTA gửi.
 *
 * Tên OTA không bao giờ khớp tên trong bảng giá: Klook gọi "Phú Quốc: Cano 3 đảo
 * + Cáp treo Hòn Thơm", bảng giá ghi "Tour cano + cáp treo". Nên mỗi sản phẩm
 * khai luật nhận diện thay vì một cái tên:
 *   nhom    — mảng các NHÓM token. Mỗi nhóm phải khớp ÍT NHẤT MỘT token.
 *             Nhiều nhóm = phải khớp hết các nhóm (VD tour cano + cáp treo cần
 *             một token nhóm "cano" VÀ một token nhóm "cáp treo").
 *   khongCo — chứa bất kỳ token nào ở đây thì KHÔNG phải sản phẩm này.
 *
 * Đây là chỗ dễ sai tiền nhất, nên: khớp được đúng một sản phẩm thì mới nhận;
 * không khớp cái nào, hay khớp hai cái ngang nhau, thì BẬT CỜ chứ không đoán.
 * Token viết dạng đã chuẩn hoá (không dấu, không khoảng trắng).
 * ------------------------------------------------------------------ */

const BAN_GIA = [
  {
    hieuLuc: '2026-08-15',
    ghiChu: 'Giá OTA thay đổi ngày 15/08/2026 · gói không giới hạn số lượng (VNĐ)',
    sanPham: [
      {
        id: 'cano-3-dao', ten: 'Tour cano 3 đảo', nhom: 'TOUR CANO',
        nguoiLon: 650000, treEm: 325000,
        /* Cano/speedboat 3 đảo, KHÔNG kèm cáp treo — kèm cáp treo là sản phẩm số 2,
         * giá gấp đôi. "4 đảo" là tour khác, không có trong bảng giá. */
        luat: [['cano', 'speedboat', '3dao', '3island', 'threeisland', 'islandhopping', '3섬', '三岛', '三島']],
        khongCo: ['captreo', 'cablecar', 'honthom', '케이블카', '缆车', '纜車',
          '4dao', '4island', 'fourisland', '四岛', '四島'],
      },
      {
        id: 'cano-cap-treo', ten: 'Tour cano + cáp treo', nhom: 'TOUR CANO',
        nguoiLon: 1400000, treEm: 925000,
        luat: [
          ['cano', 'speedboat', '3dao', '3island', 'threeisland', 'islandhopping'],
          ['captreo', 'cablecar', 'honthom', '케이블카', '缆车', '纜車'],
        ],
      },
      {
        id: 'sunset-town', ten: 'Tour Sunset Town (Symphony of the Sea)', nhom: 'TOUR LAND NAM ĐẢO',
        nguoiLon: 1100000, treEm: 750000,
        luat: [['sunsettown', 'symphony', '심포니', '선셋타운', '日落小镇']],
      },
      {
        id: 'cap-treo-hon-thom', ten: 'Tour Cáp treo Hòn Thơm', nhom: 'TOUR LAND NAM ĐẢO',
        nguoiLon: 1270000, treEm: 910000,
        luat: [['captreo', 'cablecar', 'honthom', '케이블카', '缆车', '纜車']],
        khongCo: ['cano', 'speedboat', '3dao', '3island', 'islandhopping'],
      },
      {
        id: 'kiss-of-the-sea', ten: 'Tour Nam Đảo Kiss Of The Sea', nhom: 'TOUR LAND NAM ĐẢO',
        nguoiLon: 1325000, treEm: 975000,
        /* 'kiss' một mình KHÔNG đủ: "Show Kiss The Stars" là chương trình khác,
         * nên bắt buộc có thêm token nhóm "biển". */
        luat: [['kiss', '키스'], ['sea', 'bien', '바다', '海']],
      },
      {
        id: 'rach-vem', ten: 'Tour Rạch Vẹm', nhom: 'TOUR LAND BẮC ĐẢO',
        nguoiLon: 800000, treEm: 400000,
        luat: [['rachvem', 'starfish', 'saobien', '불가사리']],
      },
      {
        id: 'vinwonders-grandworld', ten: 'Tour Vinwonders - Grandworld', nhom: 'TOUR LAND BẮC ĐẢO',
        nguoiLon: 1725000, treEm: 1055000,
        luat: [['vinwonder', 'grandworld', '빈원더스', '그랜드월드']],
      },
    ],
  },
];

/**
 * Chuẩn hoá token của luật NGAY KHI NẠP bảng giá.
 *
 * BẮT BUỘC, không phải cho gọn: chuan() gọi normalize('NFD'), thao tác này TÁCH
 * chữ Hàn thành Jamo ('섬' → 'ㅅㅓㅁ'). Tên tour đã bị tách mà token trong file
 * vẫn ở dạng tổ hợp thì includes() luôn trả false — mọi alias tiếng Hàn/Trung im
 * lặng không khớp. Chạy cả hai bên qua cùng một hàm mới so được.
 * Phụ thêm: nhờ vậy khai alias có dấu, có khoảng trắng ("Cáp treo") cũng khớp.
 */
function chuanHoaBan(ban) {
  return {
    ...ban,
    sanPham: ban.sanPham.map((sp) => ({
      ...sp,
      luat: (Array.isArray(sp.luat) && sp.luat.length ? sp.luat : [[sp.ten]])
        .map((nhom) => nhom.map(chuan).filter(Boolean))
        .filter((nhom) => nhom.length),
      khongCo: (sp.khongCo || []).map(chuan).filter(Boolean),
    })),
  };
}

/** Đọc bảng giá: env OTA_GIA_JSON ghi đè hoàn toàn bảng mặc định. */
function docBanGia() {
  const raw = process.env.OTA_GIA_JSON;
  if (raw && raw.trim()) {
    try {
      const j = JSON.parse(raw);
      const ds = Array.isArray(j) ? j : [j];
      if (ds.length && ds.every((b) => b.hieuLuc && Array.isArray(b.sanPham))) {
        return ds.map(chuanHoaBan).sort((a, b) => b.hieuLuc.localeCompare(a.hieuLuc));
      }
      console.warn('[gia] OTA_GIA_JSON sai hình dạng (cần [{hieuLuc, sanPham:[…]}]) — dùng bảng mặc định');
    } catch (e) {
      console.warn('[gia] OTA_GIA_JSON không phải JSON hợp lệ — dùng bảng mặc định. ' + e.message);
    }
  }
  return BAN_GIA.map(chuanHoaBan).sort((a, b) => b.hieuLuc.localeCompare(a.hieuLuc));
}

let cache = null;
let banBase = null;   // bảng giá dựng từ Danh mục Tour — đè lên bảng dự phòng

/**
 * Nạp giá từ Danh mục Tour của Base.
 *
 * Ghép mỗi bản ghi tour với LUẬT nhận diện trong bảng dự phòng, theo thứ tự:
 *   1. ghi chú "Bảng giá gọi là: X" — chính chủ base đã tự khai X là tên nào;
 *   2. luật khớp thẳng trên Tên tour;
 *   3. tên trùng nhau.
 * Ghép được thì tour thừa hưởng cả alias tiếng Anh/Trung/Hàn; không ghép được
 * (VD "Tour du thuyền" chưa có trong bảng cũ) thì vẫn nhận, chỉ là luật hẹp hơn:
 * tên tour + mã tour. Thà nhận diện hẹp còn hơn bỏ rơi một tour đang bán.
 */
function capNhatTuDanhMuc(tours) {
  const ds = Array.isArray(tours) ? tours.filter((t) => t && t.ten) : [];
  if (!ds.length) { banBase = null; return null; }

  const duPhong = docBanGia();
  const tatCaSp = duPhong.flatMap((b) => b.sanPham);

  const sanPham = ds.map((t) => {
    /* Ghi chú kiểu "Bảng giá gọi là: Tour cano 3 đảo" — chính chủ base đã tự
     * khai tour này ứng với tên nào trong bảng giá cũ. Cắt bằng indexOf cho chắc,
     * khỏi phụ thuộc regex có dấu tiếng Việt. */
    const gc = String(t.ghiChu || '');
    const vt = gc.toLowerCase().indexOf('bảng giá gọi là');
    const tenGoc = vt < 0 ? '' : gc.slice(gc.indexOf(':', vt) + 1).split('.')[0].trim();
    const theoGhiChu = tenGoc ? tatCaSp.find((sp) => chuan(sp.ten) === chuan(tenGoc)) : null;
    const theoLuat = theoGhiChu || tatCaSp.find((sp) => khop(sp, chuan(t.ten)));
    const cu = theoLuat || tatCaSp.find((sp) => chuan(sp.ten) === chuan(t.ten)) || null;

    /* Tên/mã của chính bản ghi LUÔN được thêm vào luật: người vận hành đặt tên
     * trong danh mục thế nào thì tên đó phải nhận ra được. */
    const rieng = [t.ten, t.ma].filter(Boolean);
    return {
      id: t.ma || chuan(t.ten),
      ten: t.ten,
      recordId: t.recordId,
      nhom: (cu && cu.nhom) || '',
      nguoiLon: t.nguoiLon,
      treEm: t.treEm,
      dangBan: t.dangBan !== false,
      tuDanhMuc: true,
      ghepVoi: cu ? cu.ten : '',
      luat: cu ? cu.luat.map((nhom) => nhom.slice()) : [rieng],
      khongCo: cu ? (cu.khongCo || []).slice() : [],
    };
  });

  /* Tour nào ghép được luật cũ thì bổ sung thêm tên riêng vào NHÓM ĐẦU, để cả
   * alias cũ lẫn tên trong danh mục đều khớp. */
  sanPham.forEach((sp, i) => {
    if (!sp.ghepVoi) return;
    const t = ds[i];
    sp.luat[0] = [...new Set([...sp.luat[0], chuan(t.ten), chuan(t.ma || '')].filter(Boolean))];
  });

  banBase = chuanHoaBan({
    hieuLuc: '0001-01-01',   // giá trong Base là giá ĐANG hiệu lực, không theo mốc ngày
    nguon: 'danh-muc',
    ghiChu: 'Giá thu về đọc từ bảng "' + require('./config').tableTourName + '" trong Base',
    sanPham,
  });
  cache = null;
  return banBase;
}

const banGia = () => {
  if (banBase) return [banBase];
  return (cache || (cache = docBanGia()));
};

/**
 * Bản giá áp cho một ngày. Ngày rỗng ⇒ lấy bản mới nhất.
 * Ngày sớm hơn mọi bản (booking cũ hơn bảng giá đầu tiên) ⇒ null, app bật cờ
 * chứ không lấy bừa bản mới — giá mới áp cho tour cũ là sai tiền.
 */
function banGiaCho(ngay) {
  const ds = banGia();
  if (!ngay) return ds[0] || null;
  return ds.find((b) => b.hieuLuc <= ngay) || null;
}

/* ---------------------------------------------------------- nhận sản phẩm */

/** Nhóm token của một sản phẩm — đã được chuanHoaBan() chuẩn hoá lúc nạp. */
const luatCua = (sp) => sp.luat || [[chuan(sp.ten)]];

/**
 * Độ CỤ THỂ của một lần khớp: cộng độ dài token khớp dài nhất của từng nhóm.
 * Nhờ vậy "cano + cáp treo" (khớp 2 nhóm) luôn thắng "cano 3 đảo" (1 nhóm) khi
 * tên tour có cả hai — đúng sản phẩm, đúng giá.
 */
function diem(sp, t) {
  return luatCua(sp).reduce((s, nhom) => {
    const dai = nhom.filter((x) => t.includes(x)).reduce((m, x) => Math.max(m, x.length), 0);
    return s + dai;
  }, 0);
}

function khop(sp, t) {
  if ((sp.khongCo || []).some((x) => t.includes(x))) return false;
  return luatCua(sp).every((nhom) => nhom.some((x) => t.includes(x)));
}

/**
 * Tên tour của OTA → sản phẩm trong bảng giá.
 * @returns {{ sanPham, ban } | { loi: 'khong-thay'|'trung'|'chua-co-bang', ungVien? }}
 */
function nhanSanPham(tenTour, ngay) {
  const ban = banGiaCho(ngay);
  if (!ban) return { loi: 'chua-co-bang' };
  const t = chuan(tenTour);
  if (!t) return { loi: 'khong-thay', ban };

  const hit = ban.sanPham.filter((sp) => khop(sp, t)).map((sp) => ({ sp, d: diem(sp, t) }));
  if (!hit.length) return { loi: 'khong-thay', ban };

  hit.sort((a, b) => b.d - a.d);
  /* Hai sản phẩm khớp CỤ THỂ NGANG NHAU thì không đoán — chọn bừa là sai tiền
   * mà không ai biết. Bật cờ để người vận hành tự chốt. */
  if (hit.length > 1 && hit[0].d === hit[1].d) {
    return { loi: 'trung', ban, ungVien: hit.map((h) => h.sp.ten) };
  }
  return { sanPham: hit[0].sp, ban };
}

/**
 * Thực nhận theo bảng giá.
 * @returns {{ tien, sanPham, hieuLuc } | { loi, ungVien? }}
 *   `tien` LUÔN là VNĐ, kể cả booking bán bằng EUR/CNY — vì bảng giá là VNĐ.
 */
function thucNhanTheoBangGia({ tour, ngay, nguoiLon, treEm }) {
  const kq = nhanSanPham(tour, ngay);
  if (kq.loi) return kq;

  const nl = Number(nguoiLon) || 0;
  const te = Number(treEm) || 0;
  if (nl + te <= 0) return { loi: 'khong-co-so-khach', sanPham: kq.sanPham };

  return {
    tien: nl * kq.sanPham.nguoiLon + te * kq.sanPham.treEm,
    sanPham: kq.sanPham,
    hieuLuc: kq.ban.hieuLuc,
    chiTiet: [
      nl ? nl + ' NL × ' + kq.sanPham.nguoiLon.toLocaleString('vi-VN') : '',
      te ? te + ' TE × ' + kq.sanPham.treEm.toLocaleString('vi-VN') : '',
    ].filter(Boolean).join(' + '),
  };
}

/** Bảng giá đang dùng, cho màn hình Thiết lập. */
function tomTat() {
  return banGia().map((b) => ({
    hieuLuc: b.hieuLuc,
    ghiChu: b.ghiChu || '',
    nguon: b.nguon || 'du-phong',
    sanPham: b.sanPham.map((sp) => ({
      id: sp.id, ten: sp.ten, nhom: sp.nhom || '',
      recordId: sp.recordId || '', ghepVoi: sp.ghepVoi || '',
      nguoiLon: sp.nguoiLon, treEm: sp.treEm,
      luat: luatCua(sp).map((nhom) => '(' + nhom.join(' / ') + ')').join(' VÀ ') +
        ((sp.khongCo || []).length ? '  — loại nếu có: ' + sp.khongCo.join(' / ') : ''),
    })),
  }));
}

function xoaCache() { cache = null; banBase = null; }

/** Bảng giá hiện đang dùng lấy từ đâu — tab Thiết lập in ra để khỏi đoán. */
const nguonGia = () => (banBase ? 'danh-muc' : (process.env.OTA_GIA_JSON ? 'env' : 'du-phong'));

module.exports = {
  thucNhanTheoBangGia, nhanSanPham, banGiaCho, tomTat, chuan, xoaCache,
  capNhatTuDanhMuc, nguonGia,
  BAN_GIA,
};
