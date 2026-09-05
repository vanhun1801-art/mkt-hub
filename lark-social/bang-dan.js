'use strict';
/**
 * Đọc bảng người dùng dán vào (TikTok LIVE Center xuất CSV, hoặc bôi đen trong
 * Excel rồi Ctrl+C — khi đó các cột cách nhau bằng Tab).
 *
 * Nhận diện cột theo TÊN ở dòng đầu, không theo thứ tự. LIVE Center đổi thứ tự
 * cột giữa các bản xuất, mà đọc theo thứ tự thì số vào sai ô và bảng vẫn trông
 * bình thường — kiểu sai tệ nhất, vì không ai phát hiện ra.
 *
 * Tách khỏi server.js để test được mà không phải khởi động cả máy chủ.
 */

const COT_LIVE = {
  'thời gian bắt đầu': 'start', 'start time': 'start', 'bắt đầu': 'start', ngày: 'start',
  'thời gian kết thúc': 'end', 'end time': 'end', 'kết thúc': 'end',
  'thời lượng': 'minutes', duration: 'minutes', 'số phút': 'minutes',
  'lượt xem': 'views', views: 'views', 'tổng lượt xem': 'views', 'total views': 'views',
  'người xem cao nhất': 'peak', 'peak viewers': 'peak', pcu: 'peak',
  'bình luận': 'comments', comments: 'comments',
  thích: 'likes', likes: 'likes',
  'chia sẻ': 'shares', shares: 'shares',
  'người theo dõi mới': 'newFollows', 'new followers': 'newFollows', 'follow mới': 'newFollows',
  'tiêu đề': 'title', title: 'title',
};

const CHU = ['start', 'end', 'title'];

function tach(dong) {
  return (dong.includes('\t') ? dong.split('\t') : dong.split(','))
    .map((s) => s.trim().replace(/^"|"$/g, ''));
}

/**
 * Đọc số từ chuỗi người dùng dán vào, chịu được cả hai lối viết đang lẫn lộn
 * trong công ty: "1.234.567" (Việt) và "1,234,567" (Anh).
 *
 * Không thể xử lý bằng một lệnh replace: Number('1.234.567') ra NaN, mà NaN
 * lặng lẽ thành 0 thì mất trắng số liệu và bảng vẫn trông bình thường.
 *
 * Luật: ký tự phân cách xuất hiện NHIỀU LẦN chắc chắn là dấu nghìn. Xuất hiện
 * đúng một lần thì xét nhóm chữ số sau nó — đúng 3 chữ số là dấu nghìn
 * ("1.234" = 1234), khác 3 là dấu thập phân ("12,5" = 12.5).
 */
function soVN(v) {
  const s = String(v).replace(/[^0-9.,-]/g, '');
  if (!s) return 0;
  const cham = (s.match(/\./g) || []).length;
  const phay = (s.match(/,/g) || []).length;

  let thapPhan = '';
  if (cham && phay) thapPhan = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
  else if (cham === 1 || phay === 1) {
    const d = cham ? '.' : ',';
    if (!/^-?\d+[.,]\d{3}$/.test(s)) thapPhan = d;
  }

  let ra = s;
  if (thapPhan) {
    const i = ra.lastIndexOf(thapPhan);
    ra = ra.slice(0, i).replace(/[.,]/g, '') + '.' + ra.slice(i + 1).replace(/[.,]/g, '');
  } else {
    ra = ra.replace(/[.,]/g, '');
  }
  const n = Number(ra);
  return Number.isFinite(n) ? n : 0;
}

function docBangDan(text) {
  const dong = String(text || '').split(/\r?\n/).filter((d) => d.trim());
  if (dong.length < 2) {
    throw Object.assign(new Error('Cần ít nhất một dòng tiêu đề và một dòng số liệu'), { code: 400 });
  }
  const map = tach(dong[0]).map((h) => COT_LIVE[h.toLowerCase()] || null);
  if (!map.some(Boolean)) {
    throw Object.assign(new Error('Không nhận ra cột nào ở dòng tiêu đề. Cần ít nhất một cột như '
      + '"Thời gian bắt đầu", "Lượt xem", "Bình luận".'), { code: 400 });
  }
  return dong.slice(1).map((d) => {
    const o = {};
    tach(d).forEach((v, i) => {
      const k = map[i];
      if (!k || v === '') return;
      o[k] = CHU.includes(k) ? v : soVN(v);
    });
    return o;
  }).filter((o) => o.start || o.views);
}

module.exports = { COT_LIVE, docBangDan, soVN };
