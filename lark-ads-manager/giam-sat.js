'use strict';
/**
 * Tự giám sát sức khoẻ đồng bộ.
 *
 * Vì sao cần: tác vụ nền chạy mỗi 3 giờ và khi hỏng thì nó hỏng LẶNG LẼ — mã lỗi
 * nằm trong Task Scheduler, thông báo nằm trong dong-bo.log, không ai mở ra xem.
 * Meta bị chặn từ 29/08 mà tới 31/08 mới phát hiện là vì vậy.
 *
 * Sau mỗi lượt đồng bộ, file này chấm điểm sức khoẻ, ghi ra trang-thai.json cho
 * app hiện băng đỏ, và (nếu bật) nhắn thẳng vào Lark cho người phụ trách.
 *
 * Chống làm phiền: cùng một vấn đề chỉ nhắn lại sau `imLangGio` giờ. Khi hết lỗi
 * thì nhắn một lần báo đã trở lại bình thường.
 */
const fs = require('fs');
const path = require('path');
const ketnoi = require('./sync/ketnoi');
const live = require('./sync/live');
const store = require('./store');

const FILE_TT = path.join(__dirname, 'trang-thai.json');

const doc = (f, mac) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return mac; } };
const ghi = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 2), 'utf8');
const vnd = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN') + 'đ';

/* ---------------- cấu hình nhắn tin ---------------- */
function caiDatNhac() {
  const c = ketnoi.read();
  const n = c.nhacNho || {};
  return {
    /* BẬT MẶC ĐỊNH từ 07/10/2026 — anh Hùng chốt "bật nhắn qua Lark khi có kênh
     * chết". Trước đây mặc định TẮT và `nhacNho` còn chẳng có trong DEFAULT của
     * ketnoi.js, nên nó tắt vĩnh viễn: Google Ads chết 14 ngày mà không ai hay.
     * Muốn tắt thì đặt ADS_NHAC_TAT=1, hoặc nhacNho.bat = false trong cấu hình. */
    bat: process.env.ADS_NHAC_TAT === '1' ? false : (n.bat == null ? true : !!n.bat),
    /* KHÔNG cần khai open_id nữa. lark-chung/gui-anh-hung.js lo việc đó: trong hub
     * thì gửi qua hub bằng bot Marketing Hub, chạy lẻ trên máy thì gửi bằng
     * lark-cli. Bản cũ gọi lark-cli `--as user` nên trên Render không gửi được —
     * mà Render mới là chỗ cần nó nhất. */
    imLangGio: Number(n.imLangGio || 12),
    treNgay: Number(n.treNgay || 2),                // nền tảng im bao nhiêu ngày thì coi là hỏng
  };
}

/* ---------------- chấm sức khoẻ ---------------- */
/**
 * @returns {{ khoe:boolean, van_de:Array, tomTat:string, luc:string }}
 */
async function chamDiem() {
  const vanDe = [];
  const c = ketnoi.read();
  const homNay = store.todayKey();

  // 1. kênh nào đang bật mà gọi không được
  let nenTangSong = [];
  try {
    const { nenTang, loi } = await live.layRows(store.addDays(homNay, -2), homNay);
    nenTangSong = nenTang;
    loi.forEach((x) => vanDe.push({
      loai: 'ket-noi', nang: true, kenh: x.platform,
      mo_ta: `${x.platform}: ${x.loi}`,
    }));
  } catch (e) {
    vanDe.push({ loai: 'ket-noi', nang: true, kenh: '(tất cả)', mo_ta: 'Không gọi được nền tảng nào: ' + e.message });
  }

  // 2. kênh gọi được nhưng số đứng yên quá lâu
  const { treNgay } = caiDatNhac();
  const data = await store.get({ force: true });
  const moiNhat = {};
  data.daily.forEach((d) => {
    if (!d.date || !d.platform) return;
    if (!moiNhat[d.platform] || d.date > moiNhat[d.platform]) moiNhat[d.platform] = d.date;
  });
  nenTangSong.forEach((p) => {
    const m = moiNhat[p];
    const tre = m ? store.daysBetween(m, homNay) : 999;
    if (tre > treNgay) {
      vanDe.push({
        loai: 'du-lieu', nang: false, kenh: p,
        mo_ta: `${p}: số mới nhất trong Base là ${m || '(chưa có)'} — trễ ${tre} ngày`,
      });
    }
  });

  // 3. token sắp hết hạn
  const han = ketnoi.hanToken(c.meta);
  if (han && (han.muc === 'het' || han.muc === 'sapHet')) {
    vanDe.push({
      loai: 'token', nang: han.muc === 'het', kenh: 'Facebook / Meta',
      mo_ta: `Token Meta ${han.text}`,
    });
  }

  // 4. hai nguồn cùng một nền tảng (đã tự bỏ bớt, nhưng vẫn nên báo)
  live.nguonBiBo().forEach((x) => vanDe.push({
    loai: 'cau-hinh', nang: false, kenh: x.platform,
    mo_ta: `Đang bật 2 nguồn cho ${x.platform}, app chỉ dùng 1 (${x.ly_do})`,
  }));

  const nang = vanDe.filter((v) => v.nang);
  return {
    khoe: vanDe.length === 0,
    coLoiNang: nang.length > 0,
    van_de: vanDe,
    nenTangSong,
    moiNhat,
    tomTat: vanDe.length ? vanDe.map((v) => v.mo_ta).join(' | ') : 'Mọi kênh đang chạy bình thường',
    luc: new Date().toISOString(),
  };
}

