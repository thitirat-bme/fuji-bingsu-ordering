import Link from "next/link";

export default function HomePage() {
  return (
    <main className="home">
      <svg className="mountain" viewBox="0 0 280 160" role="img" aria-label="ภูเขาฟูจิ">
        <path d="M10 150 L110 30 Q140 10 170 30 L270 150 Z" fill="#3f5f9a" />
        <path d="M110 30 Q140 10 170 30 L186 50 L165 44 L140 58 L118 44 L94 50 Z" fill="#ffffff" />
        <circle cx="228" cy="34" r="12" fill="#e58aa3" />
      </svg>

      <h1>บิงซูภูเขาฟูจิ</h1>
      <p>หน้านี้ใช้ทดสอบว่า deploy สำเร็จ</p>

      <nav className="links" aria-label="เมนูหลัก">
        <Link href="/generate-qr">สร้าง QR โต๊ะ</Link>
        <Link href="/kitchen">หน้าครัว</Link>
      </nav>
    </main>
  );
}
