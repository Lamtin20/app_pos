/** Sheet header constants ported from Code (10).gs */

export const MENU_HEADERS_BASE = [
  'ID', 'Tên', 'Danh mục', 'Giá cơ bản', 'Mô tả', 'Hình ảnh', 'Thành phần',
  'Còn hàng', 'Phổ biến', 'Ghi chú', 'Giá vốn', 'Phí VH',
];

export const MENU_HEADERS_EXTRA = [
  'Ảnh bìa', 'Giảm ly nhỏ', 'Phụ thu ly lớn', 'Bật cỡ nhỏ', 'Bật cỡ thường',
  'Bật cỡ lớn', 'Phụ thu chai nhựa', 'Định mức size (JSON)', 'Phụ thu gia đình 500ml',
  'Phụ thu gia đình 1L', 'Giá bán chai 500ml', 'Giá bán chai 1 lít',
  'Calo ước (kcal)', 'Protein ước (g)', 'Chất béo ước (g)', 'Công dụng', 'Nhãn HV', 'Tag HV',
  'Topping (JSON)',
];

export const PROMO_HEADERS_EXTRA = ['Quy tắc', 'Cấu hình JSON'];

export const ORDERS_HEADERS_STD = [
  'Mã ĐH', 'Thời gian', 'Tên KH', 'SĐT', 'Điểm thành viên', 'Các món', 'Tổng tiền',
  'Giảm giá', 'Thanh toán', 'Phương thức TT', 'Ghi chú', 'Trạng thái', 'Mã KM',
];

export const MIXHAT_HEADERS = [
  'ID', 'Tên hạt', 'Mô tả', 'Giá bán', 'Định lượng Mix', 'Ảnh', 'Bật', 'Thứ tự',
];

export const GROUP_ORDERS_HEADERS = [
  'Mã nhóm', 'SĐT chủ nhóm', 'Tên chủ nhóm', 'Trạng thái', 'Tạo lúc', 'Cập nhật', 'Dữ liệu', 'Mã ĐH',
];

export const FEEDBACK_VOUCHER_HEADERS = [
  'Mã voucher', 'SĐT', 'Giảm (%)', 'Phát hành', 'Hết hạn', 'Trạng thái', 'Từ đơn', 'Dùng cho đơn',
];

export const WELCOME_MEMBER_VOUCHER_HEADERS = [
  'Mã voucher', 'SĐT', 'Giảm (%)', 'Phát hành', 'Hết hạn', 'Trạng thái', 'Dùng cho đơn',
];

export const OFFICE_STREAK_TRACK_HEADERS = [
  'SĐT', 'Tuần (T2)', 'Chuỗi', 'Mã voucher', 'Cập nhật',
];

export const OFFICE_STREAK_VOUCHER_HEADERS = [
  'Mã voucher', 'SĐT', 'Giá tối đa', 'Phát hành', 'Hết hạn', 'Trạng thái', 'Dùng cho đơn',
];

export const SUN_REDEEM_VOUCHER_HEADERS = [
  'Mã voucher', 'SĐT', 'Giá tối đa', 'Sun đã đổi', 'Phát hành', 'Hết hạn', 'Trạng thái', 'Dùng cho đơn',
  'Menu ID', 'Tên món', 'Ảnh món',
];

export const SUN_REDEEM_VOUCHER_DAYS = 30;
export const SUN_REDEEM_DEFAULT_MAX = 65000;

export const SUPPLIERS_HEADERS_EXTRA = ['Zalo'];

export const MEMBER_CUSTOMER_EXT_HEADERS = [
  'Email', 'Ngày sinh', 'Giới tính', 'Địa chỉ JSON', 'Khóa hồ sơ', 'Mã HV', 'Ảnh đại diện',
];

