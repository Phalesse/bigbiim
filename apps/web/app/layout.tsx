import './globals.css';
import type { Metadata, Viewport } from 'next';
import RegisterSW from '@/components/RegisterSW';

export const metadata: Metadata = {
  title: 'BIGBIIM',
  description: 'Une activité. Toute l’équipe.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = { themeColor: '#0B3C7A', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
