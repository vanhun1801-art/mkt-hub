'use strict';
/**
 * Đọc bình luận Facebook/Instagram và lọc ra những bình luận CÓ VẺ LÀ KHÁCH HỎI MUA.
 *
 * Vì sao cần: một bài của Rooty Trip có 2.077 bình luận. Không ai đọc hết, và
 * lẫn trong đó là những câu như "Cho Gia 2 người", "Cho mình xin thêm thông tin
 * a" — khách thật, hỏi thật, rồi trôi mất vì không ai thấy. Đây không phải chỉ
 * số để ngắm; đây là việc phải làm trong ngày.
 *
 * ĐỌC ĐƯỢC, TRẢ LỜI THÌ CHƯA. Token hiện có `pages_read_engagement` nên lấy được
 * nội dung bình luận, nhưng thiếu `pages_manage_engagement` và
 * `instagram_manage_comments` nên không trả lời được từ đây. Vì thế mỗi dòng kèm
 * link mở thẳng bài trên Facebook/Instagram để trả lời tại chỗ. Xin thêm hai
 * quyền đó thì mới làm được nút Trả lời.
 *
 * TÊN NGƯỜI BÌNH LUẬN THƯỜNG BỊ META ẨN — chỉ hiện tên với người đã dùng app.
 * Không phải lỗi, và cũng không cần: cái cần đọc là nội dung.
 *
 * KHÔNG LƯU BÌNH LUẬN VÀO BASE. 2.077 bình luận một bài, nhân số bài, là một
 * bảng khổng lồ mà 99% không ai đọc lại. Gọi thẳng API mỗi lần mở màn hình, giới
 * hạn ở các bài gần đây.
 */
const { getJson, scrub, hideSecret } = require('./sync/http');

const g = (fb) => 'https://graph.facebook.com/' + ((fb && fb.apiVersion) || 'v23.0');

/**
 * `\b` CỦA JAVASCRIPT KHÔNG DÙNG ĐƯỢC VỚI TIẾNG VIỆT CÓ DẤU.
 *
 * `\b` coi "chữ" là [A-Za-z0-9_], nên `á` bị tính là dấu phân cách. Hệ quả:
 * /\bgiá\b/ khớp "cảm giác" — đã bắt nhầm đúng như thế ở lần chạy thật đầu tiên,
 * một bình luận tâm sự chuyến đi bị đánh dấu là khách hỏi giá. Vài chục lần như
 * vậy là người trực mất lòng tin vào cả danh sách, và danh sách mất luôn tác dụng.
 *
 * Ranh giới đúng phải hỏi "bên cạnh có phải CHỮ CÁI nào không" — \p{L} với cờ u.
 */
const bien = (than) => new RegExp('(?<!\\p{L})(?:' + than + ')(?!\\p{L})', 'iu');

/**
 * Dấu hiệu khách đang hỏi mua, theo đúng cách người Việt gõ trên điện thoại.
 *
 * Cộng điểm chứ không chỉ khớp một lần: "giá" một mình có thể là "giá mà mình
 * được đi", nhưng "giá" đi với "inbox" thì gần như chắc.
 *
 * "Nêu số khách" và "nêu lịch trình" được tính 3 điểm ngang với hỏi giá, vì
 * trong ngữ cảnh bán tour thì không ai vô cớ viết "2 người" hay "4 ngày 3 đêm".
 * Hai câu thật lấy từ bình luận của trang — "Cho Gia 2 người" và "Chào em 4ngày
 * 3 đêm" — đều là khách hỏi mua mà bản chấm 2 điểm bỏ lọt.
 */