export const MEMBERSHIP_PKG_HEADERS = [
  'Mã gói', 'Loại', 'Tên gói', 'Giá', 'Số buổi', 'Món chính', 'Cost ước tính',
  'Mô tả', 'Hiển thị', 'Kiểu gói', 'Khuyến mãi', 'Nhãn ribbon', 'Ảnh gói', 'Giá niêm yết',
];

export const MEMBERSHIP_SUB_HEADERS = [
  'Mã ĐK', 'SĐT', 'Tên KH', 'Mã gói', 'Loại', 'Bắt đầu', 'Kết thúc', 'Địa chỉ',
  'Link Maps', 'Hạng', 'Trạng thái', 'Buổi đã giao', 'Ghi chú',
];

export const MEMBERSHIP_SUB_HEADERS_EXTRA = [
  'Tỉnh/TP', 'Xã/Phường', 'Địa chỉ chi tiết', 'Điểm nhận', 'Món yêu thích', 'Lịch giao KH',
];

export const CONFIG_HEADERS = [
  'Mã', 'Loại', 'Tên nguyên liệu', 'ĐVT', 'Nhà cung cấp', 'Quy cách', 'Giá sỉ',
  'Định lượng Mix', 'Giá bán Mix', 'Ghi chú',
];

export const CUSTOMERS_HEADERS = [
  'SĐT', 'Tên', 'Điểm', 'Tổng chi tiêu', 'Số lần ghé', 'Lần đầu', 'Lần cuối', 'Hạng', 'Ghi chú',
];

export const PROMOTIONS_HEADERS = [
  'Mã KM', 'Tên', 'Loại', 'Giá trị', 'Đơn tối thiểu', 'Bắt đầu', 'Kết thúc', 'Kích hoạt',
];

export const STOCK_LOG_HEADERS = [
  'Thời gian', 'Loại phiếu', 'Tên nguyên liệu', 'Số lượng', 'Đơn giá', 'Thành tiền', 'Hạn sử dụng', 'Ghi chú',
];

export const BANK_TRANSFER_HEADERS = [
  'Ngân hàng', 'Ngày giao dịch', 'Số tài khoản', 'Tài khoản phụ', 'Code TT',
  'Nội dung thanh toán', 'Loại', 'Số tiền', 'Mã tham chiếu', 'Lũy kế', 'Trạng thái xử lý',
];

export const COST_HISTORY_HEADERS = [
  'Ngày', 'Tên SP', 'Giá Vốn', 'Phí VH', 'Giá Bán', 'Lợi Nhuận', 'Biên LN', 'Chi Tiết',
];

export const SUN_DRIVE_PRODUCT_FOLDER_ID_DEFAULT = '1yooGei2DggcJja0M6T1U4ixobEtvK_ak';

/** 0 = không giới hạn số người trong đơn nhóm */
export const GROUP_MAX_MEMBERS = 0;
export const GROUP_TTL_HOURS = 48;
export const GROUP_DISCOUNT_PCT = 10;
export const FEEDBACK_VOUCHER_DAYS = 7;
export const WELCOME_MEMBER_VOUCHER_DAYS = 30;
export const WELCOME_MEMBER_VOUCHER_PCT = 5;
export const SUN_PENDING_ORDER_CANCEL_HOURS = 12;

export const MEMBER_PORTAL_PROP_KEY = 'MEMBER_PORTAL_JSON_V1';
export const MEMBER_PORTAL_CMS_KEY = 'MEMBER_PORTAL_CMS_V1';
export const SITE_BRAND_PROP_KEY = 'SITE_BRAND_JSON_V1';
export const MEMBER_DELIVERY_ZONES_KEY = 'MEMBER_DELIVERY_ZONES_V1';
export const MEMBER_PROMO_CAMPAIGNS_KEY = 'MEMBER_PROMO_CAMPAIGNS_V1';
export const INVOICE_PRINT_SETTINGS_KEY = 'invoice_print_settings_v1';
export const MEMBERSHIP_PACKAGES_CACHE_KEY = 'membership_packages_v1';
