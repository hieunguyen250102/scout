# SCOUT — Gánh xiếc 🎪

Bản chơi online **thời gian thực** của board game [SCOUT](https://oinkgms.com/en/scout)
(Kei Kajino / Oink Games) — 2 đến 5 người, đầy đủ luật gốc kể cả biến thể 2 người.

- **Realtime** qua WebSocket (Socket.IO) — vào phòng bằng mã 4 ký tự.
- **Đăng nhập bằng mã email**: nhập email → nhận mã 6 số → nhập mã mới được vào phòng.
  Chỉ các email trong `HOST_EMAILS` được **tạo bàn**; người khác chỉ vào bàn bằng mã phòng.
- **Chat trong phòng**: ở phòng chờ và trong ván (bong bóng hiện trên ghế người nói).
- **Máy chủ là trọng tài**: client chỉ gửi ý định, mọi luật do server quyết.
- **Bot** để chơi thử một mình hoặc cho đủ người.
- **Vào lại được**: F5 hay rớt mạng vẫn quay lại đúng ghế, đúng bài trên tay.
- **Góc nhìn người chơi**: bàn nỉ xanh, đối thủ ngồi đối diện, bài của bạn xoè thành
  nan quạt ở cạnh dưới màn hình — nhấc lên khi chọn, ném xuống bàn khi đánh.
- Bài vẽ bằng SVG nên nét ở mọi kích thước: số đang dùng to ở góc trên, số mặt kia
  nhỏ ở góc dưới (có mũi tên lật) — cả hai nằm ở mép trái nên xoè bài vẫn đọc được hết.
- Tông màu trầm (than chì + vàng đồng), không glow hay đèn nhấp nháy; hoạt ảnh bằng Framer Motion.
- Giao diện chạy tốt từ điện thoại tới desktop.

---

## Cấu trúc

```
scout/
├── shared/          # Luật chơi thuần tuý (dùng chung server + client)
│   ├── types.ts
│   └── engine.ts    # bộ bài, so sánh bộ, kiểm tra nước đi, tính điểm
├── server/          # Express + Socket.IO — trọng tài
│   ├── src/room.ts  # máy trạng thái của một bàn
│   ├── src/bot.ts   # AI heuristic
│   ├── src/auth.ts  # đăng nhập bằng mã email (dùng chung: oink-kit)
│   ├── src/index.ts # socket + HTTP
│   └── test/sim.ts  # 27k assertion + 100 ván bot tự đánh
├── api/send-code.js # hàm Vercel: gửi mail mã đăng nhập qua Gmail SMTP (oink-kit/relay)
├── client/          # React + Vite + Tailwind + Framer Motion
│   ├── src/components/
│   │   ├── Hand.tsx        # nan quạt: hình học, chọn bộ, đặt lá khi Scout
│   │   ├── TableCenter.tsx # mặt bàn nỉ, hiệu ứng ném bài và gom bài
│   │   ├── CardFace.tsx    # mặt bài vẽ bằng SVG
│   │   └── CardPile.tsx    # chồng bài úp đã ăn được
│   └── public/img/  # mặt lưng bài (webp)
└── images/          # ảnh nguồn gốc do bạn cung cấp
```

Điểm quan trọng: `shared/engine.ts` **không** có I/O. Server dùng nó để phân xử,
client dùng đúng file đó để tô sáng nước đi hợp lệ — nên hai bên không bao giờ lệch luật.

---

## Chạy ở máy

```bash
npm run install:all
```

Chạy cả hai cùng lúc:

```bash
npm run dev          # server :4000 + client :5173
```

Hoặc tách ra 2 terminal:

```bash
npm run dev:server   # http://localhost:4000
```

```bash
npm run dev:client   # http://localhost:5173
```

Client tự trỏ về `http://localhost:4000` khi chạy dev, không cần cấu hình gì thêm.

Cấu hình mail và `HOST_EMAILS` khi chạy ở máy nằm trong `server/.env`
(xem `server/.env.example`; file `.env` đã bị `.gitignore` bỏ qua, đừng commit nó).

Khi chạy dev mà chưa cấu hình gửi mail, mã đăng nhập được in ra console của server
và hiện luôn dưới ô nhập mã — tiện để thử mà không cần hộp thư thật.

Chạy test luật:

```bash
npm test
```

---

## Deploy

Client là trang tĩnh, server cần WebSocket chạy liên tục — nên tách đôi:
**Vercel cho client, Render cho server.**

### 1. Server → Render.com

Repo đã có sẵn `render.yaml`, nên chỉ cần:

1. Push repo lên GitHub.
2. Trên Render: **New → Blueprint**, chọn repo. Render đọc `render.yaml` và tạo service.
3. Đợi build xong, copy URL (ví dụ `https://scout-server.onrender.com`).
4. Kiểm tra: mở `https://<url>/health` phải thấy `{"ok":true,...}`.

Nếu muốn tạo thủ công thay vì Blueprint:

| Mục | Giá trị |
| --- | --- |
| Runtime | Node |
| Build Command | `npm install --prefix server --include=dev && npm run build --prefix server` |
| Start Command | `npm run start --prefix server` |
| Health Check Path | `/health` |

> **Lưu ý gói Free của Render**: service ngủ sau ~15 phút không ai dùng, lần vào đầu
> tiên sau đó mất khoảng 30–60 giây để tỉnh dậy. Ván đang chơi dở sẽ mất vì trạng
> thái nằm trong RAM. Muốn chơi nghiêm túc thì dùng gói trả phí (hoặc Railway/Fly.io).

### 2. Client → Vercel

Repo đã có sẵn `vercel.json`.

1. Trên Vercel: **Add New → Project**, chọn repo, để nguyên mọi thiết lập
   (Vercel đọc `vercel.json`).
2. Thêm biến môi trường:

   | Name | Value |
   | --- | --- |
   | `VITE_SERVER_URL` | `https://scout-server.onrender.com` |

3. Deploy.

### 3. Gửi email mã đăng nhập

Gói Free của Render **chặn mọi cổng SMTP** (25, 465, 587). Vì vậy Render không tự gửi
mail mà nhờ **Vercel** gửi hộ: hàm `api/send-code.js` (deploy cùng client) nhận email + mã
qua HTTPS rồi gửi bằng Gmail SMTP. Mọi logic đăng nhập (tạo mã, giới hạn số lần thử…)
vẫn nằm ở Render; hàm trên Vercel chỉ nhận đúng email + mã 6 số và tự dựng nội dung mail.

Code đăng nhập và hàm gửi mail nằm trong package dùng chung
[oink-kit](https://github.com/hieunguyen250102/oink-kit) (các game Oink khác cũng dùng). Thay vì
hàm `api/send-code` của repo này, có thể trỏ `MAIL_RELAY_URL` tới relay chung `oink-mail`
để mọi game dùng chung một tài khoản Gmail.

Tạo một chuỗi bí mật dùng chung cho hai bên:

```bash
openssl rand -hex 32
```

**Trên Vercel** (Project → Settings → Environment Variables):

| Name | Value |
| --- | --- |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | Gmail của bạn |
| `SMTP_PASS` | app password Gmail (16 ký tự) |
| `MAIL_FROM` | `SCOUT <gmail-cua-ban@gmail.com>` |
| `MAIL_RELAY_SECRET` | chuỗi bí mật vừa tạo |

**Trên Render**:

| Name | Value |
| --- | --- |
| `MAIL_RELAY_URL` | `https://<app-cua-ban>.vercel.app/api/send-code` |
| `MAIL_RELAY_SECRET` | cùng chuỗi bí mật |
| `HOST_EMAILS` | email được phép tạo bàn |

Không cần đặt `SMTP_*` trên Render. Đổi biến môi trường trên Vercel xong phải **Redeploy**
thì hàm mới nhận giá trị mới.

Cách khác (nếu không muốn dùng Vercel để gửi): `BREVO_API_KEY` (Brevo, không cần domain)
hoặc `RESEND_API_KEY` (cần domain). Server ưu tiên: Vercel relay → Brevo → Resend → SMTP.
Chạy ở máy thì SMTP trực tiếp trong `server/.env` vẫn dùng được.

`SESSION_SECRET` được Render tự sinh qua `render.yaml`. Đừng đổi nó, nếu không mọi người
sẽ bị đăng xuất.

### 4. Nối hai bên lại

Quay lại Render, đặt biến môi trường `CLIENT_ORIGIN` bằng domain Vercel để siết CORS:

```
CLIENT_ORIGIN=https://scout-cua-ban.vercel.app
```

Nhiều domain thì ngăn cách bằng dấu phẩy. Bỏ trống hoặc để `*` là cho phép tất cả
(tiện lúc thử, không nên để vậy khi chạy thật).

### Biến môi trường

| Nơi | Biến | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| server | `PORT` | `4000` | Render tự đặt |
| server | `CLIENT_ORIGIN` | `*` | Danh sách origin được phép, cách nhau bằng dấu phẩy |
| server | `SESSION_SECRET` | tự sinh | Khoá ký phiên đăng nhập (30 ngày) |
| server | `MAIL_RELAY_URL` / `MAIL_RELAY_SECRET` | — | Nhờ hàm Vercel `api/send-code` gửi mail (khuyên dùng) |
| server | `BREVO_API_KEY` | — | Gửi mail qua Brevo |
| server | `RESEND_API_KEY` | — | Gửi mail qua Resend |
| server | `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | — | Gửi mail qua SMTP (chỉ chạy ở máy; Render Free chặn) |
| server | `HOST_EMAILS` | (trống = ai cũng tạo được) | Email được phép tạo bàn, cách nhau bằng dấu phẩy |
| server | `MAIL_FROM` | `SCOUT <no-reply@scout.local>` | Người gửi hiển thị trong hộp thư |
| Vercel | `SMTP_*`, `MAIL_FROM`, `MAIL_RELAY_SECRET` | — | Cho hàm `api/send-code` gửi mail qua Gmail |
| client | `VITE_SERVER_URL` | `localhost:4000` khi dev | URL của server realtime |

---

## Luật đã cài đặt

Theo đúng sách luật bản mới (ver 1.1) trong `new_edition_scout_rules_eng.pdf`:

- **Bộ bài 45 lá** — mọi cặp số khác nhau từ 1–10. Bỏ bớt theo số người:
  3 người bỏ hết lá có số 10 (còn 36), 2 và 4 người bỏ lá 9/10 (còn 44), 5 người dùng đủ.
- **Chia bài**: 11 lá (2 & 4 người), 12 lá (3 người), 9 lá (5 người).
- **Xoay bài đầu vòng** — xoay cả nắm 180° sẽ lật mọi lá *và* đảo ngược thứ tự.
- **Show** — các lá phải liền nhau trên tay và tạo thành dãy liên tiếp hoặc các số giống nhau.
- **So bộ** — nhiều lá hơn thắng → cùng số lá thì bộ giống nhau thắng bộ liên tiếp →
  cùng cả hai thì so lá nhỏ nhất, bằng nhau là thua.
- **Scout** — lấy 1 lá ở đầu bộ đang mở, chèn vào bất kỳ đâu, được lật; chủ bộ nhận 1 chip.
- **Scout & Show** — mỗi người 1 lần mỗi vòng.
- **Hết vòng** — (i) có người hết bài, hoặc (ii) sau một lần Show không ai chặn được.
- **Tính điểm** — lá đã ăn + chip Scout − lá còn trên tay; người kết thúc theo điều kiện
  (ii) được miễn phạt; bộ đang mở trên sàn không tính.
- **Biến thể 2 người** — 3 chip Scout mỗi người, không có Scout & Show, Scout phải trả
  chip vào giữa bàn, Scout xong vẫn tiếp tục lượt, vòng 2 dùng 22 lá để riêng.

### Cảm giác khi chơi

- Bài trên tay xoè thành nan quạt, xoay quanh một điểm phía dưới như khi cầm bài thật;
  lá được chọn nhấc hẳn lên và có viền vàng đồng.
- Đánh bài: lá bay từ phía người đánh xuống mặt bàn, nghiêng ngẫu nhiên như ném xuống thật.
- Ăn bài: bộ bị chặn lật úp rồi trượt về phía người thắng, cộng vào chồng bài úp của họ.
- Scout: lá định lấy hiện ngay trong nan quạt ở đúng chỗ sẽ đặt — chạm vào bài
  hoặc bấm ◀ ▶ để dời, bấm ↻ để lật trước khi xác nhận.
- Lá có thể đánh được có một vạch vàng nhỏ phía trên; khi gần như lá nào cũng đánh được thì
  tắt bớt cho đỡ rối.

### Chống treo bàn

- Bảng điểm cuối vòng tự chuyển sau 15 giây, không phải chờ chủ phòng.
- Ai mất kết nối quá 15 giây thì bot đánh hộ, vào lại là lấy ghế về ngay.
- Phòng không ai dùng trong 1 giờ sẽ tự xoá.

---

## Bản quyền

SCOUT do **Kei Kajino** thiết kế, **Oink Games** xuất bản, artwork gốc của
Jun Sasaki và Rie Komatsuzaki. Đây là bản dựng lại phi thương mại để học và chơi vui;
mặt bài, chip và mọi hoạ tiết trong `client/src/components` đều được vẽ lại bằng SVG,
còn `client/public/img` là ảnh bạn cung cấp trong `images/` đã nén lại — không dùng
artwork gốc của Oink Games. Nếu thích trò này, hãy mua bản giấy —
nó rất đáng tiền và nhỏ gọn bỏ túi.
