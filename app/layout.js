import './globals.css';
import { buildNextMetadata, getPublicPageMeta } from '../lib/siteMetadata.js';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildNextMetadata(await getPublicPageMeta());
}

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
