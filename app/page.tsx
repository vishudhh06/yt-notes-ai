'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  BookOpen,
  Search,
  Copy,
  Check,
  Download,
  Sparkles,
  Loader2,
  Clock,
  Sun,
  Moon,
  ArrowUpRight,
  ClipboardPaste,
  ExternalLink,
  FileText,
} from 'lucide-react';

interface Segment {
  text: string;
  offset: number;
}

interface ArticleData {
  url: string;
  title: string;
  wordCount: number;
  readTime: number;
  content: string;
}

function formatTime(seconds: number) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function renderInlineElements(text: string, isDark: boolean): React.ReactNode[] {
  const tokenRegex = /(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s)]+|\*\*[^*]+\*\*)/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, i) => {
    if (!part) return null;

    const mdLink = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (mdLink) {
      const label = mdLink[1].replace(/^!\[.*?\]\(.*?\)\s*/, '').trim() || mdLink[2];
      const href = mdLink[2];
      return (
        <a
          key={i}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-1 font-medium underline underline-offset-4 transition ${
            isDark
              ? 'text-amber-400 hover:text-amber-300 decoration-amber-500/50'
              : 'text-amber-700 hover:text-amber-900 decoration-amber-600/50'
          }`}
        >
          <span>{label}</span>
          <ExternalLink className="w-3.5 h-3.5 inline shrink-0" />
        </a>
      );
    }

    if (/^https?:\/\/[^\s)]+$/.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-1 break-all font-medium underline underline-offset-4 transition ${
            isDark
              ? 'text-amber-400 hover:text-amber-300 decoration-amber-500/50'
              : 'text-amber-700 hover:text-amber-900 decoration-amber-600/50'
          }`}
        >
          <span>{part}</span>
          <ExternalLink className="w-3.5 h-3.5 inline shrink-0" />
        </a>
      );
    }

    const boldMatch = part.match(/^\*\*([^*]+)\*\*$/);
    if (boldMatch) {
      return (
        <strong key={i} className={isDark ? 'font-bold text-white' : 'font-bold text-stone-950'}>
          {boldMatch[1]}
        </strong>
      );
    }

    return <span key={i}>{part}</span>;
  });
}

