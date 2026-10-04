'use strict';
/**
 * ============================================================================
 * KHÁCH HỎI GÌ — chỗ dễ nhất để một app tự khen mình
 * ============================================================================
 * Khung Buyer Persona hỏi "điểm đau & rào cản". Bộ quét này lấy từ chính lời
 * khách gõ trong Pancake, thay vì hỏi lại sales rồi tin trí nhớ.
 *
 * Lỗi nguy hiểm nhất đã gặp thật (04/10/2026): trả lời TỰ ĐỘNG của page cũng
 * có laAdmin = false. Đếm chúng vào thì app đang đo chính lời quảng cáo của
 * mình và gọi đó là "khách quan tâm". Lần chạy đầu, "Ảnh và quay phim" đứng
 * thứ hai với 25 lượt — lọc đúng xong còn 2. Một app tự khen mình bằng chính
 * nội dung mình phát ra là loại sai tệ nhất, vì nó luôn cho kết quả đẹp.
 */
const h = require('../nguon/hoithoai');

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dk, vi) => {
  if (dk) { pass++; console.log('  ✓ ' + ten); }
  else { fail++; fails.push(ten + (vi ? ' — ' + vi : '')); console.log('  ✗ ' + ten + (vi ? '  ' + vi : '')); }
};

console.log('\nkhách hỏi gì, lo gì');

/* ---- nhận ra câu hỏi ---- */
ok('câu có dấu hỏi', h.laCauHoi('Tour này bao nhiêu tiền?'));
ok('câu hỏi không dấu chấm hỏi', h.laCauHoi('cho em hỏi giá vé phú quốc 3n2đ'));
ok('mẫu "có … không"', h.laCauHoi('Tour này có hỗ trợ chụp ảnh không ạ'));
ok('câu kể KHÔNG bị tính là câu hỏi', h.laCauHoi('Mình đã chuyển khoản rồi nhé') === false,
  'câu kể bị tính thì con số "bao nhiêu câu hỏi" mất nghĩa');

/* ---- chủ đề: một câu chạm nhiều mối lo thì đếm vào cả hai ---- */
{
  const boDau = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
  const cham = (cau) => h.CHU_DE.filter(([, re]) => re.test(boDau(cau))).map(([t]) => t);
  ok('bắt được mối lo về giá', cham('Tour này bao nhiêu tiền ạ').includes('Giá và chi phí phát sinh'));
  ok('bắt được mối lo trẻ em', cham('Bé 5 tuổi đi được không ạ').includes('Trẻ em và người già'));
  ok('bắt được mối lo say sóng', cham('Đi cano có say sóng không em').includes('Say sóng, sức khoẻ'));
  /* Một câu chạm hai mối lo phải vào cả hai — ép vào một ô là mất một nửa. */
  const hai = cham('Cho bé 3 tuổi đi cano có say sóng không ạ');
  ok('câu chạm hai mối lo thì đếm cả hai',
    hai.includes('Trẻ em và người già') && hai.includes('Say sóng, sức khoẻ'), JSON.stringify(hai));
  ok('câu không chạm gì thì không bị gán bừa', cham('Dạ em cảm ơn').length === 0, JSON.stringify(cham('Dạ em cảm ơn')));
}

/* ---- lọc trả lời tự động của page: chỗ quan trọng nhất ---- */
{
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'nguon', 'hoithoai.js'), 'utf8');
  ok('có hàm phân biệt lời khách với lời page', /function laKhachNoi/.test(src));
  ok('không chỉ dựa vào laAdmin', /laKhachNoi\(m, c\)/.test(src) && /tenKhach/.test(src));
  ok('có đường lùi khi không biết tên khách', /\^\(ttm_\|fb_\|ig_\)/.test(src));
  ok('ví dụ câu nói được khử trùng', /boDau\(x\.cau\) === boDau\(cau\)/.test(src));
  ok('lấy mẫu TRẢI ĐỀU, không lấy đầu danh sách', /i % buoc === 0/.test(src));
}

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' pass · ' + fail + ' fail\x1b[0m');
if (fail) console.log(fails.map((x) => ' - ' + x).join('\n'));
process.exit(fail ? 1 : 0);
