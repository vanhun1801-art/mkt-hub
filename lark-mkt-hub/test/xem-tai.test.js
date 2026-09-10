'use strict';
/**
 * ============================================================================
 * Ô "Xem tải người khác" — CHỌN TỪNG NGƯỜI, và ba mức phải rõ ràng
 * ============================================================================
 * Anh Hùng chốt: "chỉ cho phép thấy một số người nhất định chứ không phải ấn
 * vào là xem hết". Nên ô này không phải bật/tắt mà là một danh sách, dùng đúng
 * quy ước đã có của "Base được xem":
 *
 *   để trống    -> KHÔNG AI (đây là mặc định, và là mức chặt nhất)
 *   ou_a,ou_b   -> đúng hai người đó
 *   `*`         -> cả phòng, kể cả người vào sau
 *
 * Vì sao phải có bài riêng: cùng một ô được giải nghĩa ở ba đường — đọc từ
 * Base, đọc từ file, ghi xuống Base. Lệch nhau một mức nghĩa là có người xem
 * được tải của người mình không được xem, mà đó là loại lỗi im lặng: giao diện
 * không báo gì, chỉ có dữ liệu hở ra.
 *
 * Bẫy đã tính trước: cột từng được hướng dẫn tạo kiểu Checkbox. Nếu Base còn
 * trả boolean thì String(true) ra chuỗi "true", tách dấu phẩy sẽ thành một
 * open_id rác tên là "true" — vừa sai vừa khó lần ra.
 *
 * Chạy: node test/xem-tai.test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

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

/* Bảng phân quyền để trong file: khai đủ ba mức, cộng hai kiểu khai của file. */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-xemtai-'));
const fQuyen = path.join(tmp, 'quyen.json');
fs.writeFileSync(fQuyen, JSON.stringify([
  { nguoi: 'Không ai', email: 'khong@rootytrip.com', base: '*', xemTai: '' },
  { nguoi: 'Hai người', email: 'hai@rootytrip.com', base: '*', xemTai: 'ou_a, ou_b' },
  { nguoi: 'Cả phòng', email: 'sao@rootytrip.com', base: '*', xemTai: '*' },
  // cột cũ kiểu Checkbox
  { nguoi: 'Cột cũ', email: 'cu@rootytrip.com', base: '*', xemTai: true },
  // kiểu đã tách sẵn, như code dùng
  { nguoi: 'Tách sẵn', email: 'tach@rootytrip.com', base: '*', xemTaiAi: ['ou_c'] },
  // không khai gì: mặc định phải là KHÔNG AI
  { nguoi: 'Chưa khai', email: 'chua@rootytrip.com', base: '*' },
]));
process.env.HUB_QUYEN_FILE = fQuyen;

const quyen = require('../quyen');
const { docXemTai, ghiXemTai } = quyen;