/* ---------------- nhắn vào Lark ---------------- */

/**
 * Thẻ Lark báo sức khoẻ đồng bộ.
 *
 * Dùng THẺ chứ không phải chữ trần, và gửi qua cùng đường với bản tin 8:00
 * (lark-chung/gui-anh-hung.js) — đường đó đã chạy thật từ 25/09 và tự biết
 * open_id của anh Hùng ở cả hai môi trường.
 *
 * Nội dung phải trả lời được ba câu ngay trên màn hình khoá điện thoại:
 * kênh nào chết, chết vì gì, và số trong Base dừng ở ngày nào.
 */
function dungThe(tt) {
  const el = [];
  if (tt.khoe) {
    el.push({ tag: 'markdown', content: 'Mọi kênh đã kéo số bình thường trở lại.' });
  } else {
    const nang = (tt.van_de || []).filter((v) => v.nang);
    const nhe = (tt.van_de || []).filter((v) => !v.nang);
    /* `mo_ta` đã mở đầu bằng tên kênh ("Google Ads: ...") nên in thêm tên nữa là
     * ra "Google Ads — Google Ads: ...". Cắt phần trùng, giữ đậm tên kênh. */
    const than = (v) => {
      const k = String(v.kenh || '');
      const m = String(v.mo_ta || '');
      return k && m.startsWith(k + ':') ? m.slice(k.length + 1).trim() : m;
    };
    el.push({ tag: 'markdown', content:
      nang.map((v) => '🔴 **' + (v.kenh || '') + '** — ' + than(v)).join('\n')
      + (nang.length && nhe.length ? '\n' : '')
      + nhe.map((v) => '🟠 **' + (v.kenh || '') + '** — ' + than(v)).join('\n') });
  }
  const mn = tt.moiNhat || {};
  const kenh = Object.keys(mn).filter((x) => x && x !== '(chưa gán)').sort();
  if (kenh.length) {
    el.push({ tag: 'hr' });
    el.push({ tag: 'markdown', content: '**Số mới nhất trong Base**\n'
      + kenh.map((x) => '· ' + x + ': ' + mn[x]).join('\n') });
  }
  el.push({ tag: 'markdown', content:
    '<font color="grey">Mở app → tab <b>Kết nối & Đồng bộ</b> để xem và sửa.</font>' });
  return {
    config: { wide_screen_mode: true },
    header: {
      template: tt.khoe ? 'green' : (tt.coLoiNang ? 'red' : 'orange'),
      title: { tag: 'plain_text',
        content: tt.khoe ? 'Đồng bộ quảng cáo đã bình thường'
          : (tt.coLoiNang ? 'Đồng bộ quảng cáo đang HỎNG' : 'Đồng bộ quảng cáo có vấn đề') },
    },
    elements: el,
  };
}

