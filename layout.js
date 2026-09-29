import "./globals.css";

export const metadata = {
  title: "บิงซูภูเขาฟูจิ",
  description: "ระบบสั่งขนมหวานบิงซู ร้านบิงซูภูเขาฟูจิ",
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