(async () => {
  group('1. Đọc ô: ba mức phải ra ba kết quả khác nhau');
  {
    const trong = docXemTai('');
    ok('để trống = không ai (KHÔNG phải "tất cả")',
      trong.ai.length === 0 && trong.moiAi === false, JSON.stringify(trong));

    const mot = docXemTai('ou_a, ou_b');
    ok('danh sách = đúng những người đó, khoảng trắng bị cắt',
      mot.ai.join('|') === 'ou_a|ou_b' && mot.moiAi === false, JSON.stringify(mot));

    const sao = docXemTai('*');
    ok('dấu * = cả phòng', sao.moiAi === true && sao.ai.length === 0, JSON.stringify(sao));

    ok('viết "tất cả" cũng hiểu là cả phòng', docXemTai('tất cả').moiAi === true);
    ok('"all" cũng hiểu là cả phòng', docXemTai('all').moiAi === true);

    /* Kê tên người rồi kê thêm dấu *: dấu * nặng hơn nên thắng, và nó không
     * được lẫn vào danh sách tên (không thì bỏ * đi lại còn dư mấy người). */
    const lan = docXemTai('ou_a,*');
    ok('kê lẫn dấu * thì * thắng, và * không thành một cái tên',
      lan.moiAi === true && lan.ai.join('|') === 'ou_a', JSON.stringify(lan));

    ok('ô rỗng / null / undefined đều là không ai',
      [null, undefined, '   ', ',,'].every((x) => {
        const o = docXemTai(x);
        return o.ai.length === 0 && !o.moiAi;
      }));
  }

  group('2. Cột kiểu Checkbox cũ — đổi kiểu cột không được làm mất quyền');
  {
    const bat = docXemTai(true);
    ok('true = cả phòng', bat.moiAi === true && bat.ai.length === 0, JSON.stringify(bat));
    const tat = docXemTai(false);
    ok('false = không ai', tat.moiAi === false && tat.ai.length === 0, JSON.stringify(tat));
    /* Đây là cái bẫy: String(true) = "true". Nếu boolean không được bắt riêng
     * thì danh sách sẽ có một open_id tên "true". */
    ok('true KHÔNG biến thành open_id tên "true"',
      !docXemTai(true).ai.includes('true'), JSON.stringify(docXemTai(true).ai));
  }

  group('3. Ghi lại xuống ô Văn bản — đi rồi về phải còn nguyên');
  {
    ok('không ai -> ô trống', ghiXemTai({ xemTaiAi: [], moiXemTai: false }) === '',
      JSON.stringify(ghiXemTai({ xemTaiAi: [], moiXemTai: false })));
    ok('danh sách -> "ou_a,ou_b"',
      ghiXemTai({ xemTaiAi: ['ou_a', 'ou_b'], moiXemTai: false }) === 'ou_a,ou_b');
    ok('cả phòng -> dấu *', ghiXemTai({ moiXemTai: true, xemTaiAi: ['ou_a'] }) === '*');

    /* Vòng tròn: đọc -> ghi -> đọc phải ra y cũ. Nếu không thì mở form ra Lưu
     * mà không sửa gì cũng làm quyền đổi — loại lỗi khó tin nhất khi gặp. */
    const vong = (raw) => {
      const o = docXemTai(raw);
      const lai = docXemTai(ghiXemTai({ xemTaiAi: o.ai, moiXemTai: o.moiAi }));
      return lai.ai.join('|') === o.ai.join('|') && lai.moiAi === o.moiAi;
    };
    ok('đọc -> ghi -> đọc: giữ nguyên cả ba mức',
      ['', 'ou_a,ou_b', '*'].every(vong));
    ok('mở form Lưu mà không sửa gì thì cột cũ (Checkbox) không tuột quyền',
      docXemTai(ghiXemTai({ xemTaiAi: docXemTai(true).ai, moiXemTai: docXemTai(true).moiAi }))
        .moiAi === true);
  }

  group('4. Cả bảng đọc từ file — đúng mức cho đúng người');
  {
    const ds = await quyen.docTatCa(true);
    const cua = (mail) => ds.find((r) => r.email === mail) || {};
    const ke = (mail) => (cua(mail).xemTaiAi || []).join('|');

    ok('"Không ai": danh sách rỗng, không phải cả phòng',
      ke('khong@rootytrip.com') === '' && cua('khong@rootytrip.com').moiXemTai === false);
    ok('"Hai người": đúng hai open_id', ke('hai@rootytrip.com') === 'ou_a|ou_b',
      ke('hai@rootytrip.com'));
    ok('"Cả phòng": moiXemTai = true', cua('sao@rootytrip.com').moiXemTai === true);
    ok('"Cột cũ" (Checkbox true): hiểu là cả phòng',
      cua('cu@rootytrip.com').moiXemTai === true);
    ok('"Tách sẵn": nhận đôi xemTaiAi/moiXemTai', ke('tach@rootytrip.com') === 'ou_c',
      ke('tach@rootytrip.com'));
    /* Mức chặt nhất phải là MẶC ĐỊNH: 36 dòng đang có trên Base đều chưa khai
     * ô này, nên nếu mặc định lỡ là "cả phòng" thì cả phòng xem được tải nhau
     * ngay lúc cột vừa được tạo — và không ai bấm gì để nó xảy ra. */
    ok('"Chưa khai": mặc định là KHÔNG AI',
      ke('chua@rootytrip.com') === '' && cua('chua@rootytrip.com').moiXemTai === false,
      JSON.stringify({ ai: ke('chua@rootytrip.com'), moi: cua('chua@rootytrip.com').moiXemTai }));
  }

  group('5. Quyền này KHÔNG được rò xuống app con');
  {
    /* Nửa còn lại của thiết kế: nó chỉ mở lưới bảng nhiệt ở lớp vỏ. Nếu có
     * header nào chuyển nó xuống thì content mở Bảng công việc là thấy hết —
     * đúng thứ mà quyền hẹp này ra đời để tránh. */
    const proxy = fs.readFileSync(path.join(__dirname, '..', 'proxy.js'), 'utf8');
    ok('proxy.js không nhắc tới quyền xem tải',
      !/xemTai/i.test(proxy), 'proxy.js có nhắc — quyền hẹp bị rò thành quyền rộng');
    /* Và app con phải không biết đến khái niệm này. */
    const sv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    ok('server không gắn quyền này vào header nào',
      !/x-hub-perm[^\n]*xemTai/i.test(sv) && !/xemTai[^\n]*x-hub-perm/i.test(sv));
  }

  group('6. Đường đi của quyền — quyền phải TỚI được lưới, không rơi giữa đường');
  {
    /* Đây là bài quan trọng nhất của tệp này, vì nó canh một lỗi đã xảy ra
     * thật và không hề có dấu hiệu gì.
     *
     * server.js có ba chặng: quyen.js đọc cột -> tuHang() -> nguoiKemQuyen()
     * -> lichChung(). Chặng nguoiKemQuyen() dựng một object MỚI và liệt kê
     * từng quyền một, nên quyền nào không được kê ở đó là RƠI MẤT. Bản đầu
     * của quyền này thêm vào tuHang() mà quên nguoiKemQuyen(): cột đã tạo,
     * tick đúng người, mà lưới vẫn chỉ hiện dòng của chính họ — không lỗi,
     * không log, không cách nào biết ngoài việc ngồi đọc lại ba tệp.
     *
     * Phép thử cũ không bắt được vì nó tự dựng object `nguoi` rồi gọi
     * lichChung() trực tiếp, tức là nhảy qua đúng đoạn có lỗi. Bài này soi
     * bằng nguồn: mọi thứ lichchung.js đọc từ `nguoi` mà không phải danh tính
     * thì phải có tên trong nguoiKemQuyen(). */
    const sv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const lc = fs.readFileSync(path.join(__dirname, '..', 'lichchung.js'), 'utf8');

    /* Cắt lấy thân một hàm: dấu '}' đứng đầu dòng là chỗ hàm kết thúc. */
    const than = (src, ten) => {
      const i = src.indexOf('function ' + ten + '(');
      return i < 0 ? '' : src.slice(i, src.indexOf('\n}', i));
    };
    const thanKQ = than(sv, 'nguoiKemQuyen');
    const thanTH = than(sv, 'tuHang');
    ok('tìm được hai hàm để soi (đổi tên thì phải sửa bài thử này)',
      thanKQ.length > 0 && thanTH.length > 0);

    /* Danh tính đi kèm sẵn qua Object.assign({}, nguoi) nên không phải kê lại. */
    const DANH_TINH = ['id', 'name', 'ten', 'email', 'openId', 'open_id', 'avatar'];
    const doc = [...new Set([...lc.matchAll(/\bnguoi\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))]
      .filter((k) => !DANH_TINH.includes(k));

    ok('lưới CÓ đọc quyền từ `nguoi` (không thì bài này vô nghĩa)', doc.length > 0,
      'không thấy nguoi.<quyền> nào — code đổi cách đọc rồi?');

    const co = (than_, k) => new RegExp('\\b' + k + '\\b').test(than_);
    const roi = doc.filter((k) => !co(thanKQ, k));
    ok('mọi quyền lưới đọc đều được nguoiKemQuyen() chuyển tiếp', roi.length === 0,
      'RƠI MẤT: ' + roi.join(', ') + ' — lichchung.js đọc nhưng nguoiKemQuyen() ' +
      'không kê, nên quyền không bao giờ tới được lưới. Lưới đọc: ' + doc.join(', '));

    ok('cụ thể: nguoiKemQuyen() có cả xemTaiAi và moiXemTai',
      co(thanKQ, 'xemTaiAi') && co(thanKQ, 'moiXemTai'));
    /* Chặng ngay trước đó: tuHang() phải lấy ra từ dòng phân quyền, không thì
     * nguoiKemQuyen() có kê cũng chỉ chuyển tiếp undefined. */
    ok('cụ thể: tuHang() cũng có cả hai',
      co(thanTH, 'xemTaiAi') && co(thanTH, 'moiXemTai'));
  }

  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}

  console.log('\n' + '─'.repeat(56));
  console.log('  ' + pass + ' pass · ' + fail + ' fail');
  if (fail) { console.log('\n  Không đạt:'); fails.forEach((f) => console.log('   - ' + f)); }
  console.log('─'.repeat(56) + '\n');
  process.exit(fail ? 1 : 0);
})();
