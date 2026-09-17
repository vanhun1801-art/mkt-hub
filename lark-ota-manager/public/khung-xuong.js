'use strict';
/* ============================================================
   KHUNG XƯƠNG — bộ dựng HTML dùng chung cho CẢ HỆ

   Đi kèm khung-xuong.css. Ở đây chỉ có hàm ghép chuỗi: mỗi hàm trả về khung
   xương của MỘT thành phần thật trên trang, dựng bằng CHÍNH lớp bố cục của
   thành phần đó (.luoi-base, .the-luoi, .viec-dong, .tn-hang…). Nhờ vậy lúc dữ
   liệu thật thay vào, không ô nào xê dịch một pixel.

   HAI NHÓM HÀM, đừng lẫn:
     - nhóm CHUNG (o, chu, so, nut, oSo, dong, bang, log, man): chỉ dùng lớp
       `kx-*` của riêng khung xương, nên app nào cũng gọi được;
     - nhóm RIÊNG CỦA LỚP VỎ (the, khoiBase, luoiBase, viec, tai, rail, tin):
       mượn lớp bố cục của trang Tổng quan (.luoi-base, .the-luoi, .tn-hang…).
       App con ĐỪNG gọi mấy hàm này — `.the` bên Báo cáo là thẻ báo cáo, bên lớp
       vỏ là ô số; gọi nhầm thì ăn nhầm CSS của app.

   Bề rộng dòng chữ lấy theo một vòng số CỐ ĐỊNH, không random: random thì mỗi
   nhịp vẽ lại là một bề rộng khác, khung xương tự nhấp nháy lung tung; mà hai
   lần mở cùng một trang cũng ra hai hình khác nhau — đọc như lỗi.
   ============================================================ */
