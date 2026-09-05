'use strict';
/**
 * Kho khoá — giữ token XOAY VÒNG qua các lần deploy.
 *
 * Vì sao phải có:
 *   TikTok và Zalo OA cấp refresh token DÙNG MỘT LẦN: mỗi lần làm mới, nền tảng
 *   trả về refresh token mới và huỷ cái cũ. Token mới phải được ghi lại ở đâu đó
 *   bền hơn tiến trình. Trên Render thì ổ đĩa là TẠM — deploy lại là ket-noi.json
 *   bay sạch, còn SOCIAL_CONNECT_JSON thì đóng băng ở giá trị anh dán lúc trước,
 *   mà cái đó đã bị nền tảng huỷ từ lần làm mới đầu tiên. Kết quả: kênh tắt lặng
 *   lẽ sau vài ngày, Base cứ thiếu số mà không ai biết vì sao.
 *
 * Vì sao để trên Base mà app quảng cáo lại cấm để token trong Base:
 *   ở đây token KHÔNG nằm trần. Chuỗi ghi vào Base là bản mã AES-256-GCM, chìa
 *   nằm ở biến môi trường SOCIAL_VAULT_KEY — thứ chỉ người quản trị Render thấy.
 *   Cả phòng mở Base ra chỉ đọc được một chuỗi rác. Base ở đây đóng vai ổ đĩa
 *   bền, không phải nơi công bố bí mật.
 *
 * Chưa khai SOCIAL_VAULT_KEY thì kho TẮT HẲN (không ghi gì lên Base) và app lùi
 * về đúng cách cũ: token chỉ nằm trong ket-noi.json / SOCIAL_CONNECT_JSON.
 */
const crypto = require('crypto');
const cfg = require('./config');
const lark = require('./lark');

const T = cfg.tables.vault;

/** Chìa 32 byte suy ra từ SOCIAL_VAULT_KEY (chuỗi dài ngắn tuỳ ý). */
function chia() {
  if (!cfg.vaultKey) return null;
  return crypto.createHash('sha256').update(String(cfg.vaultKey), 'utf8').digest();
}

const bat = () => Boolean(chia());

/** object -> chuỗi "v1.<iv>.<tag>.<ciphertext>" (base64url từng phần). */
function maHoa(obj) {
  const key = chia();
  if (!key) throw new Error('Chưa khai SOCIAL_VAULT_KEY');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

/** Ngược lại. Sai chìa / chuỗi hỏng -> ném lỗi, người gọi tự quyết. */
function giaiMa(s) {
  const key = chia();
  if (!key) throw new Error('Chưa khai SOCIAL_VAULT_KEY');
  const p = String(s || '').split('.');
  if (p.length !== 4 || p[0] !== 'v1') throw new Error('Chuỗi trong kho không đúng định dạng');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(p[1], 'base64url'));
  d.setAuthTag(Buffer.from(p[2], 'base64url'));
  const raw = Buffer.concat([d.update(Buffer.from(p[3], 'base64url')), d.final()]).toString('utf8');
  return JSON.parse(raw);
}

/* Đọc cả bảng một lần rồi giữ lại — kho chỉ có vài dòng, mà mỗi lần làm mới token
 * lại gọi Base là chậm và tốn quota vô ích. */
let cache = { luc: 0, rows: null };

/* Lỗi ghi gần nhất.
 *
 * ghi() KHÔNG ném lỗi — người gọi đang giữa lúc xoay token, ném ra là làm hỏng
 * cả lượt đồng bộ vì một chuyện phụ. Nhưng nuốt luôn thì tệ hơn nhiều: đã có lần
 * app trên Render chưa được chia sẻ Base, mọi lời ghi kho đều hỏng lặng lẽ, và
 * năm kênh TikTok vừa cấp quyền bay sạch sau lần deploy kế tiếp — không một dòng
 * cảnh báo nào tới được người dùng. Nên lỗi được giữ lại ở đây để tinhTrang()
 * và màn hình Kết nối nói ra. */
let loiGhi = '';

async function docRows(moi = false) {
  if (!moi && cache.rows && Date.now() - cache.luc < 30000) return cache.rows;
  const rows = await lark.listAll(T.id);
  cache = { luc: Date.now(), rows };
  return rows;
}

