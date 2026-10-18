'use strict';
/**
 * LƯỚI ĐẶT MỤC TIÊU — gom theo nhóm công việc hoặc theo kênh.
 *
 * Anh Hùng 18/10/2026: *"giao diện đặt mục tiêu cho anh một giao diện thông
 * minh hơn, theo nhóm công việc hay kênh rõ ràng"*.
 *
 * Bản trước là 16 thẻ rời xếp dọc, mỗi thẻ một kênh, mỗi thẻ một bảng ba dòng.
 * Nhìn thì gọn nhưng làm việc thì không: muốn so mục tiêu lượt xem giữa các
 * kênh TikTok phải cuộn qua bốn thẻ nằm cách nhau bởi các thẻ Facebook; muốn
 * biết tỷ trọng của một kênh đã đủ 100% chưa thì phải tự cộng trong đầu.
 *
 * Ở đây: một bảng cho mỗi nhóm, kênh đứng gom thành cụm, và tổng tỷ trọng của
 * từng kênh được cộng sẵn kèm cảnh báo — vì bộ luật CHẶN khi tổng khác 100%,
 * mà chặn ở lúc bấm Lưu thì người ta đã gõ xong cả màn rồi mới biết.
 */

/* Tên nhóm công việc, suy từ `loai` của nhóm kênh. Không đoán bằng tên kênh:
 * "Chung" có cả thiết kế lẫn bán hàng, hai việc khác hẳn nhau. */
const TEN_NHOM_VIEC = {
  'bài viết': 'Nội dung mạng xã hội',
  'bai viet': 'Nội dung mạng xã hội',
  live: 'Livestream',
  chung: 'Việc khác',
};
const TEN_NEN = {
  fb: 'Facebook', facebook: 'Facebook', tiktok: 'TikTok',
  insta: 'Instagram', instagram: 'Instagram', zalooa: 'Zalo OA', zalo: 'Zalo OA',
};

const khongDau = (s) => String(s || '').normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').trim().toLowerCase();

/**
 * Dựng lưới mục tiêu vào `hop`.
 * @param luat   bộ luật của tháng
 * @param gom    'viec' | 'kenh'
 * @param layO   (khoa, loai, macDinh) -> giá trị đang hiển thị
 */
function dungLuoiMucTieu(hop, luat, gom, layO) {
  hop.innerHTML = '';

  const nhom = (luat.nhom || []).map((n) => ({
    n,
    khoa: [n.kenh, n.tenKenh, n.loai].join('|'),
    tenKenh: [n.kenh, n.tenKenh].filter(Boolean).join(' · '),
    tenDay: [n.kenh, n.tenKenh, n.loai].filter(Boolean).join(' · '),
    nhomViec: TEN_NHOM_VIEC[khongDau(n.loai)] || 'Việc khác',
    nen: TEN_NEN[khongDau(n.kenh)] || (n.kenh || 'Khác'),
  }));

  const theo = new Map();
  nhom.forEach((x) => {
    const k = gom === 'kenh' ? x.nen : x.nhomViec;
    if (!theo.has(k)) theo.set(k, []);
    theo.get(k).push(x);
  });

  /* Nhóm đông kênh lên trước — đó là nơi phần lớn mục tiêu nằm. */
  [...theo.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([ten, ds]) => {
    hop.appendChild(theNhomMucTieu(ten, ds, layO));
  });
}

