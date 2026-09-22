'use strict';
/**
 * Cấu hình app Social — số liệu các kênh mạng xã hội của Rooty Trip.
 *
 * Base "Social — Rooty Trip" do app này tự tạo (06/09/2026), nên mọi ID field/table
 * dưới đây lấy từ +table-list / +field-list thật, KHÔNG đoán. Đọc/ghi bằng field ID
 * để đổi tên cột trên Base không làm app vỡ — bài học từ app quảng cáo.
 */
const path = require('path');

const npmRoot = process.env.LARK_NPM_ROOT ||
  path.join(process.env.APPDATA || path.join(require('os').homedir(), 'AppData/Roaming'), 'npm/node_modules');

const BASE_TOKEN = process.env.SOCIAL_BASE_TOKEN || 'YzgUbMS3PaE0B9sDtdIlNYzFgsc';

module.exports = {
  port: Number(process.env.PORT || 5178),
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
   * một mẹo ghi ngày duy nhất dùng chung được cho cả bốn app. Xem store.ngayVeBase(). */
  tzOffsetHours: 8,

  // Khai báo kết nối nền tảng (token để ngoài git)
  connectFile: process.env.SOCIAL_CONNECT_FILE || 'ket-noi.json',

  /* Khoá mã hoá kho token trên Base. CHƯA khai thì kho tắt hẳn: token chỉ nằm ở
   * ket-noi.json / SOCIAL_CONNECT_JSON như cũ. Xem vault.js để hiểu vì sao cần. */
  vaultKey: process.env.SOCIAL_VAULT_KEY || '',

  /* App đứng tên gửi cảnh báo vào nhóm Lark. Mặc định là chính app nền tảng —
   * cả hệ chỉ còn một app Lark ("Marketing Hub"), nên nhóm chỉ thấy một bot mà
   * không phải khai thêm bộ khoá nào. ANH_TIN_APP_* / SOCIAL_TIN_APP_* chỉ còn
   * là đường đè khi muốn tách riêng người gửi cho app này. */
  tinAppId: process.env.SOCIAL_TIN_APP_ID || process.env.ANH_TIN_APP_ID
    || process.env.LARK_APP_ID || '',
  tinAppSecret: process.env.SOCIAL_TIN_APP_SECRET || process.env.ANH_TIN_APP_SECRET
    || process.env.LARK_APP_SECRET || '',
  tinAppTen: process.env.SOCIAL_TIN_APP_TEN || 'Marketing Hub',

  cacheTtlMs: Number(process.env.SOCIAL_CACHE_TTL || 60000),

  tables: {
    channel: {
      id: 'tbltYMMxACW3NdMd',
      name: 'Kênh',
      f: {
        name: 'fldOTWDEsc',       // Tên kênh (text) — primary
        platform: 'fldEIOInQp',   // Nền tảng (select)
        extId: 'fldh2n5IYO',      // ⚙️ ID kênh — khoá đồng bộ
        handle: 'fld8IkFJyP',     // Handle (text)
        url: 'fldxkljlKM',        // Link kênh (url)
        owner: 'fldfUF0Itc',      // Người phụ trách (user)
        /* Ai được XEM kênh này, khai bằng EMAIL công ty chứ không dùng ô người
         * dùng của Lark. Lý do: open_id là RIÊNG THEO TỪNG APP — cùng một con
         * người, app lark-cli trên máy thấy một id, app nền của hub trên Render
         * thấy id khác. Khai bằng ô người dùng thì lọc chạy đúng ở một nơi và
         * sai ở nơi kia, mà không có gì báo. Email chung cho cả tenant. */
        viewers: 'fldmSpLgfF',    // Email người xem (nhiều email, cách bằng dấu phẩy)
        status: 'flddCsgSHt',     // Trạng thái (select)
        source: 'fldegfGnpg',     // Nguồn số liệu (select)
        note: 'flduiXVTKR',       // Ghi chú (text)
        updated: 'fldcoCPKXQ',    // Cập nhật lúc (updated_at)
      },
    },
    daily: {
      id: 'tblB6lUB7YiFbAMR',
      name: 'Số liệu theo ngày',
      f: {
        key: 'fld0JW8sOE',        // ⚙️ Khoá <extId>#<YYYY-MM-DD> — primary
        date: 'fld8d0g5DL',       // Ngày (datetime)
        channel: 'fld92cTmEY',    // Kênh (link)
        platform: 'fldw37ejsG',   // Nền tảng (select)
        followers: 'fldEw1cY9m',  // Follower cuối ngày
        followUp: 'fld3y8pj8A',   // Follower tăng
        followDown: 'fld13wCHqg', // Follower giảm
        views: 'fldy02Z82B',      // Lượt xem
        viewsOrganic: 'fldKBN92x0', // Lượt xem tự nhiên (không do quảng cáo đẩy)
        watchTime: 'fldgbcpIOP',  // Thời gian xem video (giây)
        reach: 'fldaVYHFEa',      // Lượt tiếp cận
        impressions: 'fldkwBo77E', // Lượt hiển thị
        profileViews: 'fldFIGjEJv', // Lượt xem hồ sơ
        likes: 'fldl50U80K',      // Thích
        comments: 'fldDiIQtQB',   // Bình luận
        shares: 'fldRD63K6u',     // Chia sẻ
        saves: 'fldipLS0Os',      // Lưu
        engagement: 'fldSTZjBJg', // Tương tác
        clicks: 'fld0jkPkaq',     // Click liên kết
        messages: 'fldE90WfiC',   // Tin nhắn
        leads: 'fld6mPO82Q',      // Lead
        posts: 'fldvIhDx2r',      // Số bài đăng
        lives: 'fldByXxg8j',      // Số phiên LIVE
        source: 'fldNoaAOEN',     // Nguồn (select)
        updated: 'fldXh51DGj',
      },
    },
    post: {
      id: 'tblnVpF5EuY6qbGQ',
      name: 'Bài đăng',
      f: {
        key: 'fldyD8W8WC',        // ⚙️ Khoá <nền tảng>#<ID bài> — primary
        title: 'fldTC2UptK',      // Tiêu đề / Caption
        channel: 'fldDyS7csc',    // Kênh (link)
        platform: 'fld4JCOXKh',
        extId: 'fldIXRRFY4',      // ID bài
        publishedAt: 'fldzYqe8NN', // Đăng lúc
        type: 'fld33p0yp2',       // Loại (select)
        url: 'fldqMSCAIE',
        views: 'fldRepdQ9S',
        reach: 'flds3tY1nR',
        impressions: 'fldqf2XjbC',
        likes: 'fldEVfDnEY',
        comments: 'fldcRxkt99',
        shares: 'fldzQdIzo5',
        saves: 'fldX4AwTnK',
        engagement: 'fldObq3u9I',
        avgWatch: 'fldxmGtwAX',   // Thời gian xem TB (giây)
        fullWatchRate: 'fld9JMP8OL', // Tỷ lệ xem hết (0..1)
        engRate: 'fld1XhQdGE',
        /* Nhãn gắn TAY hoặc gắn BÙ cho bài cũ chưa có hashtag. Đồng bộ không bao
         * giờ ghi cột này (nó không nằm trong dòng mà sync dựng), và "Nạp lại từ
         * đầu" chỉ xoá bảng Ngày chứ không xoá bảng Bài — nên gắn một lần là giữ
         * được mãi. */
        labels: 'fld5AZLSH9',    // Tỷ lệ tương tác (0..1)
        /* Người đăng — gán TAY, và chỉ gán tay được. Facebook không cho biết ai
         * đăng bài nào: trường admin_creator còn trong tài liệu nhưng luôn rỗng với
         * Trang kiểu mới, kể cả khi hỏi bằng mã của người thật có business_management.
         * Đồng bộ KHÔNG BAO GIỜ ghi cột này — cùng lý do với cột Nhãn ở trên. */
        poster: 'fld8RB5agE',
        /* Bài này làm để BÁN HÀNG hay để TƯƠNG TÁC — quyết định hệ số quy đổi
         * khi app KPI chấm điểm (×1,0 và ×0,2). Điền tự động từ hashtag bằng
         * `muc-dich.js`; trống thì app KPI chặn chốt tháng chứ không tự đoán. */
        mucDich: 'fldW3g7168',
        source: 'fldbcgFFf0',
        updated: 'fldG6bq0Fk',
      },
    },
    live: {
      id: 'tblZU6tSd9ssNrxv',
      name: 'Phiên LIVE',
      f: {
        key: 'fldFkIAO12',        // ⚙️ Khoá — primary
        title: 'fldlRkhItC',
        channel: 'fldQkD4e8k',
        platform: 'fldBFSarxc',
        extId: 'fldzWwpits',
        start: 'fld33FcDZQ',
        end: 'fldnSpuZgR',
        minutes: 'fldg9lkmvk',
        views: 'fldVEJtJqa',
        peak: 'fld4XnApl2',       // Người xem cao nhất
        comments: 'fldKimM0DG',
        likes: 'fldSU0jxYc',
        shares: 'fld1UxPhCI',
        newFollows: 'fld2la7bx0',
        /* Ba cột TIỀN — không nền tảng nào cho, app tự gắn từ Tourwell theo
         * khung giờ phiên. Xem tien-live.js để biết phép gắn và chỗ nó yếu. */
        messages: 'fldX9s9F89',   // Hội thoại MỚI trên Pancake trong khung giờ phiên
        leads: 'fldHn9Ed6q',      // Lead Tourwell rơi vào khung giờ phiên
        orders: 'fldUS8LQkT',     // Đơn của những lead ấy
        revenue: 'fld3cusEuH',    // Doanh thu của những đơn ấy
        url: 'fldg4iX4he',
        source: 'fldXG5H6TJ',
        updated: 'fldNN6cfPe',
      },
    },
    label: {
      id: 'tbl7hTSAe9vTikii',
      name: 'Nhãn bài',
      f: {
        name: 'fld7xYrezp',       // ⚙️ Nhãn — primary
        group: 'fldCc4xueb',      // Nhóm (select)
        hashtag: 'fldcmUAbJn',    // Hashtag, cách nhau bằng dấu cách hoặc phẩy
        partner: 'fldh2ekOfo',    // Đối tác
        on: 'fldwEQKFnN',         // Bật (checkbox)
        note: 'fldjE997q5',
        /* CHỈ dùng cho lần gắn bù bài cũ. Bài từ nay trở đi nhận nhãn bằng
         * hashtag, đúng như quy định anh Hùng ra cho đội nội dung. */
        keywords: 'fldXW92ZaV',
      },
    },
    alert: {
      id: 'tblIBfXZ8OeJ3RXR',
      name: 'Cảnh báo',
      f: {
        key: 'fldyeO0Rgp',        // ⚙️ Khoá chống gửi trùng — primary
        type: 'fldmIUex8P',       // Loại (select)
        level: 'fldFqdQjuP',      // Mức (select)
        platform: 'fldprn60Ee',
        channel: 'fldJZsPMkV',
        content: 'fldLXO3nwC',
        at: 'fld4HJRcWf',         // Phát hiện lúc (datetime)
        sent: 'fld1dm3Jin',       // Đã gửi (checkbox)
        sentAt: 'fldSeQoXhl',
      },
    },
    /* Người đăng CHƯA khớp được bài — hàng chờ nằm ở MÁY CHỦ.
     *
     * Trước đây hàng chờ chỉ nằm trong trình duyệt người đăng, và tiện ích chỉ
     * thử lại khi tab Facebook còn mở. Bài hẹn giờ thì gần như luôn lên sóng
     * SAU khi người ta đã tắt máy: lúc còn thử thì chưa có bài để khớp, lúc có
     * bài thì không còn ai thử. Đã mất thật một bài như thế (bắt 10:24, thử lần
     * cuối 11:05, bài lên sóng 12:01).
     *
     * Giữ ở đây thì sau mỗi lần đồng bộ máy chủ tự khớp lại, không phụ thuộc
     * vào việc ai có mở Facebook hay không. */
    pending: {
      id: 'tblNWDKia355rJ0e',
      name: 'Người đăng chờ khớp',
      f: {
        van: 'fld2dDfPSL',        // Vân nội dung (40 ký tự đầu, đã chuẩn hoá) — primary
        nguoi: 'fldZSDaL58',      // Người đăng
        nenTang: 'fld1lh4BK0',    // Nền tảng (select): Facebook | TikTok
        /* Kênh mà người đăng đang chọn lúc bấm Đăng. Chỉ TikTok mới cần: một
         * clip hay được đăng lên nhiều trong sáu kênh, caption giống hệt nhau,
         * không có gợi ý kênh thì phép khớp bỏ qua cả hai cho an toàn. */
        kenh: 'fldY2xNCri',
        batLuc: 'fldTNTLhR1',     // Bắt lúc (text ISO)
        thuCuoi: 'fldqJxu5bc',    // Thử lần cuối (text ISO)
        soLan: 'fldhP9mVX9',      // Số lần thử
        trangThai: 'fldfFB8nQB',  // Trạng thái (select): Đang chờ | Quá hạn
        ghiChu: 'fld7jx66sC',
      },
    },
    log: {
      id: 'tblwHw0DuyA1bW8t',
      name: 'Nhật ký đồng bộ',
      f: {
        at: 'fld4PiCDVK',         // Lúc (text ISO) — primary
        platform: 'fldGKG3Mpu',
        ranAt: 'fld1oNDgkR',      // Chạy lúc (datetime)
        from: 'fld7y28xGO',
        to: 'fldk0Fmplm',
        result: 'fldSBP12t6',     // Kết quả (select)
        rowsDaily: 'fldBZGPNkT',
        rowsPost: 'fldLlNlLrx',
        rowsLive: 'fldDOjV5mL',
        seconds: 'fldPKrj8vM',
        message: 'fldxjrHfmW',
      },
    },
    vault: {
      id: 'tblbn4fdhv34XdUP',
      name: 'Kho khoá (mã hoá)',
      f: {
        key: 'fldxsrSqwI',        // Khoá (tên ngăn) — primary
        blob: 'fldEhYMVv1',       // Nội dung (ciphertext)
        at: 'fldJFpms1i',         // Ghi lúc
        note: 'fldRLWGBR2',
      },
    },
  },

  /* Tên nền tảng dùng thống nhất từ adapter → Base → giao diện. Đúng option của
   * cột select "Nền tảng"; sai một chữ là Lark từ chối ghi. */
  platforms: ['TikTok', 'Facebook', 'Instagram', 'Zalo OA', 'Douyin', 'Xiaohongshu', 'YouTube'],

  /* Nền tảng có adapter API. Còn lại là nhập tay. */
  platformsApi: ['TikTok', 'Facebook', 'Instagram', 'Zalo OA'],
};
