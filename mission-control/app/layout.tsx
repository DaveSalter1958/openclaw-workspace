import './globals.css';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Mission Control',
  description: 'Local-first dashboard for shaping tool ideas, modules, workflows, and custom tools.',
};

const navItems = [
  { href: '/', label: 'Tasks', icon: '▣' },
  { href: '/agent-tasks', label: 'Agent Tasks', icon: '◇' },
  { href: '/modules', label: 'Approvals', icon: '◌' },
  { href: '/tools', label: 'Calendar', icon: '◷' },
  { href: '/studio', label: 'Memory', icon: '☰' },
  { href: '/willy', label: 'MyLife', icon: '✎' },
  { href: '/clawhub', label: 'ClawHub', icon: '✦' },
  { href: 'https://docs.google.com/spreadsheets/d/1NhvcQc1705dlRLlLPUauWz-erEwu5MF2B0u88HQVXXo/edit?usp=drivesdk', label: 'ProjectSheet1', icon: '☷' },
  { href: 'http://192.168.1.119:3002', label: 'Paws App', icon: '🐾' },
  { href: '/workflows', label: 'PlanHubGuy', icon: '⚑' },
  { href: '/templates', label: 'Templates', icon: '✎' },
  { href: '/remotion', label: 'Remotion', icon: '▶' },
  { href: '/guy', label: 'Guy', icon: '⚙' },
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
          </aside>

          <div className="mission-main">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
