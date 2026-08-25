import "./globals.css";

export const metadata = {
  title: "Yanit Group Management",
  description: "Business, sales, purchase and inventory management for Yanit Group"
};

export default function RootLayout({ children }) {
  return <html lang="id"><body>{children}</body></html>;
}
