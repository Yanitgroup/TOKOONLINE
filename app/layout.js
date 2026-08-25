import "./globals.css";

export const metadata = {
  title: "Yanit Group | Management System",
  description: "Kasir, stok, pembelian, dan profit dalam satu tempat."
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
