/**
 * Hàng rào cho những lệnh TIÊU TIỀN.
 *
 * Đây là phần duy nhất trong app ghi ra ngoài Lark Base: nó bật/tắt quảng cáo và
 * đổi ngân sách thật. Sai ở đây không phải là một con số hiện lệch trên màn hình —
 * là tiền chạy hoặc tiền dừng. Nên bốn hàng rào đều có test riêng, và mỗi test
 * ghi lại VÌ SAO hàng rào đó tồn tại.
 *
 * Không gọi mạng: mọi hàm nhận `deps` để tiêm getJson/postJson giả. Bộ test mà
 * gọi thật thì hoặc nó đổi cấu hình quảng cáo của công ty, hoặc nó không chạy
 * được khi mất mạng — cả hai đều không dùng được.
 */
const dk = require('../sync/dieukhien');

let pass = 0, fail = 0;
const t = (n, c, x = '') => {
  if (c) { pass += 1; console.log('  ok  ' + n); }
  else { fail += 1; console.log('  FAIL ' + n + (x ? '  → ' + x : '')); }
};

console.log('— hàng rào 1: đơn vị tiền KHÔNG được đoán');
{
  /* Đo trên tài khoản thật (VND): Meta trả daily_budget 300000 cho ngân sách
   * 300.000đ, tức hệ số 1. Tiền có hào thì hệ số 100. Đoán sai là lệch 100 lần —
   * gửi 500.000 thành 5.000đ hoặc 50.000.000đ. */
  t('VND hệ số 1 (đã đo trên tài khoản thật)', dk.heSoTien('VND') === 1);
  t('không phân biệt hoa thường', dk.heSoTien('vnd') === 1);
  /* Tiền chưa đo thì trả null để bên gọi TỪ CHỐI. Trả 1 cho chắc là đoán, và
   * đoán ở đây là sai 100 lần với mọi tiền có hào. */
  t('USD chưa đo thì trả null, không đoán', dk.heSoTien('USD') === null);
  t('tiền rỗng cũng trả null', dk.heSoTien('') === null);
  t('tiền lạ trả null', dk.heSoTien('XYZ') === null);
}

console.log('— hàng rào 2: một lệnh chỉ đổi ngân sách tối đa ±50%');
{
  /* Gõ thêm một số 0 là chuyện xảy ra thật. Muốn tăng gấp ba thì bấm ba lần,
   * mỗi lần nhìn lại số một lần. */
  t('tăng 20% thì cho', dk.kiemBienDo(500000, 600000).ok);
  t('giảm 20% thì cho', dk.kiemBienDo(500000, 400000).ok);
  t('tăng đúng 50% thì cho', dk.kiemBienDo(500000, 750000).ok);
  t('giảm đúng 50% thì cho', dk.kiemBienDo(500000, 250000).ok);
  t('tăng 51% thì chặn', !dk.kiemBienDo(500000, 755000).ok);

  /* Ca thật đáng sợ nhất: gõ thêm một số 0. */
  const themSo0 = dk.kiemBienDo(500000, 5000000);
  t('gõ thêm một số 0 thì chặn', !themSo0.ok);
  t('lời từ chối in ra CẢ hai con số', /500\.000đ/.test(themSo0.vi) && /5\.000\.000đ/.test(themSo0.vi),
    themSo0.vi);
  t('lời từ chối nói cách làm tiếp', /bấm nhiều lần/.test(themSo0.vi));

  t('số mới bằng 0 thì chặn', !dk.kiemBienDo(500000, 0).ok);
  t('số mới âm thì chặn', !dk.kiemBienDo(500000, -100000).ok);

  /* Chưa có ngân sách cũ thì không có biên độ nào để so — cho qua nhưng đánh dấu
   * `lanDau` để giao diện biết là không có hàng rào nào chắn lệnh này. */
  const dau = dk.kiemBienDo(0, 500000);
  t('chưa có ngân sách cũ thì cho qua', dau.ok);
  t('và đánh dấu là lần đầu', dau.lanDau === true);
}

