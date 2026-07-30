import type { Metadata } from 'next';
import { Space_Grotesk, Syne, Space_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const grotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-body' });
const syne = Syne({ subsets: ['latin'], weight: ['700', '800'], variable: '--font-display' });
const mono = Space_Mono({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Cloak — shows its returns, never its hand',
  description:
    'The first vault where performance is public and strategy is cryptographically private. Built on iExec Nox × Uniswap.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${grotesk.variable} ${syne.variable} ${mono.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