const chuoi = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map((x) => (x && x.text) || x || '').join('');
  if (typeof v === 'object' && v.text) return v.text;
  return String(v);
};

/**
 * Lấy một ngăn. Trả null khi kho tắt, chưa có ngăn, hoặc giải mã hỏng —
 * KHÔNG ném lỗi, vì mọi trường hợp đó đều có đường lùi (file / biến môi trường).
 */
async function doc(ten) {
  if (!bat()) return null;
  try {
    const rows = await docRows();
    const r = rows.find((x) => chuoi(x.c[T.f.key]) === ten);
    if (!r) return null;
    return giaiMa(chuoi(r.c[T.f.blob]));
  } catch (e) {
    console.warn('[vault] không đọc được ngăn "' + ten + '": ' + e.message);
    return null;
  }
}

/** Ghi (tạo mới hoặc đè) một ngăn. Trả true nếu đã ghi được lên Base. */
async function ghi(ten, obj, ghiChu = '') {
  if (!bat()) return false;
  try {
    const blob = maHoa(obj);
    const rows = await docRows(true);
    const r = rows.find((x) => chuoi(x.c[T.f.key]) === ten);
    const fields = {
      [T.f.key]: ten,
      [T.f.blob]: blob,
      [T.f.at]: Date.now(),
      [T.f.note]: ghiChu || 'App Social ghi tự động khi làm mới token',
    };
    if (r) await lark.updateRecord(T.id, r.id, fields);
    else await lark.createRecord(T.id, fields);
    cache = { luc: 0, rows: null };
    loiGhi = '';
    return true;
  } catch (e) {
    loiGhi = 'Không ghi được ngăn "' + ten + '": ' + e.message;
    console.warn('[vault] ' + loiGhi);
    return false;
  }
}

/**
 * Thử ghi rồi đọc lại một ngăn nháp — chứng minh kho THẬT SỰ dùng được, thay vì
 * chỉ báo "đã bật" rồi hỏng lúc cần.
 */
async function kiemTra() {
  if (!bat()) return { ok: false, ly_do: 'Chưa khai SOCIAL_VAULT_KEY' };
  const moc = 'thu-' + Date.now();
  try {
    const ghiDuoc = await ghi('_kiem-tra', { moc }, 'Ngăn nháp của nút Kiểm tra kho — xoá được');
    if (!ghiDuoc) return { ok: false, ly_do: loiGhi || 'Ghi thất bại' };
    const lai = await doc('_kiem-tra');
    if (!lai || lai.moc !== moc) return { ok: false, ly_do: 'Ghi được nhưng đọc lại không khớp' };
    await xoa('_kiem-tra').catch(() => {});
    return { ok: true };
  } catch (e) {
    return { ok: false, ly_do: e.message };
  }
}

async function xoa(ten) {
  if (!bat()) return false;
  const rows = await docRows(true);
  const r = rows.find((x) => chuoi(x.c[T.f.key]) === ten);
  if (!r) return false;
  await lark.deleteRecords(T.id, [r.id]);
  cache = { luc: 0, rows: null };
  return true;
}

/** Tình trạng kho, để giao diện nói thật với người dùng thay vì im lặng. */
async function tinhTrang() {
  if (!bat()) {
    return {
      bat: false,
      ngan: [],
      canhBao: 'Chưa khai SOCIAL_VAULT_KEY. Trên máy cá nhân thì không sao. Trên Render '
        + 'thì token làm mới của TikTok/Zalo sẽ mất sau mỗi lần deploy và kênh tự tắt.',
    };
  }
  try {
    const rows = await docRows(true);
    return {
      bat: true,
      ngan: rows.map((r) => ({
        ten: chuoi(r.c[T.f.key]),
        ghiLuc: r.c[T.f.at] || null,
        doc: (() => { try { giaiMa(chuoi(r.c[T.f.blob])); return true; } catch (_) { return false; } })(),
      })).filter((n) => n.ten !== '_kiem-tra'),
      canhBao: loiGhi,
    };
  } catch (e) {
    return { bat: true, ngan: [], canhBao: 'Không đọc được kho: ' + e.message };
  }
}

module.exports = { bat, doc, ghi, xoa, tinhTrang, kiemTra, maHoa, giaiMa };
