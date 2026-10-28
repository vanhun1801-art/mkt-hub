/**
 * Ô soạn "Chi tiết yêu cầu" (28/10/2026).
 *
 * Anh Hùng: dán bảng từ Excel vào được, Ctrl+B in đậm, Ctrl+I in nghiêng,
 * Ctrl+U gạch chân, mà không bày thanh công cụ định dạng.
 *
 * Cột "Chi tiết" trên Base là chữ thuần, nên định dạng đi kèm dưới dạng dấu
 * kiểu Markdown: **đậm**, *nghiêng*, <u>gạch chân</u>, bảng thì dòng "| a | b |".
 * Mở trên Base vẫn đọc được, và việc cũ (chữ trơn) hiện y như trước.
 *
 * Hai hàm chuyển đổi là hàm thuần, chạy được trong Node để test:
 *   sangHtml(md)   chữ có dấu -> HTML (đã thoát ký tự, chỉ sinh thẻ của mình)
 *   tuHtml(nut)    cây DOM của ô soạn hoặc của thứ vừa dán -> chữ có dấu
 */
(function (goc) {
  'use strict';

  const thoat = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const RE_LINK = /https?:\/\/[^\s<>"')\]|]+/g;

  /** Một dòng chữ có dấu -> HTML. Link gỡ ra trước để dấu * trong link không bị đọc nhầm. */
  function dongSangHtml(s, coLink) {
    const links = [];
    let h = String(s);
    if (coLink) {
      h = h.replace(RE_LINK, (u) => { links.push(u); return '\u0000' + (links.length - 1) + '\u0000'; });
    }
    h = thoat(h);
    h = h.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
    h = h.replace(/&lt;u&gt;([\s\S]+?)&lt;\/u&gt;/g, '<u>$1</u>');
    h = h.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<b>$1</b>');
    h = h.replace(/(^|[^*\w])\*(?=[^\s*])([^*]*?[^\s*])\*(?![*\w])/g, '$1<i>$2</i>');
    if (coLink) {
      h = h.replace(/\u0000(\d+)\u0000/g, (_, i) => {
        const u = links[+i];
        const hien = u.length > 60 ? u.slice(0, 57) + '…' : u;
        return '<a href="' + thoat(u) + '" target="_blank" rel="noopener" title="' + thoat(u) + '">' + thoat(hien) + '</a>';
      });
    }
    return h;
  }

  const laDongBang = (d) => /^\s*\|.*\|\s*$/.test(d);
  const laDongKe = (d) => /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(d) && d.includes('-');

  function tachO(d) {
    let s = d.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
    return s.split(/(?<!\\)\|/).map((o) => o.trim().replace(/\\\|/g, '|'));
  }

  function bangSangHtml(dau, than, coLink) {
    const n = Math.max(dau.length, ...than.map((r) => r.length));
    const dong = (r, the) => '<tr>' + Array.from({ length: n }, (_, i) =>
      '<' + the + '>' + (dongSangHtml(r[i] || '', coLink) || '<br>') + '</' + the + '>').join('') + '</tr>';
    return '<table class="sc-bang"><thead>' + dong(dau, 'th') + '</thead>' +
      (than.length ? '<tbody>' + than.map((r) => dong(r, 'td')).join('') + '</tbody>' : '') + '</table>';
  }

  /**
   * Chữ có dấu -> HTML. Xuống dòng là <br>; dòng trống ngay trước bảng phải
   * thêm một <br> nữa, vì <br> cuối cùng trước một khối thì trình duyệt không vẽ.
   */
  function sangHtml(md, tuyChon) {
    const coLink = !!(tuyChon && tuyChon.link);
    const dong = String(md || '').replace(/\r\n?/g, '\n').split('\n');
    const khoi = [];
    let chu = [];
    const dongChu = (truocBang) => {
      if (!chu.length) return;
      let h = chu.map((d) => dongSangHtml(d, coLink)).join('<br>');
      if (truocBang && chu[chu.length - 1] === '') h += '<br>';
      khoi.push(h);
      chu = [];
    };
    for (let i = 0; i < dong.length; i++) {
      if (laDongBang(dong[i]) && i + 1 < dong.length && laDongKe(dong[i + 1])) {
        dongChu(true);
        const dau = tachO(dong[i]);
        const than = [];
        i += 2;
        while (i < dong.length && laDongBang(dong[i])) than.push(tachO(dong[i++]));
        i--;
        khoi.push(bangSangHtml(dau, than, coLink));
      } else {
        chu.push(dong[i]);
      }
    }
    dongChu(false);
    return khoi.join('');
  }

  /* ---------- HTML -> chữ có dấu ---------- */

  const KHOI = /^(DIV|P|LI|UL|OL|H[1-6]|BLOCKQUOTE|PRE|SECTION|ARTICLE|HEADER|FOOTER)$/;
  const BO = /^(STYLE|SCRIPT|META|TITLE|LINK|HEAD|TEMPLATE|COLGROUP|COL)$/;

  function kieu(n, ten) {
    const st = n.style || {};
    if (ten === 'b') {
      const w = String(st.fontWeight || '');
      if (w === 'normal' || (/^\d+$/.test(w) && +w < 600)) return false;
      return /^(B|STRONG)$/.test(n.nodeName) || w === 'bold' || w === 'bolder' || (/^\d+$/.test(w) && +w >= 600);
    }
    if (ten === 'i') return /^(I|EM)$/.test(n.nodeName) || st.fontStyle === 'italic';
    return n.nodeName === 'U' || /underline/.test(String(st.textDecoration || '') + String(st.textDecorationLine || ''));
  }

  /** Bọc dấu cho từng dòng, khoảng trắng đầu cuối để ngoài dấu (** a** là hỏng). */
  function boc(s, mo, dong) {
    return s.split('\n').map((d) => {
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(d);
      return m[2] ? m[1] + mo + m[2] + dong + m[3] : d;
    }).join('\n');
  }

  function hangCuaBang(bang) {
    const ra = [];
    (function di(n) {
      for (const c of n.childNodes || []) {
        if (c.nodeName === 'TR') ra.push(c);
        else if (/^(THEAD|TBODY|TFOOT)$/.test(c.nodeName)) di(c);
      }
    })(bang);
    return ra;
  }

  function bangSangMd(bang) {
    const hang = hangCuaBang(bang).map((tr) => {
      const o = [];
      for (const c of tr.childNodes || []) {
        if (!/^(TD|TH)$/.test(c.nodeName)) continue;
        o.push(tuHtml(c).replace(/\|/g, '\\|').replace(/\n+/g, '<br>'));
        const gop = +(c.getAttribute && c.getAttribute('colspan')) || 1;
        for (let k = 1; k < gop; k++) o.push('');
      }
      return o;
    }).filter((r) => r.length);
    if (!hang.length) return '';
    const n = Math.max(...hang.map((r) => r.length));
    const dong = (r) => '| ' + Array.from({ length: n }, (_, i) => r[i] || '').join(' | ') + ' |';
    return [dong(hang[0]), '|' + ' --- |'.repeat(n), ...hang.slice(1).map(dong)].join('\n');
  }

  function tuHtml(goc0) {
    let ra = '';
    let choXuong = false;
    const xuong = () => { if (ra && !ra.endsWith('\n')) ra += '\n'; };
    const viet = (s) => { if (choXuong) { xuong(); choXuong = false; } ra += s; };

    function di(n, dang) {
      for (const c of n.childNodes || []) {
        if (c.nodeType === 3) { viet(String(c.nodeValue).replace(/ /g, ' ').replace(/[\r\n]+/g, dang.pre ? '\n' : ' ')); continue; }
        if (c.nodeType !== 1 || BO.test(c.nodeName)) continue;
        if (c.nodeName === 'BR') { viet('\n'); continue; }
        if (c.nodeName === 'TABLE') {
          xuong(); choXuong = false;
          ra += bangSangMd(c);
          choXuong = true;
          continue;
        }
        const laKhoi = KHOI.test(c.nodeName);
        if (laKhoi) { xuong(); choXuong = false; }
        const moi = Object.assign({}, dang);
        const dau = [];
        for (const [k, mo, dong] of [['b', '**', '**'], ['i', '*', '*'], ['u', '<u>', '</u>']]) {
          if (!dang[k] && kieu(c, k)) { moi[k] = true; dau.push([mo, dong]); }
        }
        if (c.nodeName === 'PRE') moi.pre = true;
        if (dau.length) {
          if (choXuong) { xuong(); choXuong = false; }
          const tu = ra.length;
          di(c, moi);
          let trong = ra.slice(tu);
          for (const [mo, dong] of dau) trong = boc(trong, mo, dong);
          ra = ra.slice(0, tu) + trong;
        } else {
          di(c, moi);
        }
        if (laKhoi) choXuong = true;
      }
    }
    di(goc0, {});
    return ra.replace(/[ \t]+$/gm, '').replace(/^\n+/, '').replace(/\s+$/, '');
  }

  /* ---------- dán từ Excel / Google Sheets ---------- */

  /** Chữ dán có phải bảng tách bằng Tab không (Excel, Sheets đều chép ra kiểu này). */
  const laBangTab = (s) => /\t/.test(String(s || '').replace(/\s+$/, ''));

  /** Đọc TSV, kể cả ô có xuống dòng mà Excel bọc trong ngoặc kép. */
  function docTsv(s) {
    const hang = [[]];
    let o = '', i = 0;
    s = String(s).replace(/\r\n?/g, '\n').replace(/\n+$/, '');
    while (i < s.length) {
      if (o === '' && s[i] === '"') {
        let j = i + 1, v = '';
        for (; j < s.length; j++) {
          if (s[j] === '"' && s[j + 1] === '"') { v += '"'; j++; } else if (s[j] === '"') break; else v += s[j];
        }
        if (j < s.length && (j + 1 === s.length || s[j + 1] === '\t' || s[j + 1] === '\n')) { o = v; i = j + 1; continue; }
      }
      const c = s[i++];
      if (c === '\t') { hang[hang.length - 1].push(o); o = ''; }
      else if (c === '\n') { hang[hang.length - 1].push(o); o = ''; hang.push([]); }
      else o += c;
    }
    hang[hang.length - 1].push(o);
    return hang;
  }

  function tsvSangMd(s) {
    const hang = docTsv(s).map((r) => r.map((o) => o.trim().replace(/\|/g, '\\|').replace(/\n+/g, '<br>')));
    const n = Math.max(...hang.map((r) => r.length));
    const dong = (r) => '| ' + Array.from({ length: n }, (_, i) => r[i] || '').join(' | ') + ' |';
    return [dong(hang[0]), '|' + ' --- |'.repeat(n), ...hang.slice(1).map(dong)].join('\n');
  }

  /** Chữ trơn một dòng cho thẻ việc, ô bảng: bỏ dấu, bỏ dòng kẻ bảng. */
  function chuTho(md) {
    return String(md || '').split(/\r?\n/).filter((d) => !laDongKe(d))
      .map((d) => (laDongBang(d) ? tachO(d).filter(Boolean).join(' · ') : d)).join(' ')
      .replace(/<\/?u>|<br>/g, ' ').replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '$1')
      .replace(/(^|[^*\w])\*(?=[^\s*])([^*]*?[^\s*])\*(?![*\w])/g, '$1$2')
      .replace(/\s+/g, ' ').trim();
  }

  /* ---------- ô soạn ---------- */

  /**
   * Tạo ô soạn. Không có thanh công cụ: phím tắt và dán là đủ.
   * @param {string} giaTri  chữ có dấu đang có
   * @param {(md:string)=>void} khiDoi
   * @param {string} [goiY]  chữ mờ khi ô trống
   */
  function taoOSoan(giaTri, khiDoi, goiY) {
    const o = document.createElement('div');
    o.className = 'soan-chu';
    o.contentEditable = 'true';
    o.spellcheck = false;
    o.setAttribute('role', 'textbox');
    o.setAttribute('aria-multiline', 'true');
    if (goiY) o.dataset.goiY = goiY;
    o.innerHTML = sangHtml(giaTri);

    const trong = () => o.classList.toggle('trong', !o.textContent.trim() && !o.querySelector('table'));
    const doi = () => { trong(); khiDoi(tuHtml(o)); };
    trong();
    o.addEventListener('input', doi);

    const oBang = () => {
      const s = window.getSelection();
      if (!s || !s.rangeCount) return null;
      let n = s.anchorNode;
      if (n && n.nodeType !== 1) n = n.parentNode;
      const td = n && n.closest ? n.closest('td, th') : null;
      return td && o.contains(td) ? td : null;
    };
    const datConTro = (n) => {
      const r = document.createRange();
      r.selectNodeContents(n);
      r.collapse(false);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    };

    o.addEventListener('keydown', (e) => {
      const phim = (e.key || '').toLowerCase();
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (phim === 'b' || phim === 'i' || phim === 'u')) {
        e.preventDefault();
        document.execCommand(phim === 'b' ? 'bold' : phim === 'i' ? 'italic' : 'underline');
        return;
      }
      /* Tab trong bảng: sang ô kế như Excel; ô cuối thì thêm một hàng. */
      if (e.key === 'Tab') {
        const td = oBang();
        if (!td) return;
        e.preventDefault();
        const bang = td.closest('table');
        const cac = [...bang.querySelectorAll('th, td')];
        const i = cac.indexOf(td) + (e.shiftKey ? -1 : 1);
        if (i < 0) return;
        if (i < cac.length) { datConTro(cac[i]); return; }
        const tr = document.createElement('tr');
        const so = td.closest('tr').children.length;
        for (let k = 0; k < so; k++) tr.appendChild(document.createElement('td')).appendChild(document.createElement('br'));
        (bang.tBodies[0] || bang.appendChild(document.createElement('tbody'))).appendChild(tr);
        datConTro(tr.firstChild);
        doi();
      }
    });

    o.addEventListener('paste', (e) => {
      const cd = e.clipboardData;
      if (!cd) return;
      e.preventDefault();
      const html = cd.getData('text/html');
      const txt = cd.getData('text/plain');
      /* Đang đứng trong ô bảng thì chỉ dán chữ, không lồng bảng trong bảng. */
      if (oBang()) {
        document.execCommand('insertText', false, txt.replace(/\t/g, ' ').replace(/\r?\n/g, ' '));
        return;
      }
      const docHtml = () => tuHtml(new DOMParser().parseFromString(html, 'text/html').body);
      let md;
      if (html && /<table/i.test(html)) md = docHtml();
      else if (laBangTab(txt)) md = tsvSangMd(txt);
      else if (html) md = docHtml();
      else md = txt;
      if (!md) return;
      let h = sangHtml(md);
      /* Dán xong bảng thì còn dòng trống phía dưới để gõ tiếp. */
      if (/<\/table>$/.test(h)) h += '<div><br></div>';
      document.execCommand('insertHTML', false, h);
    });
    return o;
  }

  const api = { sangHtml, tuHtml, tsvSangMd, docTsv, laBangTab, chuTho, taoOSoan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else goc.SoanChu = api;
})(typeof window !== 'undefined' ? window : globalThis);
