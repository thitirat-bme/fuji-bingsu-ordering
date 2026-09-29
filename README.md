# บิงซูภูเขาฟูจิ

ระบบสั่งขนมหวานบิงซู — Next.js (App Router, JavaScript) + Supabase, deploy บน Vercel

## เริ่มใช้งาน
```bash
npm install
cp .env.example .env.local   # แล้วใส่ค่า Supabase จริง
npm run dev
```

## Deploy บน Vercel
1. Push โค้ดขึ้น GitHub แล้ว import โปรเจกต์ใน Vercel
2. ตั้ง Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Deploy

> หมายเหตุ: โปรเจกต์นี้ใช้ Next.js เวอร์ชันล่าสุด ซึ่ง `params` ของ Dynamic Route เป็น Promise
> ต้อง unwrap ด้วย `use()` จาก React เสมอ — ดูรายละเอียดและโครงสร้างตารางใน `CLAUDE.md`
