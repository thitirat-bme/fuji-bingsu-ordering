# บิงซูภูเขาฟูจิ — ระบบสั่งขนมหวาน

โปรเจกต์ระบบสั่งบิงซูสำหรับร้าน "บิงซูภูเขาฟูจิ"

## Stack
- Next.js เวอร์ชันล่าสุด (App Router) — **JavaScript เท่านั้น ไม่ใช้ TypeScript**
- Deploy บน Vercel
- Supabase (`@supabase/supabase-js`) — client อยู่ที่ `lib/supabaseClient.js`
- Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (ตอนพัฒนาใช้ `.env.local`, ตอน deploy ตั้งใน Vercel — ห้าม commit)

## กฎสำคัญ: params ของ Dynamic Route เป็น Promise
ใน Next.js เวอร์ชันล่าสุด `params` (และ `searchParams`) ของ Dynamic Route เป็น **Promise**
ต้อง unwrap ด้วย `use()` จาก React **ทุกครั้ง**

```js
"use client";
import { use } from "react";

export default function Page({ params }) {
  const { tableId } = use(params); // ห้ามอ่าน params.tableId ตรง ๆ
  // ...
}
```

- Client Component: ใช้ `use(params)` ตามด้านบน
- Server Component (async): ใช้ `const { tableId } = await params;`

## โครงสร้างตารางฐานข้อมูล (มีอยู่แล้วใน Supabase — ไม่ต้องสร้างใหม่)
อ้างอิงชื่อตารางและคอลัมน์ตามนี้ตลอดทั้งโปรเจกต์

| ตาราง | คอลัมน์ |
|---|---|
| `sessions` | `id`, `table_number`, `adult_count`, `child_count`, `status`, `created_at` |
| `menu_categories` | `id`, `name`, `sort_order` |
| `menu_items` | `id`, `category_id`, `name` |
| `orders` | `id`, `session_id`, `table_number`, `items` (jsonb), `status`, `created_at` |

## หน้าที่วางแผนไว้
- `/` — หน้าแรก (ทดสอบ deploy) มีลิงก์ไป `/generate-qr` และ `/kitchen`
- `/generate-qr` — สร้าง QR สำหรับโต๊ะ
- `/kitchen` — หน้าครัวดูออเดอร์
- หน้าสั่งอาหารแบบ Dynamic Route (ขั้นตอนถัดไป — อย่าลืมกฎ `use(params)`)
