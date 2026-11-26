import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Free YouTube Transcript Generator & Article Summarizer AI | VisionCut Studio',
  description:
    'Extract YouTube video transcripts with clickable timestamps in 1 second and read or summarize any web article cleanly with AI. Free tool by VisionCut Studio.',
  keywords: [
    'youtube transcript generator',
    'youtube to transcript',
    'youtube video to text',
    'download youtube transcript free',
    'article summarizer ai',
    'smry alternative',
    'clean article reader',
    'youtube notes generator ai',
    'youtube summary in hindi and english',
    'visioncut studio',
  ],
  authors: [{ name: 'VisionCut Studio' }],
  verification: {
    google: '1WPhrZ9bxbHJWXPl-xJjcfkbx73xEMtlSclVEP9ePXc',
  },
  openGraph: {
    title: 'SMRY & YT Reader AI — Free Transcript & Article Summarizer',
    description:
      'Instant YouTube transcripts with clickable timestamps & distraction-free web article summaries.',
    url: 'https://yt-notes-ai-pi.vercel.app',
    siteName: 'SMRY & YT Reader AI',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}