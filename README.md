# SUN Nut Milk — Vercel + Google Sheets

Hệ thống **SUN Nut Milk / SUN Sữa Hạt** chạy trên **Next.js (Vercel)** với **Google Sheet** làm database chính.

- Frontend: `/`, `/admin`, `/order`, `/member`, `/pickup`
- Backend: API routes + RPC (`/api/rpc`)
- Database: [Google Sheet](https://docs.google.com/spreadsheets/d/1qJXloc3X3f3RB0rlc0HyoSzbtd2T3ZHURBjBRHRS8q8/edit)

## Chạy local

```bash
npm install
cp .env.example .env.local
# Điền GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID
npm run dev
```

Mở http://localhost:3000

## Deploy Vercel

1. Push **toàn bộ** project lên GitHub (xem checklist bên dưới)
2. Import project trên [vercel.com](https://vercel.com)
3. Thêm **Environment Variables** (giống `.env.example`)
4. Deploy — `npm run build` chạy `next build`

### ⚠️ Lỗi `npm run build exited with 1` trên Vercel

Thường do repo GitHub **thiếu thư mục Next.js**. Repo phải có đủ:

```
app/              ← pages + API routes (BẮT BUỘC)
lib/              ← backend Google Sheets (BẮT BUỘC)
components/       ← LegacyPage loader (BẮT BUỘC)
scripts/          ← build-legacy-pages.mjs (chỉ khi cần rebuild HTML)
public/           ← sun-api-client.js + legacy/*.html (BẮT BUỘC)
package.json
next.config.mjs
Admin.html, Order.html, ...  ← nguồn build frontend
```

Nếu chỉ upload file HTML + `package.json` (không có `app/`, `lib/`, …) thì Vercel **không build được**.

**Cách sửa:** push lại toàn bộ thư mục từ máy local (không chỉ “Add files via upload” từng file lẻ):

```bash
git init
git add app lib components scripts public package.json package-lock.json next.config.mjs .env.example .gitignore README.md *.html
git commit -m "Add full Next.js project for Vercel"
git remote add origin https://github.com/Lamtin20/app_pos.git
git push -u origin main
```

Sau đó trên Vercel: **Redeploy**.

### Environment Variables trên Vercel

| Biến | Bắt buộc |
|------|----------|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | ✅ |
| `GOOGLE_PRIVATE_KEY` | ✅ (dán cả `-----BEGIN PRIVATE KEY-----`, giữ `\n`) |
| `GOOGLE_SHEET_ID` | ✅ |
| `GOOGLE_DRIVE_FOLDER_ID` | Khuyến nghị |
| `GEMINI_API_KEY` | Tùy chọn |
| `IMGBB_API_KEY` | Tùy chọn |
| `ADMIN_PIN` | Khuyến nghị đổi khỏi 2507 |

## Cấu hình Google Service Account

1. Vào [Google Cloud Console](https://console.cloud.google.com) → tạo project (hoặc dùng project có sẵn)
2. Bật **Google Sheets API** và **Google Drive API**
3. **IAM & Admin → Service Accounts** → Create → tải JSON key
4. Copy `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
5. Copy `private_key` → `GOOGLE_PRIVATE_KEY` (giữ `\n` hoặc xuống dòng thật)
6. Mở Google Sheet → **Share** → thêm email service account với quyền **Editor**
7. Copy Sheet ID từ URL: `.../d/{GOOGLE_SHEET_ID}/edit`

### Drive folder (ảnh sản phẩm)

1. Tạo folder trên Google Drive
2. Share folder cho service account (Editor)
3. Copy Folder ID từ URL → `GOOGLE_DRIVE_FOLDER_ID`

### ScriptConfig sheet (tùy chọn)

Tab `ScriptConfig` (tự tạo khi ghi lần đầu): cột A = key, cột B = value. Dùng cho cài đặt runtime (member portal CMS, invoice, shift cash…) thay cho GAS `PropertiesService`.

## Cấu trúc project

```
app/                  Next.js pages + API routes
components/           LegacyPage loader
lib/
  backend/            Logic port từ Code (10).gs
  googleSheets.js     Google Sheets API
  googleDrive.js      Google Drive upload
  properties.js       Env + ScriptConfig sheet
public/
  legacy/             HTML đã build (admin, order, member, pickup)
  sun-api-client.js   Polyfill google.script.run → fetch
scripts/
  build-legacy-pages.mjs
```

## API Mapping

### RPC (tương thích frontend cũ)

Mọi `google.script.run.methodName(...)` hoặc `api.call('methodName', ...)` đều gọi:

```http
POST /api/rpc
Content-Type: application/json

{ "method": "getMenu", "args": [] }
```

### REST routes (đề xuất)

| GAS / Frontend cũ | REST mới |
|---|---|
| `getMenu()` | `GET /api/menu` |
| `saveMenuItem(data)` | `POST /api/menu` |
| `updateMenuItem(id, data)` | `PATCH /api/menu` |
| `updateMenuAvailability(id, avail)` | `PATCH /api/menu/:id` |
| `deleteMenuItem(id)` | `DELETE /api/menu?id=` |
| `getOrders(period)` | `GET /api/orders?period=` |
| `saveOrder(data)` | `POST /api/orders` |
| `savePickupOnlineOrder(data)` | `POST /api/orders` |
| `getOrdersByPhone(phone)` | `GET /api/orders/by-phone?phone=` |
| `updateOnlineOrderStatus(id, st)` | `PATCH /api/orders/:id/status` |
| `getCustomers()` | `GET /api/customers` |
| `saveCustomer(data)` | `POST /api/customers` |
| `ensureCustomerForPos(phone, name)` | `POST /api/customers/ensure` |
| `getPosCustomerInsight(phone)` | `GET /api/customers/insight?phone=` |
| `getInventory()` | `GET /api/inventory` |
| `addIngredient(data)` | `POST /api/inventory` |
| `updateIngredient(row, data)` | `PATCH /api/inventory` |
| `getPromotions()` | `GET /api/promotions` |
| `applyPromoCode(...)` | `POST /api/promotions` |
| `?api=memberPortalBootstrap` | `GET /api/member/bootstrap` |
| `?api=memberPortal&phone=` | `GET /api/member/portal?phone=` |
| `getMembershipPackages()` | `GET /api/member/packages` |
| `registerMembershipSubscription(obj)` | `POST /api/member/register-package` |
| `memberSaveDeliveryPrefs(obj)` | `PATCH /api/member/schedule` |
| `getMemberDeliveryZones()` | `GET /api/member/delivery-zones` |
| `getDashboardData()` | `GET /api/admin/dashboard` |
| Admin PIN | `POST /api/admin/login` `{ "pin": "2507" }` |
| `uploadProductImageToDrive(...)` | `POST /api/upload/drive` |
| `uploadProductImageToImgbb(...)` | `POST /api/upload/imgbb` |
| `suggestMenuDescriptionShort(...)` | `POST /api/ai/menu-description` |
| `?api=groupOrder&group=` | `GET /api/group-order?group=` |
| `?api=orderStatus&order=` | `GET /api/order-status?order=` |

### Toàn bộ RPC handlers (113 methods)

Xem `lib/backend/rpcMap.js` — ví dụ:

| Frontend call | RPC method |
|---|---|
| Admin dashboard | `getDashboardData` |
| POS menu load | `getMenu`, `getInventory`, `getTodayPromoDigest` |
| POS checkout | `saveOrder`, `applyPromoCode`, `checkBankTransferPayment` |
| Member login | `memberPortalLookup` |
| Member bootstrap | `memberPortalBootstrapPayload` |
| Group order | `createGroupOrder`, `getGroupOrder`, `syncGroupCart`, `finalizeGroupOrder` |
| Stock admin | `getStockReportAdvanced`, `logStockTransaction` |
| AI menu | `suggestMenuDescriptionShort`, `getAISuggestion` |

## Route frontend

| GAS cũ | Vercel |
|---|---|
| `?page=admin` | `/admin` |
| `?page=order` | `/order` |
| `?page=member` | `/member` |
| `?page=pickup` | `/pickup` |

## Khác biệt so với GAS

| Tính năng GAS | Trạng thái Vercel |
|---|---|
| `SpreadsheetApp` / `DriveApp` | Google Sheets + Drive API |
| `PropertiesService` | Env vars + sheet `ScriptConfig` |
| `CacheService` | In-memory cache (`lib/cache.js`) |
| Email tự động (`MailApp`) | Chưa port — cần SendGrid/nodemailer |
| Time triggers (auto cancel đơn, báo cáo) | Dùng Vercel Cron hoặc scheduler ngoài |
| `doGet` HTML routing | Next.js App Router |

## Scripts

```bash
npm run dev      # next dev
npm run build    # next build
npm run start    # next start
```

Frontend legacy HTML nằm sẵn trong `public/legacy/` (đã build từ `Admin.html`, `Order.html`, …). Nếu sửa file HTML gốc, chạy thủ công: `node scripts/build-legacy-pages.mjs`.

## Bảo mật

- **Không commit** `.env.local` hoặc service account JSON
- Đặt `ADMIN_PIN` trên Vercel (mặc định code cũ: `2507` — đổi ngay khi deploy)
- Service account chỉ cần quyền Editor trên sheet + folder Drive sản phẩm
