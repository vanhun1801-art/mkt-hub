'use strict';
/**
 * ============================================================================
 * TỪ VỰNG DÙNG CHUNG — một khái niệm một tên, ở mọi app
 * ============================================================================
 * Đã trôi thật. Đo trước khi sửa, cùng một hành động "nạp lại số" có NĂM cách
 * nói: nhãn "Tải lại" (Bảng công việc), "Làm mới" (Quảng cáo, Social), "Đọc lại
 * Lark" (OTA), Lịch thì chỉ có icon; tooltip thì năm câu khác nhau. Nút mở Base
 * có ba nhãn và ba tooltip.
 *
 * Anh Hùng chốt hai từ: dùng "Làm mới", và gọi người là "Nhân sự".
 *
 * MỘT CÁI BẪY riêng của hệ này: proxy bơm i18n.js của lớp vỏ vào MỌI iframe app
 * con, và từ điển khoá theo chính chuỗi tiếng Việt. Đổi nhãn tiếng Việt mà quên
 * đổi khoá thì bản tiếng Anh lặng lẽ mất — không lỗi, không cảnh báo, chỉ là
 * nút đó không dịch nữa. Phép thử canh luôn chuyện đó.
 *
 * Chạy: node test/tu-vung.test.js
 */
const fs = require('fs');
const path = require('path');

const GOC = path.join(__dirname, '..', '..');
/* Năm app đầu là năm app "một base một app". `lark-kpi` đứng riêng ở APPS_MOI
 * vì nó KHÔNG có nút Mở Base — nó đọc số từ năm app kia chứ không sở hữu base
 * nào — nhưng nút Làm mới thì vẫn phải gọi đúng một chữ như mọi app. */
const APPS = ['lark-task-manager', 'lark-lich-tac-nghiep', 'lark-ads-manager',
  'lark-ota-manager', 'lark-social'];
const APPS_MOI = [...APPS, 'lark-kpi'];

let pass = 0, fail = 0;
const fails = [];
const ok = (ten, dieu, vi) => {
  if (dieu) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + ten); }
  else {
    fail++; fails.push(ten + (vi ? ' — ' + vi : ''));
    console.log('  \x1b[31mFAIL\x1b[0m ' + ten + (vi ? '\n        ' + vi : ''));
  }
};
const group = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');
const ten = (a) => a.replace('lark-', '').padEnd(18);

const html = (a) => fs.readFileSync(path.join(GOC, a, 'public', 'index.html'), 'utf8');
const HTML = Object.fromEntries(['lark-kpi', ...APPS].map((a) => [a, html(a)]));

/** Thẻ mở của phần tử có id này, ví dụ `<button id="x" title="y">`. */
function the(s, id) {
  const re = new RegExp('<(?:button|a)[^>]*\\bid="' + id + '"[^>]*>', 'i');
  const m = s.match(re);
  return m ? m[0] : '';
}
/** Chữ ngay sau thẻ mở — nhãn hiện ra mắt. Rỗng nghĩa là nút chỉ có icon. */
function nhan(s, id) {
  const t = the(s, id);
  if (!t) return null;
  const i = s.indexOf(t) + t.length;
  return s.slice(i, i + 60).split('<')[0].trim();
}
const tooltip = (s, id) => {
  const m = the(s, id).match(/\btitle="([^"]*)"/);
  return m ? m[1] : '';
};

/* id của hai nút này khác nhau giữa các app — di sản, không đổi id vì mã JS
 * bám vào chúng. Canh CHỮ hiện ra mắt, không canh id. */
const ID_MOI = { 'lark-task-manager': 'btnRefresh', 'lark-lich-tac-nghiep': 'btnRefresh',
  'lark-ads-manager': 'btnRefresh', 'lark-ota-manager': 'btnRefresh',
  'lark-social': 'btnRefresh', 'lark-kpi': 'btnLamMoi' };
const ID_BASE = { 'lark-task-manager': 'linkLark', 'lark-lich-tac-nghiep': 'btnLark',
  'lark-ads-manager': 'linkBase', 'lark-ota-manager': 'linkBase', 'lark-social': 'linkBase' };

const TT_MOI = 'Đọc lại số mới nhất từ Base';
const TT_BASE = 'Mở bảng dữ liệu gốc trên Lark';

