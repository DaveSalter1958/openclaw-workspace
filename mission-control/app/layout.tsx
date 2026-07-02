import './globals.css';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
// EnvironmentSwitcher removed per request

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Mission Control',
  description: 'Local-first dashboard for shaping tool ideas, modules, workflows, and custom tools.',
};

const navItems = [
  { href: '/', label: 'Tasks', icon: '▣' },
  { href: '/workflows', label: 'PlanHubGuy', icon: '⚑' },
  { href: '/tools', label: 'Calendar', icon: '◷' },
  { href: '/willy', label: 'MyLife', icon: '✎' },
  { href: '/studio', label: 'Memory', icon: '☰' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="mission-frame">
          <aside className="mission-sidebar">
            <div className="mission-sidebar-section">
              {navItems.map((item) => (
                <Link className="mission-nav-link" href={item.href} key={item.href}>
                  <span className="mission-nav-icon" aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
            {/* Environment switcher removed */}
          </aside>

          <div className="mission-main">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
