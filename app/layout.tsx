import type { Metadata } from 'next';
import './globals.css';
import './workspace.css';
import './night.css';
import './upgrade.css';
export const metadata: Metadata = {
  title: '币观 · 行情观察',
  description: '关注加密货币价格、走势与一小时涨跌异动。',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
