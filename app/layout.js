import './globals.css';

export const metadata = {
  title: 'SUN Nut Milk',
  description: 'SUN Sữa Hạt — POS, Hội viên, Admin',
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
