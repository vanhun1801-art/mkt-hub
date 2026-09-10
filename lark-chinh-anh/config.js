'use strict';
/**
 * Cấu hình app Chỉnh ảnh & Edit video.
 *
 * Base do thiet-lap-base.js tự tạo (10/09/2026), nên mọi table/field ID dưới đây
 * lấy từ +table-list / +field-list THẬT, không đoán. Đọc/ghi bằng field ID để
 * đổi tên cột trên Base không làm app vỡ — bài học từ app quảng cáo.
 */
const path = require('path');
const fs = require('fs');

/* Nạp .env cạnh app (rồi tới gốc repo) nếu có.
 *
 * Cần vì app này là app đầu tiên của phòng phải giữ MỘT BÍ MẬT trên máy cá nhân:
 * App ID + App Secret của app Lark đứng tên gửi tin nhóm, để tin luôn mang MỘT
 * danh tính duy nhất (xem tin-app.js). Sáu app kia không cần nên không có bộ nạp này.
 *
 * KHÔNG cất secret vào bảng Cài đặt trên Base: cả phòng mở Base ra là đọc được.
 * .env đã bị .gitignore của repo chặn nên không lên GitHub được.
 * Khi deploy thì khai bằng biến môi trường của Render, không dùng file.
 *
 * Không dùng dotenv để giữ đúng nguyên tắc KHÔNG dependency npm của cả bảy app.
 * Biến đã có sẵn trong môi trường thì .env KHÔNG ghi đè — môi trường thắng file. */