const DAU_HIEU = [
  { diem: 3, ten: 'xin giá', re: bien('bao nhiêu|bn|nhiêu tiền|giá|giá bao|hết bao|báo giá') },
  { diem: 3, ten: 'xin thông tin', re: bien('cho (mình|em|e|m|tôi|tui|anh|chị)|xin (thông tin|tt|info)|tư vấn|ib|inbox|nhắn tin') },
  { diem: 3, ten: 'muốn đặt', re: bien('đặt|book|booking|đăng ký|dang ky|còn chỗ|con cho|chốt|lấy \\d+') },
  { diem: 3, ten: 'nêu số khách', re: bien('\\d{1,2}\\s*(người|ng|khách|nguoi|kh|người lớn|trẻ)') },
  { diem: 3, ten: 'nêu lịch trình', re: bien('\\d\\s*(ngày|ngay)\\s*\\d\\s*(đêm|dem)') },
  { diem: 3, ten: 'để lại số', re: /(^|\D)(0|\+84)\d{8,10}(\D|$)/ },
  { diem: 1, ten: 'hỏi thời gian', re: bien('khi nào|bao giờ|tháng \\d+|còn tour') },
];

/** Từ `diem` trở lên thì coi là đáng xử lý. */
const NGUONG = 3;

/**
 * @returns { diem, dauHieu: [tên…] }
 */
function chamDiem(text) {
  const s = String(text || '');
  let diem = 0;
  const dh = [];
  DAU_HIEU.forEach((x) => {
    if (x.re.test(s)) { diem += x.diem; dh.push(x.ten); }
  });
  return { diem, dauHieu: dh };
}

const laKhachHoi = (text) => chamDiem(text).diem >= NGUONG;

/* ---------------- lấy về ---------------- */

async function baiGanDay(fb, page, tuNgay, soBai) {
  const r = await getJson(g(fb) + '/' + page.id + '/posts?limit=' + soBai
    + '&since=' + tuNgay
    + '&fields=' + encodeURIComponent('id,created_time,message,permalink_url,comments.summary(true).limit(0)')
    + '&access_token=' + encodeURIComponent(page.token), {
    label: 'Facebook posts (bình luận) ' + (page.name || page.id), retries: 2,
  });
  if (r.error) throw new Error(scrub('Facebook báo lỗi (' + r.error.code + '): ' + r.error.message));
  return (r.data || []).map((p) => ({
    id: String(p.id),
    luc: p.created_time || '',
    tieuDe: String(p.message || '').slice(0, 120),
    url: p.permalink_url || '',
    soBinhLuan: Number((p.comments && p.comments.summary && p.comments.summary.total_count) || 0),
  }));
}

async function binhLuanCuaBai(fb, token, baiId, soLay) {
  const r = await getJson(g(fb) + '/' + baiId + '/comments?limit=' + soLay
    + '&order=reverse_chronological'
    + '&fields=' + encodeURIComponent('id,message,created_time,from{name},comment_count,like_count')
    + '&access_token=' + encodeURIComponent(token), { label: 'Facebook comments', retries: 1 });
  if (r.error) return [];
  return (r.data || []).map((x) => ({
    id: String(x.id),
    noiDung: String(x.message || ''),
    luc: x.created_time || '',
    /* Meta chỉ trả tên với người đã dùng app — phần lớn là rỗng. Không phải lỗi. */
    ten: (x.from && x.from.name) || '',
    soTraLoi: Number(x.comment_count || 0),
    thich: Number(x.like_count || 0),
  }));
}

async function igBaiGanDay(fb, token, igId, soBai) {
  const r = await getJson(g(fb) + '/' + igId + '/media?limit=' + soBai
    + '&fields=' + encodeURIComponent('id,caption,permalink,timestamp,comments_count')
    + '&access_token=' + encodeURIComponent(token), { label: 'Instagram media (bình luận)', retries: 2 });
  if (r.error) throw new Error(scrub('IG báo lỗi (' + r.error.code + '): ' + r.error.message));
  return (r.data || []).map((m) => ({
    id: String(m.id),
    luc: m.timestamp || '',
    tieuDe: String(m.caption || '').slice(0, 120),
    url: m.permalink || '',
    soBinhLuan: Number(m.comments_count || 0),
  }));
}

