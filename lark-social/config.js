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
        engRate: 'fld1XhQdGE',    // Tỷ lệ tương tác (0..1)
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
        url: 'fldg4iX4he',
        source: 'fldXG5H6TJ',
        updated: 'fldNN6cfPe',
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