(async () => {
  group('1. Nạp lại số — một chữ duy nhất: "Làm mới"');
  {
    const nh = APPS_MOI.map((a) => [a, nhan(HTML[a], ID_MOI[a])]);
    ok('nhãn là "Làm mới" (hoặc rỗng nếu nút chỉ có icon)',
      nh.every(([, v]) => v === 'Làm mới' || v === ''),
      nh.map(([a, v]) => '\n        ' + ten(a) + (v === '' ? '(chỉ icon)' : '"' + v + '"')).join(''));

    const tt = APPS_MOI.map((a) => [a, tooltip(HTML[a], ID_MOI[a])]);
    ok('tooltip giống nhau ở mọi app', tt.every(([, v]) => v === TT_MOI),
      tt.map(([a, v]) => '\n        ' + ten(a) + '"' + v + '"').join(''));

    /* Mấy chữ đã bỏ. Để lọt lại một chữ là hệ có hai tên cho một việc. */
    for (const xau of ['Tải lại', 'Đọc lại Lark', 'Nạp lại']) {
      const co = APPS_MOI.filter((a) => HTML[a].includes('>' + xau) || HTML[a].includes('"' + xau));
      ok('không app nào còn dùng "' + xau + '"', !co.length, co.map(ten).join(' '));
    }

    /* Nút Làm mới dựng bằng JS cũng phải mang đúng tooltip đó. Bảng công việc
     * từng GHI ĐÈ tooltip lúc chạy nên sửa index.html xong mở ra vẫn thấy chữ
     * cũ; app KPI có một nút chỉ-icon dựng trong baocao.js, cùng cái bẫy. */
    const jsMoi = ['lark-kpi/public/baocao.js'];
    for (const f of jsMoi) {
      const js = fs.readFileSync(path.join(GOC, f), 'utf8');
      const co = !js.includes('.title =') || js.includes("'" + TT_MOI + "'");
      ok(f + ': nút Làm mới dựng bằng JS mang đúng tooltip', co);
    }
  }

  group('2. Mở Base — một nhãn, một tooltip');
  {
    const nh = APPS.map((a) => [a, nhan(HTML[a], ID_BASE[a])]);
    ok('nhãn là "Mở Base" (hoặc rỗng nếu chỉ có icon)',
      nh.every(([, v]) => v === 'Mở Base' || v === ''),
      nh.map(([a, v]) => '\n        ' + ten(a) + (v === '' ? '(chỉ icon)' : '"' + v + '"')).join(''));

    const tt = APPS.map((a) => [a, tooltip(HTML[a], ID_BASE[a])]);
    ok('tooltip giống nhau ở mọi app', tt.every(([, v]) => v === TT_BASE),
      tt.map(([a, v]) => '\n        ' + ten(a) + '"' + v + '"').join(''));
  }

  group('3. Gọi người là "Nhân sự" — không "thành viên", không "người dùng"');
  {
    /* Chỉ soi chuỗi LỘ RA MẶT. Chú thích trong mã nói "người dùng" là bình
     * thường — đó là lập trình viên nói với nhau, không phải nhãn. */
    const canSoi = [
      ['lark-mkt-hub/public/app.js', /'[^']*Phân quyền thành viên[^']*'|>Phân quyền thành viên</],
      ['lark-mkt-hub/public/index.html', /title="[^"]*thành viên[^"]*"/],
      ['lark-mkt-hub/public/quyen.js', />Thêm người dùng<|'Thêm người dùng'/],
    ];
    for (const [f, re] of canSoi) {
      const s = fs.readFileSync(path.join(GOC, f), 'utf8');
      ok(f + ': không còn từ đã bỏ', !re.test(s));
    }
  }

  group('4. Câu động trong JS cũng phải theo — nhãn HTML không phải chỗ duy nhất');
  {
    /* Bẫy đã sập một lần: sửa xong tooltip trong index.html, mở app ra vẫn thấy
     * chữ cũ — vì Bảng công việc GHI ĐÈ title bằng JS lúc chạy để chèn thêm
     * "dữ liệu lấy từ Lark lúc nào". Canh nhãn tĩnh mà không canh câu động thì
     * chỉ dọn được một nửa.
     *
     * HAI NGOẠI LỆ cố ý giữ, vì là khái niệm KHÁC chứ không phải cách nói khác:
     *   - Social "Nạp lại từ đầu": kéo lại toàn bộ lịch sử, chạy hơn 10 phút.
     *     Khác hẳn làm mới (đọc lại số hiện có).
     *   - "mở lại trang": nạp lại trang trình duyệt, không phải làm mới dữ liệu.
     *     Chỗ này đã đổi từ "tải lại trang" sang "mở lại trang" để khỏi lẫn. */
    const CAM = ['bấm để tải lại', 'Đã tải lại', 'Đang tải lại', 'Đã nạp lại số',
      'Đọc lại Lark'];
    for (const xau of CAM) {
      const co = [];
      for (const a of APPS) {
        const js = path.join(GOC, a, 'public', 'app.js');
        if (fs.existsSync(js) && fs.readFileSync(js, 'utf8').includes(xau)) co.push(a);
      }
      ok('không câu động nào còn "' + xau + '"', !co.length, co.map(ten).join(' '));
    }
  }

  group('5. Bẫy i18n — đổi nhãn thì phải đổi khoá');
  {
    /* Từ điển khoá theo chuỗi tiếng Việt, và proxy bơm nó vào mọi iframe. Khoá
     * còn chữ đã bỏ nghĩa là hoặc nhãn chưa đổi, hoặc khoá thành mồ côi và nút
     * đó thôi dịch. */
    const d = fs.readFileSync(path.join(GOC, 'lark-mkt-hub', 'public', 'i18n.js'), 'utf8');
    const khoa = [...d.matchAll(/^\s*'([^']+)'\s*:/gm)].map((m) => m[1]);
    /* KHÔNG PHÂN BIỆT hoa thường: bản trước dùng /người dùng/ nên bỏ sót đúng
     * khoá 'Người dùng & phân quyền' — chữ N hoa. Phép thử xanh mà khoá vẫn mồ
     * côi, tức là mục đó thôi dịch mà không ai biết. */
    const xau = khoa.filter((k) => /thành viên|người dùng/i.test(k));
    ok('không khoá nào còn "thành viên" / "người dùng"', !xau.length, xau.join(' | '));

    /* Và hai nhãn mới phải CÓ khoá, không thì mất bản tiếng Anh. */
    for (const k of ['Phân quyền nhân sự', 'Thêm nhân sự']) {
      ok('có khoá dịch cho "' + k + '"', khoa.includes(k));
    }
  }

  console.log('\n' + '─'.repeat(56));
  console.log('  ' + pass + ' pass · ' + fail + ' fail');
  if (fail) { console.log('\n  Không đạt:'); fails.forEach((f) => console.log('   - ' + f)); }
  console.log('─'.repeat(56) + '\n');
  process.exit(fail ? 1 : 0);
})();
