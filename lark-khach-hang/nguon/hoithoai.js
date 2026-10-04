'use strict';
/**
 * ============================================================================
 * KHÁCH HỎI GÌ, SỢ GÌ — quét từ hội thoại Facebook/TikTok
 * ============================================================================
 * Khung Buyer Persona anh Hùng gửi có mục "Điểm đau & Rào cản", và gợi ý lấy
 * bằng cách phỏng vấn sales. Nhưng mình đã có sẵn thứ tốt hơn lời kể lại:
 * CHÍNH LỜI KHÁCH GÕ, hàng nghìn đoạn, trong Pancake.
 *
 * Cả app Khách hàng cho tới trước tệp này đều dựng trên ĐƠN HÀNG — tức hành vi
 * sau khi đã mua. Người hỏi rồi không mua, và lý do họ chần chừ, không nằm ở
 * đâu cả. Đây là chỗ lấp khoảng trống đó.
 *
 * Giới hạn phải nói trước:
 *   · Gom theo TỪ KHOÁ, nên chỉ bắt được điều khách nói thẳng. Khách ngại
 *     không hỏi thì mình vẫn không biết.
 *   · Mỗi hội thoại là một lượt gọi API, nên phải lấy mẫu chứ không quét hết.
 *     Mẫu thì có sai số; app ghi rõ đã quét bao nhiêu trên tổng bao nhiêu.
 *   · Không dùng cho việc ghi công quảng cáo — đường đó đã dò cạn và loại
 *     (28/09/2026, 97% hội thoại TikTok không có số điện thoại).
 */
const path = require('path');
const GOC = path.join(__dirname, '..', '..', 'lark-ads-manager', 'sync');

const cho = (ms) => new Promise((r) => setTimeout(r, ms));
const boDau = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/gi, 'd').toLowerCase();

/**
 * Các mối bận tâm, xếp theo việc Marketing làm gì với chúng.
 *
 * Thứ tự có ý nghĩa: một câu hỏi được tính vào MỌI chủ đề nó chạm, vì "cho bé
 * 3 tuổi đi có say sóng không ạ" vừa là lo trẻ em vừa là lo say sóng — ép nó
 * vào một ô là mất một nửa thông tin.
 */
const CHU_DE = [
  ['Giá và chi phí phát sinh', /gia |bao nhieu|nhieu tien|re hon|giam gia|khuyen mai|phat sinh|phu thu|tron goi|da bao gom|con gi khong/],
  ['Say sóng, sức khoẻ', /say song|say xe|say tau|chong mat|non oi|buon non|suc khoe|bau|mang thai/],
  ['Trẻ em và người già', /tre em|em be|\bbe \b|con nho|may tuoi|tuoi di duoc|nguoi gia|ong ba|cao tuoi|bao nhieu tuoi/],
  ['An toàn', /an toan|ao phao|cuu ho|tai nan|nguy hiem|co sao khong|bao hiem/],
  ['Lịch trình và thời gian', /may gio|bao lau|lich trinh|khoi hanh|ve luc|mat bao lau|di trong ngay|thoi gian/],
  ['Đón trả và di chuyển', /don o dau|dua don|xe don|khach san nao|dia chi|di chuyen|san bay|cang/],
  ['Ăn uống', /an trua|bua an|do an|hai san|an uong|thuc don|chay\b|an chay/],
  ['Thời tiết và mùa', /thoi tiet|mua\b|mua bao|song to|bien dong|nang|thang may di dep/],
  ['Ảnh và quay phim', /chup anh|flycam|quay phim|tho chup|anh dep|camera/],
  ['Huỷ, đổi, hoàn tiền', /huy tour|doi ngay|hoan tien|hoan coc|khong di duoc|doi lich/],
  ['Đặt cọc và thanh toán', /dat coc|coc truoc|chuyen khoan|thanh toan|tra sau|so tai khoan|hoa don/],
  ['Còn chỗ không', /con cho|con slot|het cho|con ve|dat duoc khong|ngay mai di duoc/],
];

/**
 * Tin này có phải KHÁCH nói không.
 *
 * `laAdmin` một mình là chưa đủ. Trả lời TỰ ĐỘNG của page cũng có laAdmin =
 * false, và người gửi là chính tay cầm của page ("ttm_rootytrip.official").
 * Đếm chúng vào là mọi chủ đề bị thổi phồng bằng chính lời quảng cáo của
 * mình — lần chạy đầu, "Ảnh và quay phim" đứng thứ hai chỉ vì câu mở đầu tự
 * động có chữ "lặn ngắm san hô", gửi cho mọi hội thoại.
 *
 * Mốc so là TÊN KHÁCH của hội thoại: nó đến từ Pancake chứ không phải mình
 * đoán theo hình dạng chuỗi, nên không hỏng khi page đổi tay cầm.
 */
function laKhachNoi(m, c) {
  if (m.laAdmin) return false;
  const ai = boDau(m.tenNguoiGui);
  if (!ai) return false;
  const khach = boDau(c && c.tenKhach);
  if (khach) return ai === khach;
  /* Không biết tên khách thì lùi về nhận dạng tay cầm của page — yếu hơn,
   * nhưng vẫn hơn là đếm nhầm lời quảng cáo thành lời khách. */
  return !/^(ttm_|fb_|ig_)/.test(ai) && ai !== boDau(c && c.label);
}

/** Câu này có phải một CÂU HỎI không. */
const laCauHoi = (s) => {
  const t = boDau(s);
  if (s.includes('?')) return true;
  return /^(cho (minh|em|anh|chi) hoi|cho hoi|ben minh|co .* khong|bao nhieu|may gio|the nao|lam sao|khi nao|o dau|minh muon hoi)/.test(t)
    || / khong a?$| khong\?*$|\bbao nhieu\b|\bmay gio\b/.test(t);
};