console.log('— hàng rào 3: chỉ ghi khi ĐO ĐƯỢC là có quyền');
{
  const gia = (data) => ({ getJson: async () => data });

  (async () => {
    /* Meta: ads_read cho ĐỌC insights nhưng không cho bật/tắt. Đo ngày
     * 10/09/2026 trên token đang dùng: đúng là chỉ có ads_read. */
    const chiDoc = await dk.metaKhaNang({ enabled: true, accessToken: 'x' },
      gia({ data: { scopes: ['ads_read', 'read_insights'] } }));
    t('Meta chỉ có ads_read thì KHÔNG ghi được', chiDoc.ghi === false);
    t('và nói rõ thiếu gì', /ads_read/.test(chiDoc.vi));
    t('và chỉ cách cấp quyền', /ads_management/.test(chiDoc.cachSua || ''));
    t('cách cấp nói rõ không phải sửa code', /không phải sửa code/i.test(chiDoc.cachSua || ''));

    const coQuyen = await dk.metaKhaNang({ enabled: true, accessToken: 'x' },
      gia({ data: { scopes: ['ads_read', 'ads_management'] } }));
    t('Meta có ads_management thì ghi được', coQuyen.ghi === true);

    /* Kênh tắt hoặc chưa có token thì trả false NGAY, không gọi mạng. */
    const tat = await dk.metaKhaNang({ enabled: false, accessToken: 'x' },
      { getJson: async () => { throw new Error('không được gọi mạng'); } });
    t('kênh đang tắt thì không gọi mạng', tat.ghi === false);

    /* TikTok: dò bằng một lời gọi CHỈ ĐỌC. Đo thật: cả năm advertiser trả
     * code 40001 "lacks the required scope". */
    const ttThieu = await dk.ttKhaNang({ enabled: true, accessToken: 'x', advertiserIds: ['1'] },
      gia({ code: 40001, message: "Permission error: The access token lacks the required scope for endpoint '/ad/get/(method=GET)'." }));
    t('TikTok thiếu scope thì KHÔNG ghi được', ttThieu.ghi === false);
    t('và nói đúng tên nhóm quyền', /Ad Account Management/.test(ttThieu.cachSua || ''));
    /* Giữ nguyên câu TikTok trả về, để tra khi cần. */
    t('và giữ lại câu gốc của TikTok', /lacks the required scope/.test(ttThieu.loiGoc || ''));

    const ttOk = await dk.ttKhaNang({ enabled: true, accessToken: 'x', advertiserIds: ['1'] },
      gia({ code: 0, data: { list: [] } }));
    t('TikTok code 0 thì ghi được', ttOk.ghi === true);

    /* Lỗi KHÁC thì trả null — chưa biết, không phải "không được". Trả false ở
     * đây là kết luận sai từ một lỗi mạng nhất thời. */
    const ttLa = await dk.ttKhaNang({ enabled: true, accessToken: 'x', advertiserIds: ['1'] },
      gia({ code: 40100, message: 'Something else entirely' }));
    t('TikTok lỗi khác thì trả null (chưa biết)', ttLa.ghi === null);

    /* Google: scope auth/adwords gồm cả ghi, nên đủ cấu hình là uỷ quyền xong. */
    t('Google đủ cấu hình thì ghi được',
      dk.gaKhaNang({ enabled: true, refreshToken: 'r', developerToken: 'd' }).ghi === true);
    t('Google thiếu developer token thì không',
      dk.gaKhaNang({ enabled: true, refreshToken: 'r' }).ghi === false);
    /* Không hứa chắc: developer token mức Test vẫn bị Google chặn. */
    t('Google nói rõ vẫn có thể bị từ chối ở mức developer token',
      /developer token/i.test(dk.gaKhaNang({ enabled: true, refreshToken: 'r', developerToken: 'd' }).vi));

    await phanDoc();
    await phanNganSachTikTok();
    await phanLoi();
    ketThuc();
  })();
}

