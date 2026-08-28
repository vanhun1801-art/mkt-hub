'use strict';
/*
 * BỘ LỌC THỜI GIAN CỦA NHÂN SỰ — một danh sách duy nhất cho cả bốn app.
 *
 * Nhân sự chỉ cần nhìn quanh hôm nay: không có "tháng trước", không có khoảng tuỳ
 * chọn, không có "toàn bộ". Bảy lựa chọn dưới đây là tất cả những gì họ thấy, ở
 * lớp vỏ và trong cả ba app con.
 *
 * Lớp vỏ nạp file này; shim của proxy chèn nó vào từng app con (cùng origin) —
 * nên sửa danh sách chỉ sửa một chỗ, không phải mở bốn app.
 *
 * Mỗi mục trả về khoảng ngày thật (tu/den dạng YYYY-MM-DD) để mọi base hiểu giống
 * nhau: Bảng công việc lọc theo deadline, Lịch tác nghiệp theo ngày bắt đầu, Quảng
 * cáo theo ngày chi tiêu — cùng một khoảng.
 */
(function () {
  if (window.HUB_LOC) return;

  const p2 = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  const dau = () => { const x = new Date(); x.setHours(0, 0, 0, 0); return x; };
  const cong = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  /** Thứ 2 của tuần chứa ngày d (tuần bắt đầu Thứ 2). */
  const thuHai = (d) => cong(d, -((d.getDay() + 6) % 7));
  const thang = (lech) => {
    const t = dau();
    const a = new Date(t.getFullYear(), t.getMonth() + lech, 1);
    return { tu: iso(a), den: iso(new Date(a.getFullYear(), a.getMonth() + 1, 0)) };
  };
  const tuan = (lech) => {
    const s = cong(thuHai(dau()), lech * 7);
    return { tu: iso(s), den: iso(cong(s, 6)) };
  };
  const ngay = (lech) => { const d = cong(dau(), lech); return { tu: iso(d), den: iso(d) }; };

  const nam = (lech) => {
    const t = dau();
    return { tu: iso(new Date(t.getFullYear() + lech, 0, 1)),
             den: iso(new Date(t.getFullYear() + lech, 11, 31)) };
  };

  /* Mốc chuẩn của QUẢN LÝ — dùng cho mọi bộ lọc thời gian của quản lý, ở lớp vỏ
   * và trong cả ba app con. Khoảng tuỳ chỉnh nằm riêng ở thanh lọc lớp vỏ (có hai
   * ô ngày), app con đi theo qua "Bộ lọc chung". */
  const MUC_QL = [
    { k: 'thang', ten: 'Tháng này', khoang: () => thang(0) },
    { k: 'thang-truoc', ten: 'Tháng trước', khoang: () => thang(-1) },
    { k: 'thang-sau', ten: 'Tháng tiếp theo', khoang: () => thang(1) },
    { k: 'tuan', ten: 'Tuần này', khoang: () => tuan(0) },
    { k: 'tuan-truoc', ten: 'Tuần trước', khoang: () => tuan(-1) },
    { k: 'nam', ten: 'Năm nay', khoang: () => nam(0) },
  ];

  /* Mốc của NHÂN SỰ — hẹp hơn, chỉ quanh hôm nay. Thứ tự: quá khứ gần nhất trước. */
  const MUC = [
    { k: 'hom-qua', ten: 'Hôm qua', khoang: () => ngay(-1) },
    { k: 'hom-nay', ten: 'Hôm nay', khoang: () => ngay(0) },
    { k: 'ngay-mai', ten: 'Ngày mai', khoang: () => ngay(1) },
    { k: 'tuan', ten: 'Tuần này', khoang: () => tuan(0) },
    { k: 'tuan-sau', ten: 'Tuần tới', khoang: () => tuan(1) },
    { k: 'thang', ten: 'Tháng này', khoang: () => thang(0) },
    { k: 'thang-sau', ten: 'Tháng tiếp theo', khoang: () => thang(1) },
  ];

  const ra = (ds) => ds.map((m) => Object.assign({ k: m.k, ten: m.ten }, m.khoang()));

  /** Danh sách cho nhân sự: [{ k, ten, tu, den }] — khoảng tính theo hôm nay. */
  const danhSach = () => ra(MUC);
  /** Danh sách cho quản lý. */
  const danhSachQL = () => ra(MUC_QL);
  /** Danh sách theo vai — app con chỉ cần gọi cái này. */
  const danhSachTheoVai = (quanLy) => (quanLy ? danhSachQL() : danhSach());

  /** Khoảng của một mã, hoặc null nếu không có mã đó (tìm cả hai danh sách). */
  function khoangCua(k) {
    const m = MUC_QL.find((x) => x.k === k) || MUC.find((x) => x.k === k);
    return m ? m.khoang() : null;
  }

  /** Mã khớp với một khoảng đang áp (để biết nút nào đang sáng). */
  function macCuaKhoang(tu, den) {
    if (!tu || !den) return '';
    const m = [...danhSachQL(), ...danhSach()].find((x) => x.tu === tu && x.den === den);
    return m ? m.k : '';
  }

  window.HUB_LOC = {
    danhSach, danhSachQL, danhSachTheoVai, khoangCua, macCuaKhoang, MAC_DINH: 'thang',
  };

  /* ============================================================
     DÃY NÚT CHỌN MỐC — một cách thể hiện duy nhất cho cả bốn app
     ------------------------------------------------------------
     Ô <select> gọn nhưng phải bấm hai lần mới thấy có gì; dãy nút thì thấy hết
     lựa chọn và chọn một nhát. Thay vì viết lại từng app, hàm dưới đây "khoác áo"
     cho một <select> có sẵn: ẩn nó đi, dựng dãy nút bên cạnh, bấm nút thì gán
     value rồi phát sự kiện change — mọi xử lý cũ của app giữ nguyên.
     ============================================================ */
  const CSS_SEG = '.hub-seg{display:inline-flex;flex-wrap:wrap;border:1px solid var(--hub-seg-vien,#e3e8f0);' +
    'border-radius:8px;overflow:hidden;background:var(--hub-seg-nen,#fff);vertical-align:middle}' +
    '.hub-seg button{border:0;background:transparent;padding:6px 11px;cursor:pointer;font:inherit;' +
    'font-size:13px;color:var(--hub-seg-chu,#5b6779);border-right:1px solid var(--hub-seg-vien,#e3e8f0);' +
    'white-space:nowrap}' +
    '.hub-seg button:last-child{border-right:0}' +
    '.hub-seg button:hover{background:var(--hub-seg-hover,#f2f5fa);color:var(--hub-seg-chu-dam,#1a2233)}' +
    '.hub-seg button.on{background:var(--hub-seg-chon,#2b5cff);color:#fff;font-weight:600}' +
    '@media (prefers-color-scheme:dark){:root:not([data-theme="sang"]) .hub-seg{' +
    '--hub-seg-vien:#2c3444;--hub-seg-nen:#1a1f2b;--hub-seg-chu:#a3adbf;--hub-seg-chu-dam:#e4e8f1;' +
    '--hub-seg-hover:#232a39;--hub-seg-chon:#3d6dff}}' +
    ':root[data-theme="toi"] .hub-seg{--hub-seg-vien:#2c3444;--hub-seg-nen:#1a1f2b;--hub-seg-chu:#a3adbf;' +
    '--hub-seg-chu-dam:#e4e8f1;--hub-seg-hover:#232a39;--hub-seg-chon:#3d6dff}';

  function chenCss() {
    if (document.getElementById('hub-seg-css')) return;
    const st = document.createElement('style');
    st.id = 'hub-seg-css';
    st.textContent = CSS_SEG;
    (document.head || document.documentElement).appendChild(st);
  }

  /** Khoác dãy nút cho một <select>. Gọi lại nhiều lần cũng không sao. */
  function segChoSelect(sel) {
    if (!sel || sel.tagName !== 'SELECT') return;
    chenCss();
    let box = sel.nextElementSibling;
    if (!box || !box.classList || !box.classList.contains('hub-seg')) {
      box = document.createElement('div');
      box.className = 'hub-seg';
      sel.insertAdjacentElement('afterend', box);
      sel.setAttribute('hidden', 'hidden');
      sel.addEventListener('change', () => ve());
      box.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-v]');
        if (!b) return;
        sel.value = b.getAttribute('data-v');
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        ve();
      });
    }
    function ve() {
      box.innerHTML = [...sel.options].map((o) =>
        '<button type="button" data-v="' + String(o.value).replace(/"/g, '&quot;') + '"' +
        (o.value === sel.value ? ' class="on"' : '') + '>' +
        String(o.textContent).replace(/[<>&]/g, '') + '</button>').join('');
    }
    ve();
  }

  window.HUB_SEG = segChoSelect;
})();