(function (global) {
  const VONG = [74, 56, 88, 62, 80, 50, 70, 64];
  const rong = (i) => VONG[i % VONG.length] + '%';

  const el = (lop, kieu) =>
    '<span class="kx ' + lop + '"' + (kieu ? ' style="' + kieu + '"' : '') + '></span>';

  /** Lặp `n` lần và nối chuỗi — viết tay `Array.from` ở mười chỗ thì rối. */
  const lap = (n, f) => { let h = ''; for (let i = 0; i < n; i++) h += f(i); return h; };

  const KX = {
    /* ---- mảnh nhỏ ---- */
    chu: (r, lop) => el('kx-chu ' + (lop || ''), 'width:' + (r || '70%')),
    o: (px) => el('kx-o', px ? 'width:' + px + 'px;height:' + px + 'px' : ''),
    so: (lop) => el('kx-so ' + (lop || '')),
    nut: (r) => el('kx-nut', r ? 'width:' + r : ''),

    /* ---- NHÓM CHUNG: chỉ dùng lớp kx-*, mọi app gọi được ---- */

    /** Hàng thẻ số (lưới tự xuống dòng). */
    oSo(n) {
      return '<div class="kx-man-the">' + lap(n || 4, (i) =>
        '<div class="kx-the">' + KX.chu(rong(i), 'nho') + KX.so('to') + '</div>') + '</div>';
    },

    /** Bảng: mỗi dòng một ô vuông + hai cột chữ + một nút. */
    dong(n) {
      return '<div class="kx-man-bang">' + lap(n || 6, (i) => '<div class="kx-hang">' +
        el('kx-o', 'width:22px;height:22px') +
        '<span style="flex:2;min-width:0">' + KX.chu(rong(i)) + '</span>' +
        '<span style="flex:1;min-width:0">' + KX.chu(rong(i + 2), 'nho') + '</span>' +
        KX.nut('60px') + '</div>') + '</div>';
    },

    /** Mấy dòng chữ trần — cho hộp log, ô cấu hình, đoạn mô tả đang đọc. */
    log(n) {
      return '<div class="kx-vung" aria-busy="true">' + lap(n || 4, (i) =>
        '<div style="padding:5px 0">' + KX.chu(rong(i), 'nho') + '</div>') + '</div>';
    },

    /** n cột, mỗi cột một tiêu đề + m thẻ (màn "Cần xử lý" của Bảng công việc). */
    cot(n, m) {
      return '<div class="kx-nhieu-cot" style="--kx-n:' + (n || 3) + '">' +
        lap(n || 3, (c) => '<div>' + KX.chu(rong(c), 'to') +
          lap(m || 3, (i) => '<div class="kx-khoi">' + KX.chu(rong(i + c)) +
            '<div class="kx-hang" style="gap:6px">' + el('kx-nut', 'width:52px;height:18px') +
            el('kx-nut', 'width:66px;height:18px') + '</div></div>') +
          '</div>') + '</div>';
    },

    /** Lưới ô số nhỏ và dày — màn KPI có mười mấy ô như vậy trên một khối. */
    luoiNho(n) {
      return '<div class="kx-luoi-nho">' + lap(n || 12, (i) =>
        '<div class="kx-the">' + KX.chu(rong(i), 'nho') + KX.so() +
        '<div style="margin-top:6px">' + KX.chu('52%', 'nho') + '</div></div>') + '</div>';
    },

    /** Một khối liền: form, biểu đồ, lịch. `cao` là chiều cao của mảng liền đó. */
    khoi(cao, dong) {
      return '<div class="kx-khoi">' + KX.chu('32%', 'to') +
        lap(dong || 0, (i) => KX.chu(rong(i))) +
        (cao ? el('', 'height:' + cao + 'px;border-radius:10px') : '') + '</div>';
    },

    /** Hai cột 2:1 — form bên trái, danh sách bên phải (màn Chỉnh ảnh). */
    hai(trai, phai) {
      return '<div class="kx-2cot"><div>' + trai + '</div><div>' + phai + '</div></div>';
    },

    /* ---- ô số trong một base (.the-luoi > .the) — RIÊNG LỚP VỎ ----
       Thẻ base THẬT không phải một lưới ô đều nhau: nó có MỘT ô chính rộng hết
       hàng với con số 30px, rồi mới tới mấy ô phụ nhỏ, và dưới cùng thường là
       dòng "Không có: …". Vẽ đều nhau là khung xương không khớp giao diện thật —
       lúc số về, cả thẻ nhảy một nhịp.

       `h` là HÌNH của base đó ở lần mở trước (lớp vỏ nhớ ở localStorage):
         { o: số ô, chinh: có ô chính không, khong: có dòng "Không có" không } */
    theTheo(h) {
      const hinh = h || {};
      const soO = Math.max(1, Math.min(12, hinh.o || 5));
      const coChinh = hinh.chinh !== false;
      const soPhu = Math.max(0, soO - (coChinh ? 1 : 0));
      /* Dùng CHÍNH lớp .nhan/.so của ô thật: hai lớp đó mới là thứ đặt ô chính
         vào đúng ô lưới (xem `.the.chinh .nhan` trong styles.css). */
      const oChinh = '<div class="the chinh">' +
        el('nhan kx-chu nho', 'width:44%') +
        el('so kx-so to') + '</div>';
      const oPhu = (i) => '<div class="the phu kx-the">' +
        el('nhan kx-chu nho', 'width:' + rong(i)) +
        el('so kx-so nho') + '</div>';
      return '<div class="the-luoi">' + (coChinh ? oChinh : '') +
        lap(soPhu, (i) => oPhu(i)) + '</div>' +
        (hinh.khong ? '<div class="the-khong">' + KX.chu('38%', 'nho') + '</div>' : '');
    },

    /** Bản không có trí nhớ: hình trung bình của một thẻ base. */
    the(n) {
      return KX.theTheo({ o: n || 5, chinh: true, khong: true });
    },

    /* ---- đầu khối: ô icon + tên + dòng phụ ----
       Có `ten` thì dùng tên thật (lớp vỏ biết tên base từ /api/hub, tức là
       TRƯỚC khi có số liệu) — chờ mà vẫn đọc được mình đang chờ cái gì. */
    dauKhoi(ten) {
      return '<div class="khoi-head">' + el('kx-o') +
        '<div style="flex:1 1 auto;min-width:0">' +
        (ten ? '<h2>' + ten + '</h2>' : KX.chu('42%', 'to')) +
        '<div style="margin-top:5px">' + KX.chu('26%', 'nho') + '</div></div>' +
        '<span class="grow"></span>' + KX.nut('64px') + '</div>';
    },

    /** Một khối base (.nhom-base): đầu khối + lưới ô số. */
    khoiBase(ten, soO) {
      return '<section class="nhom-base kx-vung" aria-busy="true">' +
        KX.dauKhoi(ten) + KX.the(soO || 6) + '</section>';
    },

    /** Cả lưới base. `ds` là mảng tên thật (có thể rỗng -> `n` khối trống). */
    luoiBase(n, ds) {
      const ten = ds || [];
      const soKhoi = ten.length || n || 6;
      return '<div class="luoi-base">' +
        lap(soKhoi, (i) => KX.khoiBase(ten[i] || '', 6)) + '</div>';
    },

    /* ---- danh sách việc cần xử lý ---- */
    viec(n) {
      return lap(n || 5, (i) => '<div class="viec-dong kx-vung">' +
        el('kx-tron', 'width:8px;height:8px;margin-top:5px') +
        '<div class="noi"><div>' + KX.chu(rong(i)) + '</div>' +
        '<div style="margin-top:6px">' + KX.chu(rong(i + 3), 'nho') + '</div></div>' +
        KX.nut('82px') + '</div>');
    },

    /* ---- dải nhiệt tải nhân sự (.tn-hang) ----
       Số cột bằng đúng số ngày sắp hiện, nên lúc dữ liệu về dải không co lại. */
    tai(hang, cot) {
      const h = hang || 6, c = cot || 30;
      return '<div class="tai-nhiet kx-vung" aria-busy="true">' +
        lap(h, () => '<div class="tn-hang">' +
          '<div class="tn-ten">' + KX.chu('80%') + '</div>' +
          '<div class="tn-dai">' + lap(c, () => el('tn-o', 'flex:1 1 0')) + '</div>' +
          '<div class="tn-tong">' + KX.chu('60%') + '</div></div>') +
        '</div>';
    },

    /* ---- panel base bên trái ---- */
    rail(n) {
      return '<div class="kx-vung" aria-busy="true" aria-label="Đang nạp danh sách base">' +
        lap(n || 7, (i) => '<div class="rail-item">' + el('kx-o') +
          '<span class="ri-tx">' + KX.chu(rong(i)) + '</span></div>') +
        '</div>';
    },

    /* ---- bảng trong hộp thoại (Kiểm tra, Phân quyền, danh sách nhanh) ---- */
    bang(hang, cot) {
      const c = cot || 3;
      return '<div class="kx-vung" aria-busy="true">' +
        lap(hang || 5, (i) => '<div class="kx-hang" style="padding:10px 2px">' +
          lap(c, (j) => '<span style="flex:' + (j === 0 ? 2 : 1) +
            ';min-width:0">' + KX.chu(rong(i + j)) + '</span>') +
          '</div>') +
        '</div>';
    },

    /* ---- video giới thiệu + bảng tin (.khoi-tin) ----
       CHỈ dựng khi lần mở trước có khối này (lớp vỏ nhớ ở localStorage). Không
       nhớ mà cứ dựng thì phòng nào chưa đăng tin sẽ thấy một khối xám to hiện
       lên rồi biến mất — hứa một thứ không có, tệ hơn là không hứa gì. */
    tin(coPhim) {
      return '<section class="khoi khoi-tin kx-vung" aria-busy="true">' +
        '<div class="tin-luoi' + (coPhim ? '' : ' khong-phim') + '">' +
        (coPhim ? '<div class="tin-phim">' + el('kx-anh', 'border-radius:0') + '</div>' : '') +
        '<div class="tin-cot"><div class="tin-cot-dau">' + KX.chu('120px', 'to') + '</div>' +
        '<div class="tin-ds">' + lap(3, (i) =>
          '<div style="padding:10px 16px;border-bottom:1px solid var(--vien-mem)">' +
          '<div class="kx-hang" style="gap:8px">' + el('kx-chu nho', 'width:54px') +
          '<span class="grow"></span>' + el('kx-chu nho', 'width:38px') + '</div>' +
          '<div style="margin-top:7px">' + KX.chu(rong(i)) + '</div>' +
          '<div style="margin-top:6px">' + KX.chu(rong(i + 4), 'nho') + '</div></div>') +
        '</div></div></div></section>';
    },

    /* ---- màn chờ khi mở một app con ----
       Chín app con đều mở ra bằng: thanh tiêu đề -> hàng thẻ số -> bảng. Vẽ sẵn
       đúng ba tầng đó nên lúc iframe hiện lên, mắt không phải dựng lại bố cục.
       `ten` là tên app, giữ lại để biết đang mở cái gì. */
    man(ten, opt) {
      const o = opt || {};
      const dau = o.dau === false ? '' :
        '<div class="kx-man-dau">' + el('kx-o', 'width:34px;height:34px') +
        '<span style="flex:1;min-width:0">' + KX.chu('220px', 'to') + '</span>' +
        KX.nut('92px') + KX.nut('72px') + '</div>';
      return '<div class="kx-man kx-vung" aria-busy="true"' +
        (ten ? ' aria-label="Đang mở ' + ten + '"' : '') + '>' +
        dau + KX.oSo(o.the == null ? 4 : o.the) + KX.dong(o.dong == null ? 6 : o.dong) +
        '</div>';
    },
  };

  global.KX = KX;

  /* ============================================================
     TRÍ NHỚ CHIỀU CAO — cho app con, không phải viết thêm dòng JS nào

     Hình dạng thì đoán được (mấy thẻ, mấy dòng), nhưng CHIỀU CAO thật thì
     không: dòng bảng có dòng hai tầng, thẻ có ghi chú, có cái không. Nên phần
     tử nào gắn `data-kx-cao="<tên>"` sẽ được:
       1. chừa sẵn đúng chiều cao của lần mở trước;
       2. đo lại chiều cao THẬT ngay khi nội dung thật thay vào chỗ đó.

     Nhờ vậy khung xương của app con cũng không làm trang nhảy, mà mỗi app chỉ
     phải thêm đúng một thuộc tính trong HTML.
     ============================================================ */
  const KHOA = (t) => 'kx.cao.' + t;

  function docCao(ten) {
    try { return JSON.parse(localStorage.getItem(KHOA(ten)) || 'null'); } catch (_) { return null; }
  }
  function ghiCao(ten, v) {
    try { localStorage.setItem(KHOA(ten), JSON.stringify(v)); } catch (_) {}
  }

  function ganCao() {
    document.querySelectorAll('[data-kx-cao]').forEach((el) => {
      const ten = el.getAttribute('data-kx-cao');
      const cu = docCao(ten);
      /* Số cột đổi theo bề ngang cửa sổ, nên chiều cao đo ở màn rộng đem áp cho
         màn hẹp còn sai hơn là không áp. */
      if (cu && cu.cao && Math.abs((cu.w || 0) - window.innerWidth) < 140) {
        el.style.minHeight = cu.cao + 'px';
      }
      let hen = 0;
      const mo = new MutationObserver(() => {
        if (el.querySelector('.kx')) return;      // vẫn đang là khung xương
        clearTimeout(hen);
        /* Chờ một nhịp rồi mới đo: nội dung thật hay vẽ làm nhiều lượt (bảng
           xong rồi mới tới biểu đồ), đo ở lượt đầu là nhớ một chiều cao hụt. */
        hen = setTimeout(() => {
          el.style.minHeight = '';
          const cao = Math.round(el.getBoundingClientRect().height);
          if (cao > 80) ghiCao(ten, { cao, w: window.innerWidth });
          mo.disconnect();
        }, 400);
      });
      mo.observe(el, { childList: true, subtree: true });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ganCao);
  } else {
    ganCao();
  }
})(window);