/* ---- đọc theo đúng cấp, và trạng thái thật ---- */
async function phanDoc() {
  console.log('— đọc phải hỏi ĐÚNG trường theo từng cấp');
  const hoi = [];
  const gia = (data) => ({
    getJson: async (url) => { hoi.push(url); return data; },
  });

  /* Một quảng cáo KHÔNG có daily_budget. Hỏi bừa thì Meta trả
   * `(#100) Tried accessing nonexisting field (daily_budget)` và cả lệnh chết,
   * dù việc đang làm chỉ là bật/tắt. Tôi đã mắc đúng lỗi này ở bản đầu. */
  hoi.length = 0;
  await dk.metaDoc({ accessToken: 'x' }, '123', 'quang-cao',
    gia({ name: 'QC', status: 'ACTIVE', effective_status: 'ACTIVE', adset_id: '9', campaign_id: '8', account_id: '7' }));
  t('cấp quảng cáo KHÔNG hỏi daily_budget', !/daily_budget/.test(hoi[0]), hoi[0]);
  t('cấp quảng cáo có hỏi adset_id và campaign_id',
    /adset_id/.test(hoi[0]) && /campaign_id/.test(hoi[0]));

  hoi.length = 0;
  const nhom = await dk.metaDoc({ accessToken: 'x' }, '9', 'nhom',
    gia({ name: 'Nhóm', status: 'ACTIVE', effective_status: 'CAMPAIGN_PAUSED', daily_budget: '500000', lifetime_budget: '0' }));
  t('cấp nhóm có hỏi daily_budget', /daily_budget/.test(hoi[0]));
  t('ngân sách đọc ra đúng số', nhom.nganSachNgay === 500000, String(nhom.nganSachNgay));

  /* Đây là chỗ app dễ nói sai nhất: nhóm ACTIVE mà thực tế không chạy vì chiến
   * dịch đang tắt. Đo được trên tài khoản thật. Chỉ hiện `status` là nói sai. */
  t('giữ CẢ trạng thái riêng và trạng thái thật',
    nhom.trangThai === 'ACTIVE' && nhom.trangThaiThat === 'CAMPAIGN_PAUSED',
    `${nhom.trangThai} / ${nhom.trangThaiThat}`);

  /* daily_budget vắng mặt phải ra null, KHÔNG ra 0: 0 nghĩa là "ngân sách bằng
   * không", vắng nghĩa là "ngân sách không đặt ở cấp này" (CBO). Lẫn hai cái là
   * ghi một con số vào cấp mà Facebook sẽ bỏ qua. */
  const cbo = await dk.metaDoc({ accessToken: 'x' }, '9', 'nhom',
    gia({ name: 'Nhóm CBO', status: 'ACTIVE', effective_status: 'ACTIVE' }));
  t('không có daily_budget thì ra null, không ra 0', cbo.nganSachNgay === null,
    String(cbo.nganSachNgay));
}

/* ---- TikTok: ngân sách 0 KHÔNG phải là ngân sách bằng không ---- */
async function phanNganSachTikTok() {
  console.log('— TikTok: nhóm không giữ ngân sách phải ra null, không ra 0');
  const gia = (g) => ({ getJson: async () => ({ code: 0, data: { list: [g] } }) });

  /* Đo thật trên cả bốn nhóm quảng cáo của công ty:
   *   MienTay_CT7        budget=0  budget_mode=BUDGET_MODE_INFINITE
   *   Daily_Tour Đảo_01  budget=0  budget_mode=BUDGET_MODE_INFINITE
   * INFINITE nghĩa là nhóm KHÔNG giữ ngân sách — nó nằm ở cấp chiến dịch. Đọc
   * thành 0 thì hai chuyện bị lẫn, và hậu quả không chỉ là hiển thị sai:
   * kiemBienDo(0, x) coi đó là lần đặt đầu tiên nên THÁO luôn hàng rào ±50%. */
  const vo = await dk.ttDocNhom({ accessToken: 'x' }, '1', '2',
    gia({ adgroup_name: 'Daily_Tour Đảo_01', budget: 0, budget_mode: 'BUDGET_MODE_INFINITE',
      operation_status: 'ENABLE', secondary_status: 'ADGROUP_STATUS_DELIVERY_OK' }));
  t('BUDGET_MODE_INFINITE thì ngân sách ra null', vo.nganSachNgay === null, String(vo.nganSachNgay));
  t('vẫn giữ lại kiểu ngân sách để giải thích được',
    vo.kieuNganSach === 'BUDGET_MODE_INFINITE', vo.kieuNganSach);

  const co = await dk.ttDocNhom({ accessToken: 'x' }, '1', '2',
    gia({ adgroup_name: 'Có ngân sách', budget: 300000, budget_mode: 'BUDGET_MODE_DAY',
      operation_status: 'ENABLE', secondary_status: 'ADGROUP_STATUS_DELIVERY_OK' }));
  t('nhóm có ngân sách thật thì đọc ra số', co.nganSachNgay === 300000, String(co.nganSachNgay));

  /* Và đây là lý do phải phân biệt: nếu để 0 thì hàng rào biến mất. */
  t('so với null thì KHÔNG được coi là lần đặt đầu tiên',
    dk.kiemBienDo(300000, 900000).ok === false);
  t('còn so với 0 thì hàng rào bị tháo — đúng như lo ngại',
    dk.kiemBienDo(0, 900000).lanDau === true);
}

