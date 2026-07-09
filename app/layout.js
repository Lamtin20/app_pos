import './globals.css';
import { SpeedInsights } from '@vercel/speed-insights/next';

export const metadata = {
  title: 'SUN Nut Milk',
  description: 'SUN Sữa Hạt — POS, Hội viên, Admin',
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body>
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
