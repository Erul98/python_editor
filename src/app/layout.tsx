import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PyDSA Editor — Luyện tập DSA với Python ngay trên trình duyệt',
  description: 'Web Python IDE chạy bằng Pyodide (WebAssembly): file explorer, Monaco editor, test case engine.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <head>
        {/* Tải sớm Pyodide runtime để giảm thời gian cold start */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}

