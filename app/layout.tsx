import type { Metadata } from 'next';
import './globals.css';
import NavBar from '@/components/NavBar';

export const metadata: Metadata = {
  title: 'Job Application Agent',
  description: 'Personal hiring agent with job scraping and LLM drafting',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-zinc-950">
        <NavBar />
        {children}
      </body>
    </html>
  );
}