/**
 * Gửi. `cli` chỉ cần khi chạy lẻ ngoài hub; trong hub thì để trống cũng gửi được.
 *
 * KHOÁ CHỐNG GỬI TRÙNG dựng từ chữ ký tình trạng + ngày + giờ: lượt hẹn giờ chạy
 * mỗi giờ và có cơ chế thử lại sau 60 giây, nên không có khoá là một vấn đề có
 * thể thành hai tin nhắn giống hệt nhau.
 */
async function nhanLark(tt, cli) {
  const guiAnhHung = require('../lark-chung/gui-anh-hung');
  const gio = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 13);
  const khoa = 'qc-suc-khoe-' + gio + '-' + (chuKy(tt) || 'khoe');
  try {
    const r = await guiAnhHung.gui({ card: dungThe(tt), khoa, cli });
    return { ok: !!r.ok, loi: r.ok ? null : String(r.loi || 'không rõ').slice(0, 200) };
  } catch (e) { return { ok: false, loi: String(e.message || e).slice(0, 200) }; }
}

/** Chữ ký của tình trạng — để biết có phải vẫn đúng vấn đề cũ không. */
const chuKy = (tt) => tt.van_de.map((v) => v.loai + ':' + v.kenh).sort().join(',');

/* `soanTin` cũ (chữ trần) đã bỏ: từ 07/10/2026 nhắc đi bằng THẺ — xem dungThe().
 * Giữ lại một bản rút gọn cho chỗ nào cần chữ thuần (log, hộp thoại). */
function soanTin(tt) {
  if (tt.khoe) {
    return 'Đồng bộ quảng cáo đã trở lại bình thường. '
      + `Kênh đang chạy: ${(tt.nenTangSong || []).join(', ') || '(không có)'}`;
  }
  return 'Đồng bộ quảng cáo đang có vấn đề: '
    + (tt.van_de || []).map((v) => v.mo_ta).join(' | ');
}

/* ---------------- chạy ---------------- */
async function chay({ imLang = false, cli = null } = {}) {
  const tt = await chamDiem();
  const truoc = doc(FILE_TT, {});
  const nhac = caiDatNhac();

  const kyMoi = chuKy(tt);
  const kyCu = truoc.chuKy || '';
  const gioTuLanNhac = truoc.nhacLuc ? (Date.now() - Date.parse(truoc.nhacLuc)) / 3600000 : 1e9;

  // Có nhắn hay không: vấn đề mới, hoặc vấn đề cũ nhưng đã im lâu, hoặc vừa khỏi hẳn
  let nen = false;
  let lyDo = '';
  if (!tt.khoe && kyMoi !== kyCu) { nen = true; lyDo = 'vấn đề mới'; }
  else if (!tt.khoe && gioTuLanNhac >= nhac.imLangGio) { nen = true; lyDo = `vẫn hỏng sau ${nhac.imLangGio}h`; }
  else if (tt.khoe && kyCu) { nen = true; lyDo = 'đã khắc phục'; }

  const ra = {
    ...tt,
    chuKy: kyMoi,
    nhacLuc: nen ? new Date().toISOString() : (truoc.nhacLuc || null),
    nhacGanNhat: nen ? lyDo : (truoc.nhacGanNhat || null),
  };

  if (nen && nhac.bat && !imLang) {
    const kq = await nhanLark(tt, cli);
    ra.guiLark = kq.ok ? 'đã gửi' : ('lỗi: ' + kq.loi);
  } else if (nen) {
    ra.guiLark = nhac.bat ? 'bỏ qua (gọi ở chế độ im lặng)' : 'nhắc qua Lark đang TẮT';
  }

  ghi(FILE_TT, ra);
  return ra;
}

module.exports = { chay, chamDiem, soanTin, dungThe, chuKy, FILE_TT, caiDatNhac };

/* chạy trực tiếp: node giam-sat.js [--im-lang] */
if (require.main === module) {
  chay({ imLang: process.argv.includes('--im-lang') }).then((tt) => {
    console.log(tt.khoe ? '✓ ' + tt.tomTat : '✗ ' + tt.tomTat);
    if (tt.guiLark) console.log('  nhắc Lark: ' + tt.guiLark);
    process.exitCode = tt.coLoiNang ? 1 : 0;
  }).catch((e) => { console.error('LỖI giám sát:', e.message); process.exitCode = 1; });
}
