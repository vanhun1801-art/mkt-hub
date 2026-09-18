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
      /* `n === 0` nghĩa là KHÔNG vẽ hàng thẻ nào, không phải "vẽ mặc định".
       * `n || 4` biến số 0 thành 4 — đúng cái bẫy làm lớp phủ của lớp vỏ vẫn
       * hiện bốn thẻ số đoán mò dù đã xin nó đừng vẽ. */
      if (n === 0) return '';
      return '<div class="kx-man-the">' + lap(n == null ? 4 : n, (i) =>
        '<div class="kx-the">' + KX.chu(rong(i), 'nho') + KX.so('to') + '</div>') + '</div>';
    },

    /** Bảng: mỗi dòng một ô vuông + hai cột chữ + một nút. */
    dong(n) {
      if (n === 0) return '';                  // xem ghi chú ở oSo()
      return '<div class="kx-man-bang">' + lap(n == null ? 6 : n, (i) => '<div class="kx-hang">' +
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
     CHỤP KHUNG XƯƠNG TỪ CHÍNH MÀN THẬT

     Trang Tổng quan khớp được là nhờ NHỚ hình thật của lần trước. Chín app con
     không làm cùng cách đó bằng tay được: mỗi app mấy chục màn, mỗi màn một bố
     cục, khai tay thì vừa không xuể vừa lệch ngay lần sửa giao diện kế tiếp.

     Nên ở đây làm thẳng: sau khi màn thật vẽ xong, đi một vòng qua DOM của nó
     và đúc ra khung xương — GIỮ NGUYÊN thẻ và lớp CSS (nên thẻ vẫn là thẻ, bảng
     vẫn là bảng, cột vẫn đúng cột), chỉ THAY chữ bằng thanh xám và ảnh/ô nhập
     bằng khối xám. Lần mở sau nạp lại đúng khung đó.

     Ba thứ được bảo đảm:
       - khung xương KHÔNG mang chữ nào: mọi text node bị thay bằng thanh xám,
         nên trong localStorage không có tên khách, không có con số nào;
       - không id, không on*, không script — chỉ còn thẻ + lớp + vài thuộc tính
         bố cục, nên nhét lại bằng innerHTML là an toàn;
       - có trần: 900 nút, 25 con lặp cho một khối, 40 KB một màn. Quá trần thì
         cắt bớt, phần thiếu đã có `min-height` của chiều cao thật bù vào.

     Hai thuộc tính trong HTML:
       data-kx-nho="<tên>"  chỗ này vừa HIỆN khung xương vừa được CHỤP lại
       data-kx-xem="<tên>"  chỉ hiện (lớp phủ của Bảng công việc, khung iframe
                            của lớp vỏ) — chụp là việc của chỗ kia
     ============================================================ */
  const KHOA = (t) => 'kx.xuong.' + t;
  const TRAN_NUT = 900;      // số nút tối đa một lần chụp
  const TRAN_CON = 30;       // số con giữ lại trong một khối lặp (bảng, danh sách)
  const TRAN_BYTE = 40000;   // cỡ tối đa một màn
  const SAU = 14;            // độ sâu tối đa

  /* Thẻ giữ nguyên được. Thẻ khác đổi thành div cho khỏi lôi theo hành vi (a
     bấm được, button bấm được, form gửi được…). Bảng thì phải giữ đúng thẻ,
     nếu không cả bảng vỡ thành một cột. */
  const THE_GIU = new Set(['DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'ASIDE', 'MAIN',
    'NAV', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH',
    'P', 'SPAN', 'B', 'STRONG', 'EM', 'SMALL', 'LABEL',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
  const THE_BO = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META', 'BR', 'HR']);
  const THE_KHOI = new Set(['IMG', 'SVG', 'CANVAS', 'VIDEO', 'IFRAME', 'PICTURE', 'OBJECT',
    'INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'PROGRESS', 'METER']);

  /* Chỉ giữ thuộc tính style nào ẢNH HƯỞNG BỐ CỤC. Giữ cả `style` thì lôi theo
     màu nền, màu chữ, ảnh nền — khung xương thành bản sao loè loẹt của màn
     thật. Bỏ sạch thì mất mấy thứ app tự tính bằng JS (bề rộng cột, chiều cao
     biểu đồ) và bố cục lệch hẳn. */
  const STYLE_GIU = /^(width|min-width|max-width|height|min-height|max-height|flex|flex-basis|grid-template-columns|grid-template-rows|grid-column|grid-row|aspect-ratio|order)$/;

  function locStyle(el) {
    const st = el.getAttribute('style');
    if (!st) return '';
    return st.split(';').map((x) => x.trim()).filter((x) => {
      const k = (x.split(':')[0] || '').trim().toLowerCase();
      return k && STYLE_GIU.test(k);
    }).join(';');
  }

  const escAttr = (v) => String(v).replace(/[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /** Một thanh xám thay cho chữ: dài theo chữ thật, cao theo cỡ chữ thật. */
  function thanhChu(el, chuDai, rongToiDa) {
    let cao = 12;
    try { cao = Math.round(parseFloat(getComputedStyle(el).fontSize) * 0.72) || 12; } catch (_) {}
    cao = Math.max(8, Math.min(30, cao));
    const rong = Math.max(24, Math.min(rongToiDa || 240, Math.round(chuDai * cao * 0.58)));
    return '<span class="kx" style="display:inline-block;width:' + rong +
      'px;height:' + cao + 'px;border-radius:5px"></span>';
  }

  function chupEl(el, sau, dem) {
    if (dem.n > TRAN_NUT || dem.byte > TRAN_BYTE) return '';
    const tag = el.tagName;
    if (THE_BO.has(tag) || el.hidden) return '';
    let hien = '';
    try { hien = getComputedStyle(el).display; } catch (_) {}
    if (hien === 'none') return '';

    const r = el.getBoundingClientRect();
    if (r.width < 1 && r.height < 1) return '';
    dem.n++;

    const lop = (el.getAttribute('class') || '').trim();
    const st = locStyle(el);

    /* Ảnh, biểu đồ, ô nhập: một khối xám ĐÚNG CỠ. Giữ đúng cỡ mới là phần quan
       trọng — biểu đồ cao 210px mà vẽ thành một dòng chữ thì cả trang tụt lên. */
    if (THE_KHOI.has(tag)) {
      const h = '<span class="kx" style="display:block;width:' + Math.round(r.width) +
        'px;height:' + Math.round(r.height) + 'px;border-radius:8px' +
        (st ? ';' + st : '') + '"></span>';
      dem.byte += h.length;
      return h;
    }

    const con = [];
    for (const c of el.children) {
      if (con.length >= TRAN_CON) break;
      con.push(c);
    }

    let trong = '';
    if (!con.length) {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t) trong = thanhChu(el, t.length, r.width);
    } else if (sau <= 0) {
      /* Quá sâu thì gộp cả nhánh thành MỘT khối đúng chiều cao: vẫn giữ được
         chỗ, chỉ mất chi tiết bên trong. */
      trong = '<span class="kx" style="display:block;height:' + Math.round(r.height) +
        'px;border-radius:8px"></span>';
    } else {
      for (const c of con) trong += chupEl(c, sau - 1, dem);
      /* Chữ nằm lẫn giữa các thẻ con (VD "<b>5</b> việc") cũng phải có chỗ. */
      for (const nut of el.childNodes) {
        if (nut.nodeType !== 3) continue;
        const t = (nut.nodeValue || '').replace(/\s+/g, ' ').trim();
        if (t) trong += thanhChu(el, t.length, r.width);
      }
    }

    const the = THE_GIU.has(tag) ? tag.toLowerCase() : 'div';
    const h = '<' + the + (lop ? ' class="' + escAttr(lop) + '"' : '') +
      (st ? ' style="' + escAttr(st) + '"' : '') + '>' + trong + '</' + the + '>';
    dem.byte += h.length;
    return h;
  }

  /** Chụp khung xương của một phần tử đã vẽ xong. '' nếu không chụp được gì. */
  function chup(el) {
    const dem = { n: 0, byte: 0 };
    let h = '';
    for (const c of el.children) h += chupEl(c, SAU, dem);
    return h.length > 120 ? h : '';
  }

  function docXuong(ten) {
    try { return JSON.parse(localStorage.getItem(KHOA(ten)) || 'null'); } catch (_) { return null; }
  }
  function ghiXuong(ten, v) {
    try { localStorage.setItem(KHOA(ten), JSON.stringify(v)); } catch (_) {
      /* Hết chỗ (localStorage ~5MB): bỏ bản của chính màn này rồi thôi. Không
         để app vỡ chỉ vì một cái khung xương. */
      try { localStorage.removeItem(KHOA(ten)); } catch (_2) {}
    }
  }

  /** Bản đã nhớ còn dùng được không — cửa sổ đổi bề ngang nhiều thì bố cục khác. */
  function conDung(v) {
    return !!(v && v.html && Math.abs((v.w || 0) - window.innerWidth) < 140);
  }

  /** Đổ khung xương đã nhớ vào một chỗ. */
  function hien(el, ten) {
    const v = docXuong(ten);
    if (!conDung(v)) return false;
    el.innerHTML = '<div class="kx-chup kx-vung">' + v.html + '</div>';
    if (!v.cao) return true;
    /* Chừa chỗ, nhưng ĐỪNG chừa quá tay. Bảng quỹ chi phí cao 10.155px trong
     * khi khung xương chỉ dựng 30 dòng đầu — đặt thẳng min-height 10.155px là
     * dưới khung xương hở ra tám nghìn pixel trắng trơn, còn tệ hơn cái đang đi
     * sửa. Lấy số nhỏ hơn giữa "chiều cao thật" và "chiều cao khung xương +
     * 15%": màn ngắn thì chừa đúng, màn dài thì chỉ chừa tới chỗ mắt nhìn tới. */
    const tuNhien = el.getBoundingClientRect().height;
    el.style.minHeight = Math.min(v.cao, Math.round(tuNhien * 1.15)) + 'px';
    return true;
  }

  const hienRo = (e) => {
    if (!e || e.hidden) return false;
    try { return getComputedStyle(e).display !== 'none'; } catch (_) { return true; }
  };

  /* Còn lớp phủ nào đang che thì màn bên dưới CHƯA phải màn thật — Bảng công
   * việc dựng sẵn khung bảng trong HTML rồi mới đổ dữ liệu vào, chụp lúc đó là
   * nhớ một cái bảng rỗng. */
  const dangCho = () => [...document.querySelectorAll('[data-kx-xem]')].some(hienRo);

  const hangCho = [];   // các hàm chụp đang chờ lớp phủ biến đi

  /** Chụp lại mỗi khi màn thật vừa vẽ xong. */
  /* Đã có cú bấm nào trong app này chưa.
   *
   * Chụp phải DỪNG ở cú bấm đầu tiên. Bộ rình DOM bắn mỗi lần nội dung đổi, mà
   * chuyển tab trong app cũng là đổi nội dung — nên bản chụp bị ghi đè bằng
   * hình của tab đang xem. Lần mở sau app luôn mở ở tab MẶC ĐỊNH, thành ra
   * khung xương mang hình một tab khác hẳn: anh Hùng gặp đúng cảnh đó ở Quản
   * lý quảng cáo và Social.
   *
   * Trước cú bấm đầu tiên thì mọi thứ vẽ ra đều là màn app TỰ MỞ — đúng thứ
   * cần nhớ. Sau đó là do người dùng đi lại, không chụp nữa. */
  let daBam = false;
  ['pointerdown', 'keydown', 'touchstart'].forEach((e) =>
    document.addEventListener(e, () => { daBam = true; }, { capture: true, passive: true }));

  function theoDoi(el, ten) {
    let hen = 0;
    const chupLai = () => {
      if (daBam) return;                        // người dùng đã đi chỗ khác
      if (el.querySelector('.kx')) return;      // vẫn đang là khung xương
      if (dangCho()) return;                    // còn lớp phủ -> chưa xong
      clearTimeout(hen);
      /* Chờ một nhịp: màn thật hay vẽ làm nhiều lượt (bảng xong rồi mới tới
         biểu đồ), chụp ở lượt đầu là nhớ một cái màn dựng dở. */
      hen = setTimeout(() => {
        el.style.minHeight = '';
        const cao = Math.round(el.getBoundingClientRect().height);
        if (cao < 80) return;
        const html = chup(el);
        if (html) ghiXuong(ten, { html, cao, w: window.innerWidth });
      }, 500);
    };
    new MutationObserver(chupLai).observe(el, { childList: true, subtree: true });
    hangCho.push(chupLai);
    chupLai();
  }

  function gan() {
    /* Ba vai, cố ý tách ra:
         data-kx-xem  chỉ HIỆN — lớp phủ toàn màn (Bảng công việc). KHÔNG chụp,
                      vì thứ nó che mới là màn thật.
         data-kx-nho  vừa hiện vừa chụp — chỗ app tự thay sạch nội dung.
         data-kx-chup chỉ CHỤP — chỗ app dựng sẵn khung trong HTML rồi đổ dữ
                      liệu vào từng mảnh; đổ khung xương vào đó là xoá mất mấy
                      thẻ mà JS của app đang giữ tham chiếu. */
    document.querySelectorAll('[data-kx-xem]').forEach((el) => {
      hien(el, el.getAttribute('data-kx-xem'));
      /* Lớp phủ tắt bằng cách đổi lớp CSS, không phải bằng đổi nội dung — nên
         phải rình thuộc tính, nếu không chẳng bao giờ tới lượt chụp. */
      new MutationObserver(() => {
        if (!dangCho()) hangCho.forEach((f) => f());
      }).observe(el, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    });
    document.querySelectorAll('[data-kx-nho]').forEach((el) => {
      const ten = el.getAttribute('data-kx-nho');
      hien(el, ten);
      theoDoi(el, ten);
    });
    document.querySelectorAll('[data-kx-chup]').forEach((el) => {
      theoDoi(el, el.getAttribute('data-kx-chup'));
    });
  }

  /* Cho lớp vỏ dùng lại: khung iframe của nó hiện khung xương của chính app sắp
     mở. Lớp vỏ và chín app con chạy chung MỘT origin (app con đi qua proxy
     /m/<id>/), nên localStorage là chung — lớp vỏ đọc được bản mà app con chụp. */
  KX.lay = docXuong;
  KX.conDung = conDung;
  KX.chup = chup;
  KX.hien = hien;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', gan);
  } else {
    gan();
  }
})(window);