async function igBinhLuan(fb, token, mediaId, soLay) {
  const r = await getJson(g(fb) + '/' + mediaId + '/comments?limit=' + soLay
    + '&fields=' + encodeURIComponent('id,text,timestamp,username,replies')
    + '&access_token=' + encodeURIComponent(token), { label: 'Instagram comments', retries: 1 });
  if (r.error) return [];
  return (r.data || []).map((x) => ({
    id: String(x.id),
    noiDung: String(x.text || ''),
    luc: x.timestamp || '',
    ten: x.username || '',
    soTraLoi: Number((x.replies && x.replies.data && x.replies.data.length) || 0),
    thich: 0,
  }));
}

/**
 * Quét bình luận của các bài gần đây, trả về những cái đáng xử lý.
 *
 * @param opts { soNgay, soBaiMoiKenh, soBinhLuanMoiBai, chiKhachHoi }
 */
async function quet(conf, opts = {}, log = () => {}) {
  const fb = conf.facebook || {};
  const soNgay = Number(opts.soNgay) || 7;
  const soBai = Number(opts.soBaiMoiKenh) || 15;
  const soBL = Number(opts.soBinhLuanMoiBai) || 50;
  const chiKhach = opts.chiKhachHoi !== false;

  const tu = new Date(Date.now() - soNgay * 86400000).toISOString().slice(0, 10);
  const ra = [];
  const canhBao = [];
  let daQuet = 0;

  /* Nhân sự chỉ được quét Trang thuộc phạm vi của họ. Bỏ trống là không giới
   * hạn — quản lý, hoặc chưa kênh nào khai người xem. */
  const chiTrang = Array.isArray(opts.chiTrang) && opts.chiTrang.length
    ? new Set(opts.chiTrang.map(String)) : null;

  for (const page of (fb.pages || [])) {
    if (!page.token) continue;
    if (chiTrang && !chiTrang.has(String(page.id))) continue;
    hideSecret(page.token);
    try {
      const ds = await baiGanDay(fb, page, tu, soBai);
      for (const b of ds) {
        if (!b.soBinhLuan) continue;
        const bl = await binhLuanCuaBai(fb, page.token, b.id, soBL);
        daQuet += bl.length;
        bl.forEach((x) => {
          const cd = chamDiem(x.noiDung);
          if (chiKhach && cd.diem < NGUONG) return;
          ra.push({
            ...x, ...cd,
            platform: 'Facebook',
            kenh: page.name || page.id,
            baiUrl: b.url,
            baiTieuDe: b.tieuDe,
          });
        });
      }
    } catch (e) {
      canhBao.push('Facebook · ' + (page.name || page.id) + ': ' + e.message);
    }
  }

  for (const acc of ((conf.instagram || {}).accounts || [])) {
    const page = (fb.pages || []).find((x) => String(x.id) === String(acc.pageId));
    if (!page || !page.token) continue;
    try {
      const ds = await igBaiGanDay(fb, page.token, acc.id, soBai);
      for (const b of ds) {
        if (!b.soBinhLuan) continue;
        if (b.luc && b.luc.slice(0, 10) < tu) continue;
        const bl = await igBinhLuan(fb, page.token, b.id, soBL);
        daQuet += bl.length;
        bl.forEach((x) => {
          const cd = chamDiem(x.noiDung);
          if (chiKhach && cd.diem < NGUONG) return;
          ra.push({
            ...x, ...cd,
            platform: 'Instagram',
            kenh: acc.name || acc.username || acc.id,
            baiUrl: b.url,
            baiTieuDe: b.tieuDe,
          });
        });
      }
    } catch (e) {
      canhBao.push('Instagram · ' + (acc.name || acc.id) + ': ' + e.message);
    }
  }

  /* Điểm cao lên trước, rồi mới đến mới nhất: người trực cần xử lý câu rõ ràng
   * nhất trước, không phải câu vừa gõ xong. */
  ra.sort((a, b) => (b.diem - a.diem) || String(b.luc).localeCompare(String(a.luc)));
  log('Bình luận: quét ' + daQuet + ', lọc ra ' + ra.length);
  return { ds: ra, daQuet, tu, canhBao };
}

module.exports = { DAU_HIEU, NGUONG, chamDiem, laKhachHoi, quet };
