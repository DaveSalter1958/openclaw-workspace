import './globals.css';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Second Brain',
  description: 'A local-first memory, document, and task review app.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <nav className="nav">
            <Link href="/" className="brand">Second Brain</Link>
            <div className="nav-links">
              <Link className="nav-pill" href="/">Dashboard</Link>
              <Link className="nav-pill" href="/memories">Memories</Link>
              <Link className="nav-pill" href="/documents">Documents</Link>
              <Link className="nav-pill" href="/tasks">Tasks</Link>
              <Link className="nav-pill" href="/search">Search</Link>
              <Link className="nav-pill" href="/review">Review</Link>
              <Link className="nav-pill" href="/morning">Morning Brief</Link>
            </div>
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
