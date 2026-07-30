'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { EyeOff } from 'lucide-react';

const links = [
  { href: '/app', label: 'Vault' },
  { href: '/manage', label: 'Manage' },
  { href: '/audit', label: 'Audit' },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between border-b px-6 py-4 backdrop-blur-md"
      style={{ borderColor: 'var(--border)', backgroundColor: 'color-mix(in srgb, var(--bg) 80%, transparent)' }}
    >
      <div className="flex items-center gap-8">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
          <EyeOff size={18} style={{ color: 'var(--accent)' }} />
          CLOAK
        </Link>
        <nav className="flex gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="btn-ghost text-sm"
              style={pathname === l.href ? { color: 'var(--text-primary)' } : undefined}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      <ConnectButton showBalance={false} />
    </header>
  );
}