function theNhomMucTieu(tenNhom, ds, layO) {
  const d = el('details', 'the nhom-mt');
  d.open = true;
  const soChiSo = ds.reduce((s, x) => s + (x.n.tieuChi || []).length, 0);
  d.appendChild(el('summary', '', '<span class="mt-ten">' + esc(tenNhom) + '</span>'
    + '<span class="phu">' + ds.length + ' kênh · ' + soChiSo + ' chỉ số</span>'));

  const t = el('table', 'bang-mt');
  t.innerHTML = '<thead><tr><th>Kênh</th><th>Chỉ số</th><th class="so">Đang có</th>'
    + '<th class="so">Mục tiêu tháng</th><th class="so">Tỷ trọng</th>'
    + '<th class="so">% đạt</th></tr></thead>';
  const tb = el('tbody');

  ds.forEach((x) => {
    const tc = x.n.tieuChi || [];
    const dnNhom = (DATA.nhom || []).find((y) => y.khoa === x.khoa) || { tieuChi: [] };
    const tongTy = tc.reduce((s, c) => {
      const v = layO('tyTrong', x.khoa + '#' + c.ma, c.tyTrong);
      return s + (Number.isFinite(v) ? v : 0);
    }, 0);
    const lech = Math.abs(tongTy - 1) > 0.005;

    tc.forEach((c, i) => {
      const k = x.khoa + '#' + c.ma;
      const dn = dnNhom.tieuChi.find((y) => y.ma === c.ma);
      const mt = layO('mucTieu', k, c.mucTieu);
      const dat = dn && !dn.boQua && mt > 0 ? dn.ketQua / mt : null;
      const tr = el('tr', i === 0 ? 'dau-kenh' : '');
      tr.dataset.kenh = x.khoa;
      tr.innerHTML =
        /* Tên kênh in một lần cho cả cụm. Lặp lại ở mọi dòng thì mắt phải lọc
         * chữ trùng mới thấy được ranh giới giữa hai kênh. */
        '<td class="mt-kenh">' + (i === 0
          ? '<b>' + esc(x.tenKenh) + '</b><span class="sub-line">' + esc(x.n.loai || '') + '</span>'
          : '') + '</td>'
        /* Chỉ số thấp-là-tốt phải nói ra ngay cạnh tên, không để ở chú thích
         * cuối bảng: người đặt mục tiêu CPA mà tưởng cao là tốt thì đặt ngược
         * cả con số, và bảng vẫn trông hợp lý. */
        + '<td>' + esc(c.ten)
        + (c.dao ? ' <span class="nhan-o im" title="Đạt thấp hơn mục tiêu là tốt">thấp là tốt</span>' : '')
        + '</td>'
        + '<td class="so mo">' + (dn
          ? (dn.boQua ? '<span class="nhan-o im">chưa đo</span>' : gon(dn.ketQua))
          : '—') + '</td>'
        + '<td class="so"><input class="so" type="number" step="any" min="0" value="'
        + (mt == null ? '' : mt) + '" data-loai="mucTieu" data-k="' + esc(k) + '"></td>'
        + '<td class="so"><input class="so o-ty" type="number" step="5" min="0" max="100" value="'
        /* Nhập theo PHẦN TRĂM, không theo 0,35. Bộ luật lưu 0..1 nhưng người
         * gõ nghĩ bằng phần trăm, và gõ nhầm 35 vào ô 0..1 thì tỷ trọng thành
         * 3.500% mà không có gì chặn lại. */
        + Math.round((layO('tyTrong', k, c.tyTrong) || 0) * 100) + '" data-loai="tyTrong" data-k="' + esc(k) + '"></td>'
        + '<td class="so">' + (dat == null ? '<span class="nhat">—</span>' : ptLon(dat)) + '</td>';
      tb.appendChild(tr);
    });

    /* Dòng tổng của từng kênh. Bộ luật CHẶN khi tổng tỷ trọng khác 100%, nên
     * phải nói ngay tại chỗ gõ chứ không đợi tới lúc bấm Lưu. */
    const trT = el('tr', 'mt-tong' + (lech ? ' lech' : ''));
    trT.dataset.tong = x.khoa;
    trT.innerHTML = '<td></td><td class="nhat">Tổng tỷ trọng của kênh</td><td></td><td></td>'
      + '<td class="so"><b>' + Math.round(tongTy * 100) + '%</b></td>'
      + '<td class="so">' + (lech
        ? '<span class="nhan-o chan">phải đủ 100%</span>'
        : '<span class="nhan-o ok">đủ</span>') + '</td>';
    tb.appendChild(trT);
  });

  t.appendChild(tb);
  d.appendChild(el('div', 'bang-cuon')).appendChild(t);
  return d;
}

/** Tính lại dòng tổng của một kênh sau mỗi lần gõ, không vẽ lại cả bảng. */
function tinhLaiTongTy(hop, khoa) {
  const o = [...hop.querySelectorAll('input.o-ty[data-k]')]
    .filter((i) => i.dataset.k.startsWith(khoa + '#'));
  const tong = o.reduce((s, i) => s + (Number(i.value) || 0), 0) / 100;
  const tr = hop.querySelector('tr.mt-tong[data-tong="' + CSS.escape(khoa) + '"]');
  if (!tr) return;
  const lech = Math.abs(tong - 1) > 0.005;
  tr.classList.toggle('lech', lech);
  tr.children[4].innerHTML = '<b>' + Math.round(tong * 100) + '%</b>';
  tr.children[5].innerHTML = lech
    ? '<span class="nhan-o chan">phải đủ 100%</span>'
    : '<span class="nhan-o ok">đủ</span>';
}