/* ---- lỗi phải nói đúng nguyên nhân ---- */
async function phanLoi() {
  console.log('— lỗi phải nói ĐÚNG nguyên nhân');
  /* Bản đầu tôi nuốt mọi phản hồi không có `list` rồi báo "không tìm thấy quảng
   * cáo". Nên khi token thiếu scope, app nói sai hẳn nguyên nhân và anh Hùng sẽ
   * đi tìm quảng cáo thay vì đi cấp quyền. */
  let loi = '';
  try {
    await dk.ttChuQuangCao({ accessToken: 'x', advertiserIds: ['1'] }, '999',
      { getJson: async () => ({ code: 40001, message: "Permission error: The access token lacks the required scope for endpoint '/ad/get/'" }) });
  } catch (e) { loi = e.message; }
  t('thiếu quyền TikTok thì nói thiếu quyền', /thiếu nhóm quyền/.test(loi), loi);
  t('và nói rõ KHÔNG phải vì không tìm thấy', /không phải vì không tìm thấy/.test(loi));

  /* Còn khi TikTok trả về bình thường mà không có dòng nào thì đúng là không
   * tìm thấy — lúc đó trả null, không ném. */
  const khong = await dk.ttChuQuangCao({ accessToken: 'x', advertiserIds: ['1'] }, '999',
    { getJson: async () => ({ code: 0, data: { list: [] } }) });
  t('không có dòng nào thì trả null (đúng là không tìm thấy)', khong === null);
}

/* ---- link mở nền tảng: nhãn phải nói đúng nó mở cái gì ---- */
console.log('— link mở nền tảng nói đúng nó mở CÁI GÌ');
{
  const fb = dk.lienKetNenTang('Facebook', { taiKhoanId: 'act_123', adExtId: '888' });
  t('Facebook lọc được tới từng quảng cáo', /selected_ad_ids=888/.test(fb.url), fb.url);
  t('và bỏ tiền tố act_ trong tham số act', /act=123(&|$)/.test(fb.url), fb.url);
  t('nhãn Facebook hứa đúng: mở quảng cáo này', /quảng cáo này/.test(fb.nhan));

  /* TikTok và Google chỉ tới được tài khoản. Hứa "mở quảng cáo này" rồi nhảy ra
   * trang tài khoản là một lời nói sai nhỏ, nhưng vẫn là nói sai. */
  const tt = dk.lienKetNenTang('TikTok', { advertiserId: '77' });
  t('nhãn TikTok chỉ hứa mở tài khoản', /tài khoản/.test(tt.nhan) && !/quảng cáo này/.test(tt.nhan));
  const ga = dk.lienKetNenTang('Google Ads', { customerId: '55' });
  t('nhãn Google chỉ hứa mở tài khoản', /tài khoản/.test(ga.nhan) && !/quảng cáo này/.test(ga.nhan));

  t('thiếu id thì không dựng link giả', dk.lienKetNenTang('Facebook', {}) === null);
  t('nền tảng lạ thì không dựng link', dk.lienKetNenTang('Zalo Ads', { taiKhoanId: '1' }) === null);
}

function ketThuc() {
  console.log(`\n${pass} pass · ${fail} fail`);
  process.exitCode = fail ? 1 : 0;
}