function RichContentRenderer({ content, isDark }: { content: string; isDark: boolean }) {
  const blocks = content.split(/\n\n+/);

  return (
    <div className="space-y-4">
      {blocks.map((block, idx) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        const imgMatch = trimmed.match(/^!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/);
        if (imgMatch) {
          return (
            <figure key={idx} className="my-5">
              <img
                src={imgMatch[2]}
                alt={imgMatch[1] || 'Article visual'}
                loading="lazy"
                className="rounded-xl max-h-96 w-auto object-contain border border-white/10 shadow-lg"
              />
              {imgMatch[1] && !imgMatch[1].startsWith('Image ') && (
                <figcaption className="text-xs text-stone-400 mt-1.5">{imgMatch[1]}</figcaption>
              )}
            </figure>
          );
        }

        if (trimmed.startsWith('### ')) {
          return (
            <h3
              key={idx}
              className={`text-lg md:text-xl font-bold pt-3 ${
                isDark ? 'text-amber-300' : 'text-amber-900'
              }`}
            >
              {renderInlineElements(trimmed.replace(/^###\s+/, ''), isDark)}
            </h3>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h2
              key={idx}
              className={`text-xl md:text-2xl font-bold pt-4 pb-1 border-b ${
                isDark ? 'text-white border-white/10' : 'text-stone-950 border-stone-200'
              }`}
            >
              {renderInlineElements(trimmed.replace(/^##\s+/, ''), isDark)}
            </h2>
          );
        }
        if (trimmed.startsWith('# ')) {
          return (
            <h1
              key={idx}
              className={`text-2xl md:text-3xl font-extrabold pt-2 ${
                isDark ? 'text-white' : 'text-stone-950'
              }`}
            >
              {renderInlineElements(trimmed.replace(/^#\s+/, ''), isDark)}
            </h1>
          );
        }

        const lines = trimmed.split('\n');
        const isBulletList = lines.every((l) => /^[-*•]\s+/.test(l.trim()));
        if (isBulletList) {
          return (
            <ul key={idx} className="space-y-2.5 pl-1">
              {lines.map((line, lIdx) => {
                const cleanLine = line.trim().replace(/^[-*•]\s+/, '');
                return (
                  <li
                    key={lIdx}
                    className={`flex items-start gap-3 p-3 rounded-xl border ${
                      isDark
                        ? 'bg-white/[0.02] border-white/[0.07] text-stone-200'
                        : 'bg-stone-50 border-stone-200/80 text-stone-800'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-amber-500 mt-2.5 shrink-0" />
                    <div className="text-base md:text-[17px] leading-relaxed space-y-1">
                      {renderInlineElements(cleanLine, isDark)}
                    </div>
                  </li>
                );
              })}
            </ul>
          );
        }

        return (
          <p
            key={idx}
            className={`text-base md:text-[17px] leading-8 ${
              isDark ? 'text-stone-200' : 'text-stone-800'
            }`}
          >
            {lines.map((line, lIdx) => (
              <React.Fragment key={lIdx}>
                {lIdx > 0 && <br />}
                {renderInlineElements(line.replace(/!\[[^\]]*\]\([^\)]+\)/g, ''), isDark)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function ReaderWorkspace() {
  const searchParams = useSearchParams();
  const initialVideo = searchParams.get('v');
  const initialUrl = searchParams.get('url');
  const initializedRef = useRef(false);

  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [inputUrl, setInputUrl] = useState('');
  const [modeType, setModeType] = useState<'none' | 'youtube' | 'article'>('none');

  const [videoId, setVideoId] = useState('');
  const [startTime, setStartTime] = useState(0);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [showTimestamps, setShowTimestamps] = useState(true);

  const [article, setArticle] = useState<ArticleData | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const [notes, setNotes] = useState('');
  const [notesLoading, setNotesLoading] = useState(false);
  const [language, setLanguage] = useState('English');
  const [viewMode, setViewMode] = useState<'reader' | 'notes'>('reader');

  const isDark = theme === 'dark';

  const fetchContent = async (target: string) => {
    const cleanTarget = target.trim();
    if (!cleanTarget) return;

    setLoading(true);
    setError('');
    setNotes('');
    setViewMode('reader');

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanTarget, action: 'fetch' }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Content load nahi ho paya.');
      } else if (data.type === 'youtube') {
        setModeType('youtube');
        setVideoId(data.videoId);
        setSegments(data.segments);
        setArticle(null);
        setStartTime(0);
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', `/?v=${data.videoId}`);
        }
      } else if (data.type === 'article') {
        setModeType('article');
        setArticle(data);
        setVideoId('');
        setSegments([]);
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', `/?url=${encodeURIComponent(data.url)}`);
        }
      }
    } catch {
      setError('Server connection error. Dobara try karein.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initializedRef.current) return;
    if (initialVideo) {
      initializedRef.current = true;
      const yt = `https://www.youtube.com/watch?v=${initialVideo}`;
      setInputUrl(yt);
      fetchContent(yt);
    } else if (initialUrl) {
      initializedRef.current = true;
      setInputUrl(initialUrl);
      fetchContent(initialUrl);
    }
  }, [initialVideo, initialUrl]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchContent(inputUrl);
  };

  const handlePasteClick = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInputUrl(text);
        fetchContent(text);
      }
    } catch {
      setError('Browser clipboard blocked hai — input box mein Ctrl+V dabayein.');
    }
  };

  const handleResetHome = () => {
    setModeType('none');
    setVideoId('');
    setSegments([]);
    setArticle(null);
    setInputUrl('');
    setError('');
    setNotes('');
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', '/');
    }
  };

  const handleGenerateNotes = async () => {
    if (notes && !notes.startsWith('Notes error:')) {
      setViewMode('notes');
      return;
    }
    setNotesLoading(true);
    setViewMode('notes');
    try {
      const rawContent =
        modeType === 'youtube'
          ? segments.map((s) => s.text).join(' ')
          : article?.content || '';

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'summarize',
          language,
          transcriptText: rawContent,
        }),
      });
      const data = await res.json();
      if (res.ok) setNotes(data.notes);
      else setNotes('Notes error: ' + data.error);
    } catch {
      setNotes('Notes error: Connection failed. Please retry.');
    } finally {
      setNotesLoading(false);
    }
  };

  const filteredSegments = segments.filter((s) =>
    s.text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getPlainText = () => {
    if (viewMode === 'notes') return notes;
    if (modeType === 'article' && article) {
      return `${article.title}\nSource: ${article.url}\n\n${article.content}`;
    }
    return filteredSegments
      .map((s) => (showTimestamps ? `[${formatTime(s.offset)}] ${s.text}` : s.text))
      .join('\n');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getPlainText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([getPlainText()], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const slug = modeType === 'youtube' ? videoId : 'article';
    link.download = `${slug}-${viewMode}.txt`;
    link.click();
  };

  return (
    <div
      className={`relative min-h-screen overflow-x-hidden flex flex-col transition-colors duration-500 ${
        isDark ? 'bg-[#090807] text-[#F5F2EB]' : 'bg-[#F7F5F0] text-[#181614]'
      }`}
    >
      <style>{`
        @keyframes driftSlow {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(45px, -35px) scale(1.08); }
          66% { transform: translate(-35px, 25px) scale(0.95); }
        }
        @keyframes driftReverse {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          50% { transform: translate(-50px, -30px) scale(1.1); }
        }
        .animate-drift-slow { animation: driftSlow 18s ease-in-out infinite; }
        .animate-drift-reverse { animation: driftReverse 22s ease-in-out infinite; }
      `}</style>

      {/* Moving Ambient Blurred Background */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <div
          className={`animate-drift-slow absolute -top-32 left-1/4 w-[500px] h-[500px] rounded-full blur-[140px] ${
            isDark ? 'bg-amber-600/20' : 'bg-amber-400/30'
          }`}
        />
        <div
          className={`animate-drift-reverse absolute top-1/3 -right-24 w-[460px] h-[460px] rounded-full blur-[150px] ${
            isDark ? 'bg-orange-800/20' : 'bg-teal-400/25'
          }`}
        />
        <div
          className={`animate-drift-slow absolute -bottom-36 left-10 w-[440px] h-[440px] rounded-full blur-[140px] ${
            isDark ? 'bg-stone-700/25' : 'bg-amber-300/25'
          }`}
        />
      </div>

      {/* Navbar */}
      <header className="relative z-30 pt-5 px-4">
        <div
          className={`max-w-6xl mx-auto px-5 py-3 rounded-2xl backdrop-blur-xl border flex items-center justify-between ${
            isDark
              ? 'bg-white/[0.04] border-white/[0.1] shadow-[0_8px_32px_rgba(0,0,0,0.4)]'
              : 'bg-white/75 border-stone-200/80 shadow-[0_8px_32px_rgba(0,0,0,0.06)]'
          }`}
        >
          <button
            type="button"
            onClick={handleResetHome}
            className="flex items-center gap-3 cursor-pointer text-left group"
          >
            <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-2 rounded-xl shadow-md group-hover:scale-105 transition">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-lg md:text-xl tracking-tight block leading-none">
                SMRY &amp; YT Reader AI
              </span>
              <span
                className={`text-[11px] tracking-widest uppercase ${
                  isDark ? 'text-amber-400/80' : 'text-amber-700'
                }`}
              >
                Created by VisionCut Studio
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs md:text-sm font-medium border backdrop-blur-xl transition cursor-pointer ${
              isDark
                ? 'bg-white/[0.06] border-white/[0.12] text-amber-200 hover:bg-white/[0.12]'
                : 'bg-stone-900 text-amber-100 border-stone-800 hover:bg-stone-800'
            }`}
          >
            {isDark ? (
              <>
                <Sun className="w-4 h-4 text-amber-400" />
                <span>Bright</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-amber-300" />
                <span>Dark</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Center Hero & Input Box */}
      {modeType === 'none' ? (
        <main className="relative z-20 flex-1 flex flex-col items-center justify-center px-4 py-12">
          <div className="w-full max-w-3xl text-center space-y-7">
            <div
              className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs md:text-sm font-medium tracking-wide border backdrop-blur-xl ${
                isDark
                  ? 'bg-amber-500/10 border-amber-400/20 text-amber-300'
                  : 'bg-amber-500/15 border-amber-600/20 text-amber-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Read Any Article Cleanly • Transcribe Any YouTube Video</span>
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.12]">
              Summarize Any Link{' '}
              <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-amber-200 bg-clip-text text-transparent">
                In Seconds.
              </span>
            </h1>

            <p
              className={`text-base md:text-xl max-w-2xl mx-auto leading-relaxed ${
                isDark ? 'text-stone-400' : 'text-stone-600'
              }`}
            >
              Paste any <strong>Web Article / Blog URL</strong> or <strong>YouTube Video Link</strong> below for clean formatted reading, clickable links, transcripts, and AI notes.
            </p>

            {/* Input Form */}
            <form
              onSubmit={handleSubmit}
              className={`relative z-30 p-2.5 rounded-2xl border backdrop-blur-xl flex flex-col sm:flex-row gap-2.5 ${
                isDark
                  ? 'bg-white/[0.06] border-white/[0.15] shadow-[0_20px_50px_rgba(0,0,0,0.5)]'
                  : 'bg-white/90 border-stone-300 shadow-[0_20px_50px_rgba(0,0,0,0.08)]'
              }`}
            >
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Paste any Article URL or YouTube link..."
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  className={`w-full bg-transparent px-4 py-3.5 text-base md:text-lg focus:outline-none ${
                    isDark
                      ? 'text-white placeholder-stone-500'
                      : 'text-stone-900 placeholder-stone-400'
                  }`}
                />
                <button
                  type="button"
                  onClick={handlePasteClick}
                  className={`px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 shrink-0 border cursor-pointer transition ${
                    isDark
                      ? 'bg-white/[0.06] border-white/[0.12] text-stone-300 hover:bg-white/[0.12]'
                      : 'bg-stone-100 border-stone-300 text-stone-700 hover:bg-stone-200'
                  }`}
                >
                  <ClipboardPaste className="w-4 h-4" />
                  <span>Paste</span>
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 disabled:opacity-60 text-stone-950 font-bold text-base md:text-lg px-8 py-3.5 rounded-xl transition cursor-pointer shrink-0 flex items-center justify-center gap-2 shadow-lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Reading...</span>
                  </>
                ) : (
                  <>
                    <span>Read &amp; Summarize</span>
                    <ArrowUpRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>

            {error && (
              <div className="bg-red-950/80 border border-red-500/40 text-red-200 px-5 py-3.5 rounded-2xl text-sm md:text-base text-left">
                {error}
              </div>
            )}

            {/* Sample Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 text-left">
              <button
                type="button"
                onClick={() => {
                  const sampleArticle = 'https://paulgraham.com/greatwork.html';
                  setInputUrl(sampleArticle);
                  fetchContent(sampleArticle);
                }}
                className={`p-5 rounded-2xl border backdrop-blur-xl cursor-pointer transition text-left group ${
                  isDark
                    ? 'bg-white/[0.03] border-white/[0.08] hover:border-amber-400/40 hover:bg-white/[0.06]'
                    : 'bg-white/70 border-stone-200/80 hover:border-amber-500/50 hover:bg-white'
                }`}
              >
                <div className="text-amber-400 font-semibold text-sm uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span>01 • Test Article Reader</span>
                  <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition" />
                </div>
                <p className={`text-sm md:text-base ${isDark ? 'text-stone-300' : 'text-stone-700'}`}>
                  Read Paul Graham&apos;s essay in clean reader view + AI summary.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  const demoUrl = 'https://www.youtube.com/watch?v=lF6MOx6BxXM';
                  setInputUrl(demoUrl);
                  fetchContent(demoUrl);
                }}
                className={`p-5 rounded-2xl border backdrop-blur-xl cursor-pointer transition text-left group ${
                  isDark
                    ? 'bg-white/[0.03] border-white/[0.08] hover:border-amber-400/40 hover:bg-white/[0.06]'
                    : 'bg-white/70 border-stone-200/80 hover:border-amber-500/50 hover:bg-white'
                }`}
              >
                <div className="text-amber-400 font-semibold text-sm uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span>02 • Test YouTube Transcript</span>
                  <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition" />
                </div>
                <p className={`text-sm md:text-base ${isDark ? 'text-stone-300' : 'text-stone-700'}`}>
                  Extract clickable timestamps from YouTube video <span className="underline">lF6MOx6BxXM</span>.
                </p>
              </button>
            </div>

            {/* SEO Content & FAQ Section */}
            <section className="pt-8 text-left">
              <div
                className={`p-6 rounded-2xl border backdrop-blur-xl space-y-4 ${
                  isDark
                    ? 'bg-white/[0.03] border-white/[0.08]'
                    : 'bg-white/75 border-stone-200/80'
                }`}
              >
                <h2 className="text-xl md:text-2xl font-bold">
                  Free YouTube to Text Transcript &amp; AI Article Reader
                </h2>
                <p className={`text-sm md:text-base leading-relaxed ${isDark ? 'text-stone-400' : 'text-stone-600'}`}>
                  SMRY &amp; YT Reader AI by VisionCut Studio lets students, researchers, and creators extract full YouTube video transcripts with clickable timestamps and convert long blog posts into clean, ad-free reading pages with instant AI summaries in English, Hindi, and Hinglish.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div>
                    <h3 className="font-semibold text-amber-400 text-sm mb-1">
                      How to get a YouTube transcript?
                    </h3>
                    <p className={`text-xs md:text-sm ${isDark ? 'text-stone-400' : 'text-stone-600'}`}>
                      Paste any YouTube video URL in the box above and click Read &amp; Summarize to get timestamped captions and .TXT export in 1 second.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-amber-400 text-sm mb-1">
                      How to summarize any web article?
                    </h3>
                    <p className={`text-xs md:text-sm ${isDark ? 'text-stone-400' : 'text-stone-600'}`}>
                      Paste any blog or news article link to remove clutter, view clickable links cleanly, and generate a structured TL;DR summary.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-amber-400 text-sm mb-1">
                      Is this tool free to use?
                    </h3>
                    <p className={`text-xs md:text-sm ${isDark ? 'text-stone-400' : 'text-stone-600'}`}>
                      Yes, you can extract unlimited transcripts, search keywords inside videos, and download study notes completely free.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </main>
      ) : (
        /* Split-Screen Workspace */
        <main className="relative z-20 max-w-6xl w-full mx-auto px-4 py-6 space-y-6">
          <form
            onSubmit={handleSubmit}
            className={`relative z-30 flex flex-col sm:flex-row gap-2 max-w-3xl mx-auto p-2 rounded-2xl border backdrop-blur-xl ${
              isDark
                ? 'bg-white/[0.05] border-white/[0.12]'
                : 'bg-white/90 border-stone-300'
            }`}
          >
            <div className="flex-1 flex items-center gap-2">
              <input
                type="text"
                autoComplete="off"
                placeholder="Paste another Article URL or YouTube link..."
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                className={`w-full bg-transparent px-4 py-2 text-base focus:outline-none ${
                  isDark ? 'text-white placeholder-stone-500' : 'text-stone-900 placeholder-stone-400'
                }`}
              />
              <button
                type="button"
                onClick={handlePasteClick}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 shrink-0 border cursor-pointer ${
                  isDark
                    ? 'bg-white/[0.06] border-white/[0.12] text-stone-300 hover:bg-white/[0.12]'
                    : 'bg-stone-100 border-stone-300 text-stone-700'
                }`}
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                <span>Paste</span>
              </button>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="bg-gradient-to-r from-amber-500 to-orange-600 text-stone-950 font-bold text-sm md:text-base px-6 py-2.5 rounded-xl cursor-pointer shrink-0"
            >
              {loading ? 'Reading...' : 'Read & Summarize'}
            </button>
          </form>

          {error && (
            <div className="max-w-3xl mx-auto bg-red-950/80 border border-red-500/40 text-red-200 px-5 py-3 rounded-2xl text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Sidebar */}
            <div className="lg:col-span-5 lg:sticky lg:top-6 space-y-4">
              {modeType === 'youtube' ? (
                <div
                  className={`aspect-video w-full rounded-2xl overflow-hidden border shadow-2xl ${
                    isDark ? 'border-white/[0.12] bg-black' : 'border-stone-300 bg-black'
                  }`}
                >
                  <iframe
                    className="w-full h-full"
                    src={`https://www.youtube.com/embed/${videoId}?start=${startTime}&autoplay=${startTime > 0 ? 1 : 0}`}
                    title="YouTube video player"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : (
                article && (
                  <div
                    className={`rounded-2xl p-5 border backdrop-blur-xl space-y-3 ${
                      isDark
                        ? 'bg-white/[0.04] border-white/[0.1]'
                        : 'bg-white/85 border-stone-200 shadow-lg'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-amber-400 font-semibold">
                      <FileText className="w-4 h-4" />
                      <span>Clean Reader Mode</span>
                    </div>
                    <h2 className="text-lg md:text-xl font-bold leading-snug">{article.title}</h2>
                    <div
                      className={`flex items-center gap-4 text-xs md:text-sm ${
                        isDark ? 'text-stone-400' : 'text-stone-600'
                      }`}
                    >
                      <span>{article.wordCount.toLocaleString()} words</span>
                      <span>•</span>
                      <span>~{article.readTime} min read</span>
                    </div>
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs md:text-sm font-medium text-amber-400 hover:underline pt-1"
                    >
                      <span>Open Original Page</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )
              )}

              {/* AI Summary Card */}
              <div
                className={`rounded-2xl p-5 border backdrop-blur-xl space-y-4 ${
                  isDark
                    ? 'bg-white/[0.04] border-white/[0.1]'
                    : 'bg-white/85 border-stone-200 shadow-lg'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-400" />
                    AI Summary &amp; Notes
                  </span>
                  <select
                    value={language}
                    onChange={(e) => {
                      setLanguage(e.target.value);
                      setNotes('');
                    }}
                    className={`border rounded-xl px-3 py-1.5 text-sm font-medium focus:outline-none ${
                      isDark
                        ? 'bg-stone-900 border-white/[0.15] text-stone-200'
                        : 'bg-white border-stone-300 text-stone-800'
                    }`}
                  >
                    <option value="English">English</option>
                    <option value="Hindi">Hindi</option>
                    <option value="Hinglish">Hinglish</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateNotes}
                  disabled={notesLoading}
                  className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-stone-950 text-base font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow-md"
                >
                  {notesLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Summarizing...</span>
                    </>
                  ) : (
                    'Generate AI Summary'
                  )}
                </button>
              </div>
            </div>

            {/* Right Column: Organized Clean Article / Transcript / Summary */}
            <div
              className={`lg:col-span-7 rounded-2xl border backdrop-blur-xl overflow-hidden shadow-2xl ${
                isDark
                  ? 'bg-white/[0.04] border-white/[0.1]'
                  : 'bg-white/85 border-stone-200'
              }`}
            >
              <div
                className={`p-4 border-b flex flex-wrap items-center justify-between gap-2 ${
                  isDark ? 'border-white/[0.08]' : 'border-stone-200'
                }`}
              >
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setViewMode('reader')}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer transition ${
                      viewMode === 'reader'
                        ? 'bg-amber-500 text-stone-950'
                        : isDark
                        ? 'bg-white/[0.06] text-stone-300 hover:bg-white/[0.12]'
                        : 'bg-stone-200/70 text-stone-700'
                    }`}
                  >
                    {modeType === 'youtube' ? `Transcript (${segments.length})` : 'Clean Article'}
                  </button>
                  {notes && (
                    <button
                      type="button"
                      onClick={() => setViewMode('notes')}
                      className={`px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer transition ${
                        viewMode === 'notes'
                          ? 'bg-amber-500 text-stone-950'
                          : isDark
                          ? 'bg-white/[0.06] text-stone-300 hover:bg-white/[0.12]'
                          : 'bg-stone-200/70 text-stone-700'
                      }`}
                    >
                      AI Summary
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {viewMode === 'reader' && modeType === 'youtube' && (
                    <button
                      type="button"
                      onClick={() => setShowTimestamps(!showTimestamps)}
                      className={`flex items-center gap-1.5 text-xs md:text-sm px-3 py-2 rounded-xl border cursor-pointer transition ${
                        isDark
                          ? 'bg-white/[0.05] border-white/[0.1] text-stone-300 hover:bg-white/[0.1]'
                          : 'bg-white border-stone-300 text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      <Clock className="w-4 h-4" />
                      {showTimestamps ? 'Hide Time' : 'Show Time'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleCopy}
                    className={`flex items-center gap-1.5 text-xs md:text-sm px-3 py-2 rounded-xl border cursor-pointer transition ${
                      isDark
                        ? 'bg-white/[0.05] border-white/[0.1] text-stone-200 hover:bg-white/[0.1]'
                        : 'bg-white border-stone-300 text-stone-800 hover:bg-stone-100'
                    }`}
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className={`flex items-center gap-1.5 text-xs md:text-sm px-3 py-2 rounded-xl border cursor-pointer transition ${
                      isDark
                        ? 'bg-white/[0.05] border-white/[0.1] text-stone-200 hover:bg-white/[0.1]'
                        : 'bg-white border-stone-300 text-stone-800 hover:bg-stone-100'
                    }`}
                  >
                    <Download className="w-4 h-4" />
                    .TXT
                  </button>
                </div>
              </div>

              {viewMode === 'reader' && modeType === 'youtube' && (
                <div
                  className={`p-3.5 border-b ${
                    isDark ? 'border-white/[0.08] bg-black/20' : 'border-stone-200 bg-stone-50/70'
                  }`}
                >
                  <div className="relative">
                    <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      placeholder="Search words in transcript..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={`w-full rounded-xl pl-10 pr-4 py-2 text-base border focus:outline-none ${
                        isDark
                          ? 'bg-white/[0.04] border-white/[0.1] text-white placeholder-stone-500'
                          : 'bg-white border-stone-300 text-stone-900 placeholder-stone-400'
                      }`}
                    />
                  </div>
                </div>
              )}

              <div className="p-6 max-h-[700px] overflow-y-auto space-y-3">
                {viewMode === 'notes' ? (
                  <RichContentRenderer content={notes} isDark={isDark} />
                ) : modeType === 'article' && article ? (
                  <article className="space-y-5">
                    <h1 className="text-2xl md:text-3xl font-extrabold leading-tight border-b border-white/10 pb-4">
                      {article.title}
                    </h1>
                    <RichContentRenderer content={article.content} isDark={isDark} />
                  </article>
                ) : (
                  filteredSegments.map((seg, idx) => (
                    <div
                      key={idx}
                      onClick={() => setStartTime(seg.offset)}
                      className={`group flex items-start gap-3.5 p-2.5 rounded-xl cursor-pointer transition ${
                        isDark ? 'hover:bg-white/[0.06]' : 'hover:bg-amber-500/10'
                      }`}
                    >
                      {showTimestamps && (
                        <span
                          className={`text-xs md:text-sm font-mono px-2.5 py-1 rounded-lg shrink-0 mt-0.5 transition ${
                            isDark
                              ? 'text-amber-300 bg-amber-500/15 group-hover:bg-amber-500 group-hover:text-stone-950'
                              : 'text-amber-800 bg-amber-500/20 group-hover:bg-amber-500 group-hover:text-white'
                          }`}
                        >
                          {formatTime(seg.offset)}
                        </span>
                      )}
                      <p
                        className={`text-base md:text-[17px] leading-relaxed ${
                          isDark ? 'text-stone-200' : 'text-stone-800'
                        }`}
                      >
                        {seg.text}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </main>
      )}

      {/* Footer */}
      <footer className="relative z-20 py-6 text-center">
        <p className="text-xs md:text-sm tracking-wide text-stone-500">
          Created by <span className="font-semibold text-amber-500">VisionCut Studio</span> • Article Reader &amp; YouTube Transcript AI
        </p>
      </footer>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#090807] text-white p-10">Loading...</div>}>
      <ReaderWorkspace />
    </Suspense>
  );
}