/**
 * Quét hội thoại và gom mối bận tâm.
 * @param gioiHan số hội thoại tối đa sẽ đọc nội dung (mỗi cái một lượt gọi API)
 */
async function quet({ tu, den, gioiHan = 250, bao = () => {} }) {
  const k = require(path.join(GOC, 'ketnoi.js'));
  const pan = require(path.join(GOC, 'pancake.js'));
  const cfg = (typeof k.read === 'function') ? k.read() : k;
  const conf = cfg.pancake || {};
  if (!conf.enabled || !(conf.pages || []).length) throw new Error('Chưa bật Pancake hoặc chưa khai page');

  const ra = {
    ky: { tu, den }, soHoiThoai: 0, daDoc: 0, soTinKhach: 0, soCauHoi: 0,
    chuDe: {}, viDu: {}, theoKenh: {}, loi: [],
    /* Mối lo tách theo TỪNG QUẢNG CÁO. 50% hội thoại có gắn mã quảng cáo (đo
     * 04/10/2026: 400/796, 14 quảng cáo khác nhau), nên trả lời được câu
     * "quảng cáo nào kéo về khách hỏi giá, quảng cáo nào kéo về khách hỏi trẻ
     * em". Biết chung chung "khách hay hỏi giá" thì không sửa được quảng cáo
     * nào cụ thể; biết theo từng quảng cáo thì sửa được ngay. */
    theoQC: {}, soQC: 0,
  };

  for (const page of conf.pages) {
    let ds = [];
    try {
      /* fetchConversations trả {rows, ...} chứ không phải mảng — cùng kiểu bẫy
       * đã dính ở meta.js hôm nay. Chuẩn hoá ngay tại cửa vào. */
      const res = await pan.fetchConversations(page, tu, den, () => {});
      ds = Array.isArray(res) ? res : ((res && res.rows) || []);
    }
    catch (e) { ra.loi.push((page.ten || page.pageId) + ': ' + String(e.message).slice(0, 120)); continue; }
    ra.soHoiThoai += ds.length;
    const kenh = pan.doanNenTang ? (pan.doanNenTang(page) || page.ten || 'Pancake') : (page.ten || 'Pancake');
    bao((page.ten || page.pageId) + ': ' + ds.length + ' hội thoại');

    /* Lấy mẫu TRẢI ĐỀU chứ không lấy 250 cái đầu: hội thoại xếp theo thời
     * gian, lấy đầu danh sách là chỉ đọc được mấy ngày gần nhất và mọi kết
     * luận về "khách hay hỏi gì" sẽ nghiêng theo đúng mấy ngày đó. */
    const buoc = Math.max(1, Math.ceil(ds.length / gioiHan));
    const mau = ds.filter((_, i) => i % buoc === 0).slice(0, gioiHan);

    for (const c of mau) {
      let tins = [];
      try {
        tins = await pan.fetchMessages(page, conf.userToken, c.id, c.khachId);
      } catch (e) {
        if (ra.loi.length < 5) ra.loi.push('đọc tin: ' + String(e.message).slice(0, 110));
        continue;
      }
      ra.daDoc += 1;
      /* Đếm hội thoại của từng quảng cáo TRƯỚC khi xét nội dung: một quảng cáo
       * kéo về nhiều người mà chẳng ai hỏi gì cũng là thông tin — nó khác hẳn
       * một quảng cáo không ai nhắn. */
      const qcCua = (c.adIds || []).filter(Boolean);
      for (const ad of qcCua) {
        const o = ra.theoQC[ad] || (ra.theoQC[ad] = { ad, kenh, soHoiThoai: 0, chuDe: {} });
        o.soHoiThoai += 1;
      }
      for (const m of tins) {
        if (!m.noiDung || !laKhachNoi(m, c)) continue;
        ra.soTinKhach += 1;
        const hoi = laCauHoi(m.noiDung);
        if (hoi) ra.soCauHoi += 1;
        const t = boDau(m.noiDung);
        for (const [ten, re] of CHU_DE) {
          if (!re.test(t)) continue;
          ra.chuDe[ten] = (ra.chuDe[ten] || 0) + 1;
          for (const ad of qcCua) ra.theoQC[ad].chuDe[ten] = (ra.theoQC[ad].chuDe[ten] || 0) + 1;
          const bk = ten + '|' + kenh;
          ra.theoKenh[bk] = (ra.theoKenh[bk] || 0) + 1;
          /* Giữ vài câu gốc cho mỗi chủ đề. Con số không thuyết phục được ai;
           * đọc đúng lời khách nói thì mới viết được nội dung trả lời. */
          const vd = ra.viDu[ten] || (ra.viDu[ten] = []);
          const cau = m.noiDung.replace(/\s+/g, ' ').trim();
          /* Khử trùng: cùng một câu hỏi được nhiều khách gõ y hệt (hoặc copy
           * từ bài đăng), hiện ba lần liền thì trông như lỗi và chiếm mất chỗ
           * của câu khác. */
          if (vd.length < 6 && cau.length > 12 && cau.length < 300
              && !vd.some((x) => boDau(x.cau) === boDau(cau))) {
            vd.push({ cau, kenh, hoi });
          }
        }
      }
      await cho(250);     // Pancake không công bố trần, giãn nhẹ cho lịch sự
    }
  }
  ra.soQC = Object.keys(ra.theoQC).length;
  return ra;
}

module.exports = { quet, CHU_DE, laCauHoi };
