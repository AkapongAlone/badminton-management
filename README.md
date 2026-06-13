# Badminton Session Manager 🏸

เครื่องมือจัดการก๊วนแบดสำหรับหัวหน้าก๊วน — จัดคิว จับคู่ คิดเงิน (บุฟเฟ่/นับลูก) และสรุปกำไรรายวัน
นักตีดูบอร์ดสดผ่าน QR code (อ่านอย่างเดียว) ตาม [spec](badminton-session-manager-spec.md)

- **Backend:** Go + Fiber + SQLite (`modernc.org/sqlite`, ไม่ใช้ CGO)
- **Frontend:** React + Vite + Tailwind ฝังใน binary ด้วย `go:embed` → deploy ไฟล์เดียว
- **Realtime:** client poll `GET /state` ทุก 5 วินาที, นาฬิการอเดินฝั่ง client

## Development

```bash
# backend (port 8080)
go run .

# frontend dev server (port 5173, proxy /api → 8080)
cd web && npm install && npm run dev
```

## Build single binary

```bash
cd web && npm install && npm run build && cd ..
go build -o badminton .
PORT=8080 DB_PATH=badminton.db ./badminton
```

## Deploy (Fly.io / Railway)

ใช้ `Dockerfile` ที่ root ได้เลย — ตั้ง env ได้ 2 ตัว:

| env | default | ความหมาย |
|---|---|---|
| `PORT` | `8080` | พอร์ตที่ server ฟัง |
| `DB_PATH` | `/data/badminton.db` (ใน container) | ที่เก็บไฟล์ SQLite — ต้อง mount volume ถาวร |

ตัวอย่าง Fly.io:

```bash
fly launch --no-deploy        # สร้าง app จาก Dockerfile
fly volumes create data --size 1
# ใน fly.toml: [mounts] source = "data", destination = "/data"
fly deploy
```

## การใช้งาน

1. เปิดเว็บครั้งแรก → สร้างก๊วน (ชื่อ + ตั้งค่าเริ่มต้น) → ได้ **ลิงก์แอดมิน** (เก็บให้ดี ลิงก์หาย = เข้าไม่ได้ ไม่มีทางกู้)
2. วันตี → "เปิดก๊วนวันนี้" (แก้ราคา/จำนวนคอร์ทรายวันได้) → เช็คอินนักตีจากทะเบียน
3. QR มุมซ้ายบนของแดชบอร์ดคือทางเข้าเดียวของบอร์ดสาธารณะ (QR ใหม่ทุกวัน)
4. จัดเกมเองทีละคน (ปุ่ม "ขอ idea" แค่ไฮไลท์ผู้เล่นแนะนำ ไม่จัดให้อัตโนมัติ)
5. จบเกม → กรอกจำนวนลูกที่เปิดใหม่ (default 1, ใส่ 0 ได้) → ระบบบวกให้ทั้ง 4 คน
6. ปิดก๊วน → ทุกอย่าง freeze ยกเว้นติ๊กจ่ายเงิน (เผื่อโอนตามหลัง) และบอร์ดยังดูได้