(function napEnv() {
  for (const f of [path.join(__dirname, '.env'), path.join(__dirname, '..', '.env')]) {
    let raw;
    try { raw = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
    raw.split('\n').forEach((dong) => {
      const d = dong.trim();
      if (!d || d[0] === '#') return;
      const i = d.indexOf('=');
      if (i < 1) return;
      const k = d.slice(0, i).trim();
      let v = d.slice(i + 1).trim();
      if ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'")) v = v.slice(1, -1);
      if (process.env[k] === undefined) process.env[k] = v;
    });
  }
})();

const npmRoot = process.env.LARK_NPM_ROOT ||
  path.join(process.env.APPDATA || path.join(require('os').homedir(), 'AppData/Roaming'), 'npm/node_modules');

const BASE_TOKEN = process.env.ANH_BASE_TOKEN || 'OzF9bSPkPamYQHsNcU8lmMVQgFb';

module.exports = {
  port: Number(process.env.PORT || 5181),
  identity: process.env.LARK_IDENTITY || 'user',

  /* cli: dùng phiên lark-cli của máy · api: gọi Open API bằng app credentials
     (khi deploy chung; danh tính người dùng do lớp vỏ mkt-hub truyền xuống). */
  mode: process.env.LARK_MODE ||
    ((process.env.LARK_APP_ID && process.env.LARK_APP_SECRET) ? 'api' : 'cli'),
  appId: process.env.LARK_APP_ID || '',
  appSecret: process.env.LARK_APP_SECRET || '',
  apiHost: process.env.LARK_API_HOST || 'https://open.larksuite.com',

  // Gọi thẳng script Node của lark-cli — launcher .cmd trên Windows hay hỏng
  cliScript: process.env.LARK_CLI_SCRIPT ||
    path.join(npmRoot, '@larksuite/cli/scripts/run.js'),

  baseToken: BASE_TOKEN,
  baseUrl: 'https://rootytrip2.sg.larksuite.com/base/' + BASE_TOKEN,

  /* Base tạo với time_zone Asia/Shanghai (+8) — giống các base khác của phòng, để
   * một mẹo ghi ngày duy nhất dùng chung được cho cả bảy app. Xem store.ngayVeBase(). */
  tzOffsetHours: 8,

  /* Nhóm chat nhận báo cáo. Giá trị thật nằm ở bảng Cài đặt trên Base (quản lý đổi
   * được ngay trong app) — hằng này chỉ là mồi cho lần chạy đầu và cho khi Base
   * chưa kịp có dòng cài đặt nào. */
  chatMacDinh: process.env.ANH_CHAT_ID || 'oc_510640bcfd1063a51d32db0d58f95d72',
  chatTenMacDinh: process.env.ANH_CHAT_TEN || 'SỬA ẢNH',

  /* Tin vào nhóm gửi bằng danh tính BOT, không phải danh tính người đang dùng app.
   *
   * Hai lý do, cả hai đã kiểm bằng --dry-run trên chính tenant này:
   *  1. Gửi bằng danh tính người cần scope `im:message.send_as_user` — phiên
   *     lark-cli của máy KHÔNG có scope đó, nên mỗi người dùng app lại phải tự
   *     đăng nhập lại Lark một lần nữa. Không đáng.
   *  2. Khi deploy chung (mode 'api') thì chỉ có tenant_access_token, tức là bot.
   *     Để cli và api gửi bằng hai danh tính khác nhau là hai kiểu tin trong cùng
   *     một nhóm — người đọc không hiểu vì sao.
   * Ai báo cáo thì đã ghi rõ trong thân thẻ, nên không mất thông tin.
   *
   * ĐIỀU KIỆN: bot của app phải ở trong nhóm. Chưa thêm thì Lark trả 230002/230013
   * và app nói rõ ra thay vì báo "gửi thất bại" chung chung.
   */
  identityTin: process.env.ANH_IDENTITY_TIN || 'bot',

  /* App Lark đứng tên gửi tin. Phòng có NĂM app trong Developer Console:
   *   Marketing Hub                (anh Hùng chọn app này đứng tên gửi)
   *   Tracking      cli_aa04305ecd385ed1   ← doc deploy cũ ghi làm LARK_APP_ID
   *   Adsverting  ·  ShootFlow
   *   Lê Văn Hùng's Lark CLI  cli_aaeafc646039ded1  (lark-cli buộc trên máy)
   *
   * CỐ Ý KHÔNG cắm sẵn App ID nào. Đã có lần cắm sẵn 'cli_aa04305ecd385ed1' vì
   * tưởng đó là Marketing Hub — thật ra đó là app "Tracking". Nếu để mặc định sai
   * mà anh Hùng chỉ dán SECRET của app khác thì id và secret lệch nhau, Lark trả
   * lỗi token mà nhìn thì không hiểu vì sao. Bắt khai cả hai là hết bẫy.
   *
   * Khai ANH_TIN_APP_ID + ANH_TIN_APP_SECRET (trong .env, đừng để trong git) là
   * mọi tin đi qua tin-app.js ở MỌI chế độ, và chỉ phải mời MỘT bot vào nhóm.
   * Chưa khai thì lùi về bot của lark-cli và giao diện nói rõ đang gửi bằng ai.
   *
   * tinAppTen chỉ để HIỂN THỊ cho khớp tên trong Console — anh Hùng tìm bot theo
   * tên lúc mời vào nhóm. Thứ định danh chắc chắn là App ID, nên giao diện luôn
   * in kèm App ID. */
  tinAppId: process.env.ANH_TIN_APP_ID || '',
  tinAppSecret: process.env.ANH_TIN_APP_SECRET || '',
  tinAppTen: process.env.ANH_TIN_APP_TEN || 'Marketing Hub',

  /* Tiêu đề thẻ gửi vào nhóm.
   *
   * Người đọc tin KHÔNG phải người chỉnh ảnh: MKT chỉnh xong → gửi nhóm → **Media**
   * kiểm và chỉnh tiếp → **CSKH** gửi khách. Nên tiêu đề phải nói "đây là media giao
   * cho khách, của ngày nào", chứ không phải tên thư mục nội bộ kiểu
   * "TOUR ĐẢO · Ghép · 10.09.2026" — tên đó vẫn còn, nhưng nằm trong thân tin.
   *
   * Đổi câu chữ thì sửa ANH_TIEU_DE_TIN trong .env, không phải sửa code. */
  tieuDeTin: process.env.ANH_TIEU_DE_TIN || 'Media khách hàng Rooty Trip',

  cacheTtlMs: Number(process.env.ANH_CACHE_TTL || 45000),

  tables: {
    tour: {
      id: 'tblUV3PEDZ4RrqGh',
      name: 'Danh mục Tour',
      f: {
        name: 'fldFcHEm6E',      // Tên Tour (text) — primary
        drive: 'fldzJFAG4T',     // Thư mục Drive (url)
        group: 'fldqGKuJc9',     // Nhóm (select)
        order: 'fldt4WHe9z',     // Thứ tự (number)
        active: 'fldz9NU7pR',    // Đang dùng (checkbox)
        note: 'fldu6cAKyy',      // Ghi chú (text)
      },
    },
    baoCao: {
      id: 'tblPBDyAV8sOM1ne',
      name: 'Báo cáo sản phẩm',
      f: {
        folder: 'fldYqvMZtE',    // Tên thư mục (text) — primary
        key: 'fldN8uGrAC',       // ⚙️ Khoá <tour>|<loại>|<ngày>
        date: 'fldjXbGvLW',      // Ngày tác nghiệp (datetime)
        tour: 'fld1sb52da',      // Tour (link → Danh mục Tour)
        tourName: 'fldfpFyLVG',  // Tên Tour (text, sao lại)
        kind: 'fldyegYxB9',      // Loại (select: Ghép | VIP | Khác)
        items: 'fldlyiSwLm',     // Hạng mục (multi-select)
        linkPhoto: 'fldJJ4wGtb', // Link ảnh (url)
        linkVideo: 'flddv8GIir', // Link video (url)
        nPhoto: 'fld4FvLZzo',    // Số ảnh
        nVideo: 'fldf2Ub8NS',    // Số video
        doer: 'fldXjGGZeg',      // Người thực hiện (user, nhiều)
        note: 'fldgbIgk4Z',      // Ghi chú
        status: 'fldgeKX3kW',    // Trạng thái (select)
        judge: 'fld4vWyheI',     // Người nghiệm thu (user, một)
        judgedAt: 'fld0JoiYyu',  // Nghiệm thu lúc (datetime)
        judgeNote: 'fldTymPTlD', // Nhận xét nghiệm thu
        sent: 'fldpIsgrgX',      // Đã gửi nhóm (checkbox)
        sentAt: 'fldWjONtTp',    // Gửi lúc (datetime)
        createdAt: 'fldVinadYI', // Báo cáo lúc (created_at)
        updated: 'fldhLyqn9i',   // Cập nhật (updated_at)
      },
    },
    nhatKy: {
      id: 'tbluySEbuMes6IjA',
      name: 'Nhật ký gửi tin',
      f: {
        at: 'fldzomC1RA',        // Lúc (text ISO) — primary
        chat: 'fldKjRuRF3',      // Nhóm chat
        report: 'fldz2ELWL2',    // Báo cáo (link)
        result: 'fld98oVBQn',    // Kết quả (select)
        msgId: 'fldwef6c4S',     // Mã tin
        content: 'fldEYWJINr',   // Nội dung
        message: 'fldp9lEjEM',   // Thông báo
      },
    },
    caiDat: {
      id: 'tblRHAgZLJFdATqT',
      name: 'Cài đặt',
      f: {
        key: 'fldt0EhcyF',       // Khoá (text) — primary
        value: 'fldHpO4JgB',     // Giá trị
        note: 'fld4SFuwoI',      // Ghi chú
      },
    },
  },

  /* Đúng option của cột select trên Base. Sai một chữ là Lark từ chối ghi. */
  loai: ['Ghép', 'VIP', 'Khác'],
  hangMuc: ['Chỉnh ảnh', 'Edit video'],
  trangThai: ['Chờ nghiệm thu', 'Đạt', 'Cần sửa lại'],
};
