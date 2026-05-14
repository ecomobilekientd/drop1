# Drop

Công cụ upload file nhanh và lấy link share, chạy trên Cloudflare Pages + R2 + KV.

- Drag & drop, auto copy link
- Password protect
- History sync qua KV (đa thiết bị)
- Multipart upload — không giới hạn size
- UI clean iOS-like, hỗ trợ dark mode

---

## Hướng dẫn deploy A → Z

### Bước 1. Push code lên GitHub

```bash
cd r2-uploader
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/drop.git
git push -u origin main
```

### Bước 2. Tạo R2 Bucket

1. Vào [Cloudflare Dashboard](https://dash.cloudflare.com) → **R2 Object Storage**
2. Nếu chưa enable R2, click **Enable R2** (cần thêm payment method, nhưng 10GB đầu free)
3. Click **Create bucket**
   - Name: `drop-files` (hoặc tên bạn thích)
   - Location: chọn gần nhất
4. Sau khi tạo, vào tab **Settings** của bucket
5. Tìm section **Public access** → click **Allow Access** trên R2.dev subdomain
6. Copy URL hiển thị (dạng `https://pub-XXXXXXXXXXXX.r2.dev`) — lưu lại để dùng ở bước 5

### Bước 3. Tạo KV Namespace

1. Cloudflare Dashboard → **Workers & Pages** → **KV** (sidebar trái)
2. Click **Create a namespace**
   - Name: `drop-history`
3. Tạo xong, copy **ID** của namespace (dạng `abc123def456...`)

### Bước 4. Tạo Pages project và connect GitHub

1. Cloudflare Dashboard → **Workers & Pages** → **Create application** → tab **Pages** → **Connect to Git**
2. Authorize GitHub nếu chưa, chọn repo `drop`
3. **Build settings**:
   - Framework preset: `None`
   - Build command: *(để trống)*
   - Build output directory: `public`
   - Root directory: *(để trống)*
4. Click **Save and Deploy**

Lần deploy đầu sẽ chưa chạy được vì thiếu bindings và env vars — đó là việc của bước 5.

### Bước 5. Cấu hình Bindings & Variables

Vào project vừa tạo → tab **Settings** → **Bindings** (hoặc **Functions** trên UI cũ):

**5.1. R2 binding**
- Click **Add binding** → **R2 bucket**
- Variable name: `BUCKET` *(phải chính xác, viết hoa)*
- R2 bucket: chọn `drop-files`
- Save

**5.2. KV binding**
- Click **Add binding** → **KV namespace**
- Variable name: `HISTORY`
- KV namespace: chọn `drop-history`
- Save

**5.3. Environment Variables**

Vẫn trong **Settings** → scroll xuống **Variables and Secrets** → **Add**:

| Type   | Name            | Value                                                  |
|--------|-----------------|--------------------------------------------------------|
| Secret | `PASSWORD`      | Password bạn chọn (đặt mạnh vào, đây là lớp bảo mật duy nhất) |
| Plaintext | `R2_PUBLIC_URL` | URL r2.dev copy ở bước 2.6 (vd `https://pub-xxx.r2.dev`) |

⚠️ Encrypt cái `PASSWORD` bằng cách chọn **Type: Secret**, không phải Plaintext.

### Bước 6. Redeploy

Sau khi set bindings + vars, cần redeploy để Functions nhận được config:

- Tab **Deployments** → click vào deployment mới nhất → **Manage deployment** → **Retry deployment**

Hoặc push 1 commit mới lên GitHub, sẽ auto deploy.

### Bước 7. Xong! Truy cập

URL có dạng `https://drop-xxx.pages.dev` (xem ở tab **Deployments**).

Mở lên, nhập password, kéo thả file vào — link sẽ tự copy vào clipboard.

---

## Dev local (optional)

```bash
npm install
cp .dev.vars.example .dev.vars
# Edit .dev.vars: đặt PASSWORD và R2_PUBLIC_URL
```

Mở `wrangler.toml`, uncomment phần local bindings, điền KV namespace ID. Rồi:

```bash
npm run dev
```

---

## Custom domain (optional)

Nếu muốn dùng domain riêng cho link file thay vì `r2.dev`:

1. R2 bucket → **Settings** → **Custom Domains** → **Connect Domain**
2. Nhập subdomain (vd `files.yourdomain.com`) — domain phải đang được Cloudflare quản DNS
3. Đợi DNS propagate
4. Vào Pages project → Settings → Variables → đổi `R2_PUBLIC_URL` thành `https://files.yourdomain.com`
5. Redeploy

Link cũ trong history vẫn dùng r2.dev URL — chỉ link mới upload mới dùng domain mới.

---

## Cấu trúc project

```
drop/
├── public/                  # Static assets (HTML, CSS, JS)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── functions/               # Cloudflare Pages Functions (backend)
│   ├── _lib.js              # Shared utilities
│   └── api/
│       ├── auth/
│       │   ├── login.js
│       │   └── check.js
│       ├── multipart/
│       │   ├── create.js
│       │   ├── upload-part.js
│       │   └── complete.js
│       ├── upload.js        # Simple upload (< 50MB)
│       ├── history.js
│       └── delete.js
├── wrangler.toml
├── package.json
└── .gitignore
```

---

## Lưu ý bảo mật

- `PASSWORD` là lớp bảo vệ duy nhất cho upload. Đặt mạnh, không share.
- Files trên R2 public — ai có link là vào được. Đừng upload thứ nhạy cảm.
- Session token có TTL 30 ngày, sign bằng HMAC-SHA256 của `PASSWORD`. Đổi password = logout tất cả.

## Chi phí

Free tier Cloudflare hiện tại (kiểm tra lại trên dashboard, có thể đổi):

- **R2**: 10GB storage free, 1M Class A ops/tháng, 10M Class B ops/tháng, egress: free
- **KV**: 100K reads/ngày, 1K writes/ngày, 1GB storage free
- **Pages**: 500 builds/tháng, unlimited request, unlimited bandwidth
- **Pages Functions**: 100K requests/ngày free

Use case cá nhân share link cho dev → không có cách nào vượt free tier.
