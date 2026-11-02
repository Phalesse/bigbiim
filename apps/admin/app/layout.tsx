import './globals.css';
import type { Metadata, Viewport } from 'next';
import AdminShell from '@/components/AdminShell';

export const metadata: Metadata = {
  title: 'BIGBIIM — Administration',
  description: 'Une activité. Toute l’équipe.',
};

export const viewport: Viewport = { themeColor: '#0B3C7A', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <AdminShell>{children}</AdminShell>
      </body>
    </html>
  );
}
