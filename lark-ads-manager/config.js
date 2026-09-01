'use strict';
/**
 * Cấu hình app quản lý quảng cáo đa nền tảng trên Lark Base
 * "Quản lý Quảng cáo TikTok & Facebook" (Rooty Trip).
 *
 * Mọi ID field/table đều lấy từ +table-list / +field-list thật của base,
 * KHÔNG đoán. Đọc/ghi bằng field ID để không phụ thuộc tên cột (tên cột có
 * emoji và có thể bị đổi).
 */
const path = require('path');

const npmRoot = process.env.LARK_NPM_ROOT ||
  path.join(process.env.APPDATA || path.join(require('os').homedir(), 'AppData/Roaming'), 'npm/node_modules');

module.exports = {
  port: Number(process.env.PORT || 5176),
  identity: process.env.LARK_IDENTITY || 'user',

  /* cli: dùng phiên lark-cli của máy · api: gọi Open API bằng app credentials
     (dùng khi deploy server chung; danh tính người dùng do lớp vỏ truyền xuống). */
  mode: process.env.LARK_MODE ||
    ((process.env.LARK_APP_ID && process.env.LARK_APP_SECRET) ? 'api' : 'cli'),
  appId: process.env.LARK_APP_ID || '',
  appSecret: process.env.LARK_APP_SECRET || '',
  apiHost: process.env.LARK_API_HOST || 'https://open.larksuite.com',

  // Gọi trực tiếp script Node của lark-cli để tránh lỗi launcher .cmd trên Windows
  cliScript: process.env.LARK_CLI_SCRIPT ||
    path.join(npmRoot, '@larksuite/cli/scripts/run.js'),

  baseToken: process.env.LARK_BASE_TOKEN || 'WmWvbjjFQaiRmjsd3Z7lumQXgeb',
  baseUrl: 'https://rootytrip2.sg.larksuite.com/base/WmWvbjjFQaiRmjsd3Z7lumQXgeb',

  // Múi giờ hiển thị của base (Lark render TEXT() theo giờ instance)
  tzOffsetHours: 8,

  // Ngưỡng mục tiêu mặc định — ghi đè được trong muc-tieu.json
  targetsFile: process.env.LARK_TARGETS_FILE || 'muc-tieu.json',

  // Khai báo kết nối nền tảng quảng cáo (token để ngoài git)
  connectFile: process.env.LARK_CONNECT_FILE || 'ket-noi.json',

  cacheTtlMs: Number(process.env.LARK_CACHE_TTL || 60000),

  tables: {
    campaign: {
      id: 'tblAjZnCNCkGU6jq',
      name: 'Chiến dịch',
      f: {
        name: 'fldAXoJPjC',          // 🟢 Tên chiến dịch (text)
        platform: 'fldPasKizh',      // 🟢 Nền tảng (select)
        objective: 'flddXyLjok',     // 🟢 Mục tiêu (select)
        budget: 'fldsKcnzcL',        // 🟢 Ngân sách dự kiến (number)
        dailyBudget: 'fld8vrqyEC',   // 🟢 Ngân sách/ngày (number)
        start: 'fldD6Du4du',         // 🟢 Ngày bắt đầu (datetime)
        end: 'fldVrcsQx9',           // 🟢 Ngày kết thúc (datetime)
        status: 'fldR3MY85b',        // 🟢 Trạng thái (select)
        owner: 'fldbzYfHci',         // 🟢 Người phụ trách (user)
        note: 'fldir2tcKV',          // 🟢 Ghi chú (text)
        products: 'fldlHJfhMy',      // 🟢 Sản phẩm & Tour (link)
        groups: 'fldrqhLs2q',        // DS nhóm (link)
        extId: 'fldETCLdHB',         // ⚙️ ID chiến dịch (nền tảng) — khoá đồng bộ
        // chỉ đọc
        spendLark: 'fld1dEeuJT',
        cpaLark: 'fldlDUWIey',
      },
    },
    group: {
      id: 'tblwz78ln8gTPwcH',
      name: 'Nhóm quảng cáo',
      f: {
        name: 'fldXaY1byy',          // Tên nhóm quảng cáo (text)
        campaign: 'fldas23WP4',      // Chiến dịch (link)
        ads: 'fldhxITpzj',           // DS quảng cáo (link)
        budget: 'fldBGVOEnT',        // Ngân sách nhóm (number)
        status: 'fldFu56yuh',        // Trạng thái (select)
        optimize: 'fldeei54YR',      // Tối ưu theo (select)
        placement: 'fldVeT5UFv',     // Vị trí hiển thị (select)
        audience: 'fldLi2qC6e',      // Đối tượng mục tiêu (text)
        extId: 'fldbTEcuYc',         // ⚙️ ID nhóm (nền tảng)
      },
    },
    ad: {
      id: 'tblr1AYMHrkAQrrB',
      name: 'Quảng cáo',
      f: {
        name: 'fldvigbmAn',          // Tên quảng cáo (text)
        group: 'fldolsdNWR',         // Nhóm quảng cáo (link)
        daily: 'fld691nv1S',         // BC ngày (link)
        creative: 'fldMY4m6Gr',      // Loại creative (select)
        approval: 'fldnbyueb9',      // Trạng thái duyệt (select)
        url: 'fldMwd0cOj',           // Link Creative (text/url)
        caption: 'fldRzjUyZn',       // Nội dung/Caption (text)
        file: 'fld57Tyuxg',          // File creative (attachment)
        extId: 'fldlDV60uX',         // ⚙️ ID quảng cáo (nền tảng)
      },
    },
    daily: {
      id: 'tblzQQR2YmeHQrlN',
      name: 'Hiệu suất theo ngày',
      f: {
        date: 'fld3aO1Ptl',          // 🟡 Ngày (datetime)
        dateKey: 'flddsOgCFb',       // Ngày (khóa) — formula TEXT()
        ad: 'fld30H8ghn',            // 🟡 Thuộc QC (link)
        spend: 'fldwUmqSB1',         // 🟡 Chi tiêu (number)
        impressions: 'fld3w8eYaI',   // 🟡 Lượt hiển thị (number)
        clicks: 'fldFAhvHbw',        // 🟡 Lượt click (number)
        conversions: 'fldfholNwH',   // 🟡 Lượt chuyển đổi (number)
        label: 'fldd0g2iGZ',         // 🟡 Nhãn (text)
        source: 'fldTCHUOGj',        // ⚙️ Nguồn (select): Nhập tay | Meta API | TikTok API | Google Ads | CSV
      },
    },
    product: {
      id: 'tblZnZkaNPthl7WE',
      name: 'Sản phẩm & Tour',
      f: {
        name: 'fldTB5faPV',
        code: 'fldG0Hg5pd',
        type: 'fldG3ocd2B',
        price: 'fldmwEquHb',
        destination: 'fld1ID61kf',
        desc: 'fldku5Pnfw',
        campaigns: 'fld4ZCZ2uc',
      },
    },
    sales: {
      id: 'tblpToZtyNw5SBov',
      name: 'Báo cáo Sales (theo ngày)',
      f: {
        channel: 'fldQlmsW9T',       // Kênh (select)
        dateKey: 'fldBpRlbQF',       // Ngày (khóa) — formula
        time: 'fld7J31Ugc',          // Thời gian báo cáo (datetime)
        status: 'fld5UQx5Ya',        // Trạng thái (select)
        revenue: 'fldus7mFII',       // Doanh thu (number)
        service: 'fldfeajjJ9',       // Tên dịch vụ sử dụng (select)
        staff: 'fldECpf3TS',         // Nhân viên Sales (user)
        customer: 'fld93khXlq',
        phone: 'fldsUdYIsu',
        province: 'fldn5MOnhc',
        country: 'fldLgPzJo8',
        note: 'fldFxapkUY',
        // Khoá để ghi lại nhiều lần không sinh dòng trùng. Theo quy ước ⚙️ cho
        // cột do máy quản lý, giống các cột ID nền tảng ở ba bảng kia.
        orderCode: 'fldyWhdTOa',   // ⚙️ Mã đơn Tourwell
      },
    },
  },

  // Nền tảng nhận biết được (khớp option select "🟢 Nền tảng")
  platforms: ['Facebook', 'TikTok', 'Google Ads'],
};
