'use client';

import React, { useState, useEffect, useRef } from 'react';

// Baad mein Donate/Support button dikhane ke liye ise true kar dein
const SHOW_DONATE_BUTTON: boolean = false;
const DONATE_URL: string = 'https://buymeacoffee.com/';
const MAX_HISTORY_ITEMS = 8;

interface Segment {
  text: string;
  offset: number;
}

interface ExtractedItem {
  id: string;
  type: 'youtube' | 'article';
  title: string;
  sourceUrl: string;
  videoId?: string;
  segments?: Segment[];
  content: string;
  summaries?: Record<string, string>;
  timestamp: number;
}

function formatSeconds(sec: number): string {
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function renderInlineLinks(text: string): React.ReactNode[] {
  const tokenRegex = /(\[[^\]]+\]\(https?:\/\/[^)]+\)|https?:\/\/[^\s)]+)/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, idx) => {
    const mdMatch = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (mdMatch) {
      return (
        <a
          key={idx}
          href={mdMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber-400 underline decoration-amber-400/50 underline-offset-2 hover:text-amber-300 break-words"
        >
          {mdMatch[1]}
        </a>
      );
    }
    if (/^https?:\/\/[^\s)]+$/.test(part)) {
      return (
        <a
          key={idx}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber-400 underline decoration-amber-400/50 underline-offset-2 hover:text-amber-300 break-all"
        >
          {part}
        </a>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function RichMarkdownView({ content, fontSize }: { content: string; fontSize: number }) {
  const lines = content.split('\n');

  return (
    <div style={{ fontSize: `${fontSize}px` }} className="space-y-4 leading-relaxed">
      {lines.map((rawLine, index) => {
        const line = rawLine.trim();
        if (!line) return <div key={index} className="h-1.5" />;

        if (line.startsWith('### ')) {
          return (
            <h3 key={index} className="text-xl font-bold mt-5 mb-2 text-amber-400">
              {renderInlineLinks(line.replace(/^###\s+/, ''))}
            </h3>
          );
        }
        if (line.startsWith('## ')) {
          return (
            <h2
              key={index}
              className="text-2xl font-bold mt-6 mb-3 border-b border-current/10 pb-1.5 text-amber-300"
            >
              {renderInlineLinks(line.replace(/^##\s+/, ''))}
            </h2>
          );
        }
        if (line.startsWith('# ')) {
          return (
            <h1 key={index} className="text-3xl font-extrabold mt-5 mb-3">
              {renderInlineLinks(line.replace(/^#\s+/, ''))}
            </h1>
          );
        }
        if (/^[-*•]\s+/.test(line)) {
          const cleanBullet = line.replace(/^[-*•]\s+/, '');
          const boldSplit = cleanBullet.match(/^\*\*(.+?)\*\*:?\s*(.*)$/);
          return (
            <div key={index} className="flex items-start gap-3 pl-1">
              <span className="mt-2.5 h-2 w-2 rounded-full bg-amber-500 shrink-0" />
              <p className="flex-1">
                {boldSplit ? (
                  <>
                    <strong className="font-semibold">{boldSplit[1]}: </strong>
                    {renderInlineLinks(boldSplit[2])}
                  </>
                ) : (
                  renderInlineLinks(cleanBullet)
                )}
              </p>
            </div>
          );
        }

        const boldLine = line.replace(/\*\*(.+?)\*\*/g, '$1');
        return (
          <p key={index} className="opacity-95">
            {renderInlineLinks(boldLine)}
          </p>
        );
      })}
    </div>
  );
}

export default function HomePage() {
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [inputUrl, setInputUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [currentItem, setCurrentItem] = useState<ExtractedItem | null>(null);
  const [history, setHistory] = useState<ExtractedItem[]>([]);

  const [activeTab, setActiveTab] = useState<'content' | 'summary'>('content');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showTimestamps, setShowTimestamps] = useState<boolean>(true);
  const [fontSize, setFontSize] = useState<number>(17);
  const [videoStartSec, setVideoStartSec] = useState<number>(0);

  const [summaryLang, setSummaryLang] = useState<'english' | 'hindi' | 'hinglish'>('english');
  const [summaryFormat, setSummaryFormat] = useState<'detailed' | 'short'>('detailed');
  const [summaryLoading, setSummaryLoading] = useState<boolean>(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [copiedType, setCopiedType] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('vc_reader_history_amber_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setHistory(parsed.slice(0, MAX_HISTORY_ITEMS));
        }
      }
    } catch {
      // Ignore storage error
    }
  }, []);

  const saveToHistory = (item: ExtractedItem) => {
    setHistory((prev) => {
      const filtered = prev.filter((h) => h.sourceUrl !== item.sourceUrl);
      const updated = [item, ...filtered].slice(0, MAX_HISTORY_ITEMS);
      try {
        localStorage.setItem('vc_reader_history_amber_v1', JSON.stringify(updated));
      } catch {
        // Ignore quota error
      }
      return updated;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem('vc_reader_history_amber_v1');
    } catch {
      // Ignore
    }
  };

  const handleExtract = async (overrideUrl?: string) => {
    const target = (overrideUrl ?? inputUrl).trim();
    if (!target) {
      setError('Please paste a YouTube video link or web article URL first.');
      return;
    }

    setLoading(true);
    setError(null);
    setSummaryError(null);
    setActiveTab('content');
    setSearchQuery('');
    setVideoStartSec(0);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target, mode: 'extract' }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to extract content.');
      }

      const newItem: ExtractedItem = {
        id: `${Date.now()}`,
        type: data.type,
        title: data.title,
        sourceUrl: data.sourceUrl,
        videoId: data.videoId,
        segments: data.segments,
        content: data.content,
        summaries: {},
        timestamp: Date.now(),
      };

      setCurrentItem(newItem);
      setInputUrl(data.sourceUrl);
      saveToHistory(newItem);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const currentSummaryKey = `${summaryLang}_${summaryFormat}`;
  const activeSummaryText = currentItem?.summaries?.[currentSummaryKey] || '';

  const handleGenerateSummary = async (
    itemToSummarize: ExtractedItem,
    lang = summaryLang,
    fmt = summaryFormat,
    forceRefresh = false
  ) => {
    const key = `${lang}_${fmt}`;
    if (!forceRefresh && itemToSummarize.summaries?.[key]) {
      return;
    }

    setSummaryLoading(true);
    setSummaryError(null);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'summary',
          text: itemToSummarize.content,
          language: lang,
          format: fmt,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'Could not generate AI summary.');
      }

      const updatedItem: ExtractedItem = {
        ...itemToSummarize,
        summaries: {
          ...(itemToSummarize.summaries || {}),
          [key]: data.summary,
        },
      };
      setCurrentItem(updatedItem);
      saveToHistory(updatedItem);
    } catch (err: unknown) {
      setSummaryError(err instanceof Error ? err.message : 'AI summary failed.');
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleTabSwitch = (tab: 'content' | 'summary') => {
    setActiveTab(tab);
    if (tab === 'summary' && currentItem && !summaryLoading) {
      handleGenerateSummary(currentItem, summaryLang, summaryFormat, false);
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      if (clipText) {
        setInputUrl(clipText.trim());
        handleExtract(clipText.trim());
      }
    } catch {
      inputRef.current?.focus();
    }
  };

  const handleNewLinkReset = () => {
    setInputUrl('');
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const triggerCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(label);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleDownloadFile = (ext: 'txt' | 'md') => {
    if (!currentItem) return;
    let output = `# ${currentItem.title}\nSource: ${currentItem.sourceUrl}\n\n`;
    if (activeTab === 'summary' && activeSummaryText) {
      output += `## AI Summary (${summaryLang.toUpperCase()})\n\n${activeSummaryText}`;
    } else if (currentItem.type === 'youtube' && currentItem.segments && showTimestamps) {
      output += currentItem.segments
        .map((s) => `[${formatSeconds(s.offset)}] ${s.text}`)
        .join('\n');
    } else {
      output += currentItem.content;
    }

    const blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${currentItem.title.slice(0, 40).replace(/[^a-z0-9]/gi, '_')}.${ext}`;
    link.click();
  };

  const filteredSegments =
    currentItem?.segments?.filter((s) =>
      s.text.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [];

  const wordCount = currentItem
    ? currentItem.content.split(/\s+/).filter(Boolean).length
    : 0;
  const readTimeMin = Math.max(1, Math.ceil(wordCount / 200));

  return (
    <div
      className={`min-h-screen transition-colors duration-300 relative overflow-x-hidden ${
        darkMode ? 'bg-[#09090b] text-white' : 'bg-[#faf8f5] text-zinc-900'
      }`}
    >
      {/* Warm Amber Ambient Glow (Matching Screenshot) */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className={`absolute -top-24 -left-24 w-[550px] h-[550px] rounded-full blur-[140px] ${
            darkMode ? 'bg-amber-600/15' : 'bg-amber-400/20'
          }`}
        />
        <div
          className={`absolute top-1/3 right-0 w-[450px] h-[450px] rounded-full blur-[140px] ${
            darkMode ? 'bg-orange-600/10' : 'bg-orange-300/15'
          }`}
        />
      </div>

      {/* Top Floating Pill Header */}
      <div className="relative z-20 max-w-5xl mx-auto px-4 pt-5">
        <header
          className={`flex items-center justify-between px-5 py-3.5 rounded-2xl border backdrop-blur-md ${
            darkMode
              ? 'bg-[#121214]/90 border-zinc-800/90 shadow-lg'
              : 'bg-white/90 border-zinc-200 shadow-sm'
          }`}
        >
          <button
            onClick={() => {
              setCurrentItem(null);
              setInputUrl('');
              setError(null);
            }}
            className="flex items-center gap-3.5 text-left"
          >
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-md">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
            </div>
            <div>
              <span className="font-bold text-base md:text-lg tracking-tight block leading-tight">
                SMRY &amp; YT Reader AI
              </span>
              <span className="text-[11px] tracking-widest uppercase font-semibold text-amber-500">
                CREATED BY VISIONCUT STUDIO
              </span>
            </div>
          </button>

          <div className="flex items-center gap-2.5">
            {SHOW_DONATE_BUTTON && (
              <a
                href={DONATE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 text-xs md:text-sm font-semibold transition"
              >
                Support Us
              </a>
            )}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`px-4 py-2 rounded-xl border text-xs md:text-sm font-semibold flex items-center gap-2 transition ${
                darkMode
                  ? 'bg-zinc-900 border-zinc-700/80 text-amber-400 hover:bg-zinc-800'
                  : 'bg-zinc-100 border-zinc-300 text-zinc-800 hover:bg-zinc-200'
              }`}
            >
              <span>{darkMode ? '☀' : '☾'}</span>
              <span>{darkMode ? 'Bright' : 'Dark'}</span>
            </button>
          </div>
        </header>
      </div>

      {/* Centered Hero & Input Section */}
      <main className="relative z-10 max-w-5xl mx-auto px-4 pt-10 pb-16">
        {!currentItem && (
          <div className="text-center max-w-3xl mx-auto">
            {/* Top Amber Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs md:text-sm font-medium mb-6">
              <span>✨</span>
              <span>Read Any Article Cleanly • Transcribe Any YouTube Video</span>
            </div>

            {/* Large Hero Headline */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.1] mb-5">
              Summarize Any Link{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">
                In Seconds.
              </span>
            </h1>

            {/* Subtitle */}
            <p
              className={`text-base md:text-lg max-w-2xl mx-auto mb-9 leading-relaxed ${
                darkMode ? 'text-zinc-400' : 'text-zinc-600'
              }`}
            >
              Paste any <strong className={darkMode ? 'text-zinc-200' : 'text-zinc-900'}>Web Article / Blog URL</strong> or{' '}
              <strong className={darkMode ? 'text-zinc-200' : 'text-zinc-900'}>YouTube Video Link</strong> below for clean
              formatted reading, clickable links, transcripts, and AI notes.
            </p>
          </div>
        )}

        {/* Centered Input Box (Always visible so user can paste another link anytime) */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleExtract();
          }}
          className="max-w-3xl mx-auto mb-6"
        >
          <div
            className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2.5 rounded-2xl border shadow-2xl transition ${
              darkMode
                ? 'bg-[#121214] border-zinc-800 focus-within:border-amber-500/60'
                : 'bg-white border-zinc-300 focus-within:border-amber-500'
            }`}
          >
            <div className="flex-1 flex items-center px-3 py-2">
              <input
                ref={inputRef}
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="Paste YouTube video link or any web article URL..."
                className="w-full bg-transparent text-base md:text-lg focus:outline-none"
              />

              {inputUrl && (
                <button
                  type="button"
                  onClick={handleNewLinkReset}
                  title="Clear & Paste New Link"
                  className={`ml-2 px-2.5 py-1.5 rounded-lg text-xs font-bold shrink-0 transition ${
                    darkMode
                      ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                      : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300'
                  }`}
                >
                  ✕ Clear
                </button>
              )}

              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className={`ml-2 px-3 py-1.5 rounded-lg border text-xs md:text-sm font-medium flex items-center gap-1.5 shrink-0 transition ${
                  darkMode
                    ? 'bg-zinc-900 border-zinc-700/80 text-zinc-300 hover:bg-zinc-800'
                    : 'bg-zinc-100 border-zinc-300 text-zinc-700 hover:bg-zinc-200'
                }`}
              >
                <span>📋</span>
                <span>Paste</span>
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="px-7 py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-base font-bold shadow-lg shadow-orange-600/20 disabled:opacity-50 shrink-0 transition"
            >
              {loading ? 'Processing...' : 'Read & Summarize ↗'}
            </button>
          </div>
        </form>

        {/* Error Box (Exact Dark Red Style from Screenshot) */}
        {error && (
          <div className="max-w-3xl mx-auto mb-8 px-5 py-3.5 rounded-2xl bg-red-950/50 border border-red-800/80 text-red-300 text-sm md:text-base flex items-center justify-between gap-3">
            <span>{error}</span>
            <button
              onClick={() => handleExtract()}
              className="px-3.5 py-1.5 rounded-lg bg-red-900/60 hover:bg-red-800 text-xs font-semibold text-white shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {/* Recent History Bar (Max 8 Items) */}
        {history.length > 0 && (
          <div
            className={`max-w-3xl mx-auto mb-8 p-4 rounded-2xl border ${
              darkMode
                ? 'bg-[#121214]/90 border-zinc-800/90'
                : 'bg-white border-zinc-200 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-500">
                Recent Links ({history.length}/{MAX_HISTORY_ITEMS})
              </span>
              <button
                onClick={clearHistory}
                className="text-xs opacity-60 hover:opacity-100 hover:text-red-400"
              >
                Clear All
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {history.map((item) => {
                const isActive = currentItem?.sourceUrl === item.sourceUrl;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setCurrentItem(item);
                      setInputUrl(item.sourceUrl);
                      setError(null);
                      setVideoStartSec(0);
                    }}
                    className={`px-3.5 py-2 rounded-xl border text-xs md:text-sm flex items-center gap-2 shrink-0 max-w-[250px] transition ${
                      isActive
                        ? 'bg-amber-500/15 border-amber-500/60 text-amber-300 font-semibold'
                        : darkMode
                        ? 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                        : 'bg-zinc-100 border-zinc-200 hover:bg-zinc-200'
                    }`}
                  >
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                      {item.type === 'youtube' ? 'YT' : 'WEB'}
                    </span>
                    <span className="truncate">{item.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Landing Cards & SEO Footer (Shown when no result is open) */}
        {!currentItem && !loading && (
          <>
            {/* Two Sample Cards (01 & 02 from Screenshot) */}
            <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
              <button
                onClick={() => {
                  const sample = 'https://paulgraham.com/greatwork.html';
                  setInputUrl(sample);
                  handleExtract(sample);
                }}
                className={`p-5 rounded-2xl border text-left transition group ${
                  darkMode
                    ? 'bg-[#121214]/90 border-zinc-800/90 hover:border-amber-500/50'
                    : 'bg-white border-zinc-200 hover:border-amber-500 shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold tracking-wider uppercase text-amber-500 mb-2">
                  <span>01 • TEST ARTICLE READER</span>
                  <span className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition">
                    ↗
                  </span>
                </div>
                <p className={`text-sm ${darkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
                  Read Paul Graham&apos;s essay in clean reader view + AI summary.
                </p>
              </button>

              <button
                onClick={() => {
                  const sample = 'https://www.youtube.com/watch?v=aircAruvnKk';
                  setInputUrl(sample);
                  handleExtract(sample);
                }}
                className={`p-5 rounded-2xl border text-left transition group ${
                  darkMode
                    ? 'bg-[#121214]/90 border-zinc-800/90 hover:border-amber-500/50'
                    : 'bg-white border-zinc-200 hover:border-amber-500 shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold tracking-wider uppercase text-amber-500 mb-2">
                  <span>02 • TEST YOUTUBE TRANSCRIPT</span>
                  <span className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition">
                    ↗
                  </span>
                </div>
                <p className={`text-sm ${darkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
                  Extract clickable timestamps from YouTube video{' '}
                  <span className="underline">aircAruvnKk</span>.
                </p>
              </button>
            </div>

            {/* Bottom SEO Info & 3-Column FAQ Card (Exact Match to Screenshot) */}
            <div
              className={`max-w-3xl mx-auto p-6 md:p-8 rounded-2xl border ${
                darkMode
                  ? 'bg-[#121214]/90 border-zinc-800/90'
                  : 'bg-white border-zinc-200 shadow-sm'
              }`}
            >
              <h2 className="text-xl md:text-2xl font-bold mb-3">
                Free YouTube to Text Transcript &amp; AI Article Reader
              </h2>
              <p
                className={`text-sm leading-relaxed mb-6 ${
                  darkMode ? 'text-zinc-400' : 'text-zinc-600'
                }`}
              >
                SMRY &amp; YT Reader AI by VisionCut Studio lets students, researchers, and
                creators extract full YouTube video transcripts with clickable timestamps and
                convert long blog posts into clean, ad-free reading pages with instant AI
                summaries in English, Hindi, and Hinglish.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
                <div>
                  <h3 className="text-xs font-bold text-amber-500 mb-1.5">
                    How to get a YouTube transcript?
                  </h3>
                  <p className={`text-xs leading-relaxed ${darkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    Paste any YouTube video URL in the box above and click Read &amp; Summarize to
                    get timestamped captions and .TXT export in 1 second.
                  </p>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-amber-500 mb-1.5">
                    How to summarize any web article?
                  </h3>
                  <p className={`text-xs leading-relaxed ${darkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    Paste any blog or news article link to remove clutter, view clickable links
                    cleanly, and generate a structured TL;DR summary.
                  </p>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-amber-500 mb-1.5">
                    Is this tool free to use?
                  </h3>
                  <p className={`text-xs leading-relaxed ${darkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    Yes, you can extract unlimited transcripts, search keywords inside videos, and
                    download study notes completely free.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Active Split-Screen Result Workspace */}
        {currentItem && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start mt-4">
            {/* Left Column: Video Embed or Article Info Card */}
            <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-6">
              <div
                className={`rounded-2xl border overflow-hidden ${
                  darkMode
                    ? 'bg-[#121214] border-zinc-800'
                    : 'bg-white border-zinc-200 shadow-md'
                }`}
              >
                {currentItem.type === 'youtube' && currentItem.videoId ? (
                  <div className="aspect-video w-full bg-black">
                    <iframe
                      key={`${currentItem.videoId}-${videoStartSec}`}
                      src={`https://www.youtube.com/embed/${currentItem.videoId}?start=${videoStartSec}&autoplay=${
                        videoStartSec > 0 ? 1 : 0
                      }`}
                      title={currentItem.title}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <div className="p-6 bg-gradient-to-br from-amber-500/15 to-orange-600/10 border-b border-current/10">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-400 block mb-2">
                      Clean Reader Mode
                    </span>
                    <h2 className="text-xl font-bold leading-snug">{currentItem.title}</h2>
                  </div>
                )}

                <div className="p-5 space-y-4">
                  {currentItem.type === 'youtube' && (
                    <h2 className="font-bold text-lg leading-snug">{currentItem.title}</h2>
                  )}

                  <div className="flex flex-wrap items-center gap-3 text-sm opacity-75">
                    <span>{wordCount.toLocaleString()} words</span>
                    <span>•</span>
                    <span>~{readTimeMin} min read</span>
                  </div>

                  <div className="pt-3 border-t border-current/10 flex items-center justify-between gap-2">
                    <a
                      href={currentItem.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-amber-400 hover:underline font-medium"
                    >
                      View Original Source ↗
                    </a>
                    <button
                      onClick={handleNewLinkReset}
                      className="px-3.5 py-1.5 rounded-xl bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 text-sm font-semibold"
                    >
                      + Paste New Link
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Reader & AI Summary Workspace */}
            <div
              className={`lg:col-span-7 rounded-2xl border overflow-hidden ${
                darkMode
                  ? 'bg-[#121214] border-zinc-800'
                  : 'bg-white border-zinc-200 shadow-md'
              }`}
            >
              {/* Tabs Header */}
              <div className="p-4 border-b border-current/10 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 p-1 rounded-xl bg-current/5">
                  <button
                    onClick={() => handleTabSwitch('content')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                      activeTab === 'content'
                        ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow'
                        : 'opacity-75 hover:opacity-100'
                    }`}
                  >
                    {currentItem.type === 'youtube' ? 'Transcript' : 'Clean Article'}
                  </button>
                  <button
                    onClick={() => handleTabSwitch('summary')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                      activeTab === 'summary'
                        ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow'
                        : 'opacity-75 hover:opacity-100'
                    }`}
                  >
                    ✨ AI Summary
                  </button>
                </div>

                {/* Font Size & Export Controls */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFontSize((f) => Math.max(14, f - 1))}
                    className="px-3 py-1.5 rounded-lg border border-current/15 text-sm font-bold hover:bg-current/5"
                  >
                    A-
                  </button>
                  <button
                    onClick={() => setFontSize((f) => Math.min(22, f + 1))}
                    className="px-3 py-1.5 rounded-lg border border-current/15 text-sm font-bold hover:bg-current/5"
                  >
                    A+
                  </button>
                  <button
                    onClick={() => handleDownloadFile('txt')}
                    className="px-3.5 py-1.5 rounded-lg border border-current/15 text-sm font-medium hover:bg-current/5"
                  >
                    Download .TXT
                  </button>
                </div>
              </div>

              {/* TAB 1: TRANSCRIPT OR CLEAN ARTICLE */}
              {activeTab === 'content' && (
                <div className="p-5 space-y-4">
                  <div className="flex flex-wrap items-center gap-2.5">
                    {currentItem.type === 'youtube' && (
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search keyword in transcript..."
                        className={`flex-1 min-w-[200px] px-4 py-2 rounded-xl border text-sm focus:outline-none ${
                          darkMode
                            ? 'bg-zinc-900 border-zinc-700'
                            : 'bg-zinc-100 border-zinc-300'
                        }`}
                      />
                    )}

                    {currentItem.type === 'youtube' && (
                      <button
                        onClick={() => setShowTimestamps(!showTimestamps)}
                        className="px-3.5 py-2 rounded-xl border border-current/15 text-sm font-medium hover:bg-current/5"
                      >
                        {showTimestamps ? 'Hide Timestamps' : 'Show Timestamps'}
                      </button>
                    )}

                    <button
                      onClick={() =>
                        triggerCopy(
                          currentItem.type === 'youtube' &&
                            currentItem.segments &&
                            showTimestamps
                            ? currentItem.segments
                                .map((s) => `[${formatSeconds(s.offset)}] ${s.text}`)
                                .join('\n')
                            : currentItem.content,
                          'main'
                        )
                      }
                      className="px-4 py-2 rounded-xl bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 text-sm font-semibold ml-auto"
                    >
                      {copiedType === 'main' ? 'Copied!' : 'Copy Text'}
                    </button>
                  </div>

                  {/* Content Body */}
                  <div className="max-h-[68vh] overflow-y-auto pr-2 space-y-2.5">
                    {currentItem.type === 'youtube' && currentItem.segments ? (
                      filteredSegments.length > 0 ? (
                        filteredSegments.map((seg, i) => (
                          <div
                            key={i}
                            onClick={() => setVideoStartSec(seg.offset)}
                            style={{ fontSize: `${fontSize}px` }}
                            className="p-2.5 rounded-xl hover:bg-amber-500/10 cursor-pointer transition flex items-start gap-3.5 group"
                          >
                            {showTimestamps && (
                              <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-400 font-mono text-xs shrink-0 mt-0.5 group-hover:bg-amber-500 group-hover:text-black font-semibold transition">
                                {formatSeconds(seg.offset)}
                              </span>
                            )}
                            <p className="leading-relaxed">{seg.text}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-base opacity-60 text-center py-10">
                          No matching words found for &ldquo;{searchQuery}&rdquo;.
                        </p>
                      )
                    ) : (
                      <RichMarkdownView content={currentItem.content} fontSize={fontSize} />
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: AI SUMMARY */}
              {activeTab === 'summary' && (
                <div className="p-5 space-y-4">
                  {/* Language & Format Controls */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5 pb-4 border-b border-current/10">
                    <div className="flex items-center gap-2">
                      {(['english', 'hindi', 'hinglish'] as const).map((lang) => (
                        <button
                          key={lang}
                          onClick={() => {
                            setSummaryLang(lang);
                            handleGenerateSummary(currentItem, lang, summaryFormat, false);
                          }}
                          className={`px-3.5 py-1.5 rounded-xl text-sm font-semibold capitalize transition ${
                            summaryLang === lang
                              ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white'
                              : 'border border-current/15 opacity-75 hover:opacity-100'
                          }`}
                        >
                          {lang}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={summaryFormat}
                        onChange={(e) => {
                          const fmt = e.target.value as 'detailed' | 'short';
                          setSummaryFormat(fmt);
                          handleGenerateSummary(currentItem, summaryLang, fmt, false);
                        }}
                        className={`px-3 py-1.5 rounded-xl border text-sm font-medium focus:outline-none ${
                          darkMode
                            ? 'bg-zinc-900 border-zinc-700'
                            : 'bg-zinc-100 border-zinc-300'
                        }`}
                      >
                        <option value="detailed">Detailed Notes</option>
                        <option value="short">Short Bullets</option>
                      </select>

                      <button
                        onClick={() =>
                          handleGenerateSummary(currentItem, summaryLang, summaryFormat, true)
                        }
                        disabled={summaryLoading}
                        className="px-3.5 py-1.5 rounded-xl border border-current/15 hover:bg-current/5 text-sm font-medium"
                      >
                        {summaryLoading ? 'Generating...' : 'Regenerate'}
                      </button>

                      {activeSummaryText && (
                        <button
                          onClick={() => triggerCopy(activeSummaryText, 'summary')}
                          className="px-3.5 py-1.5 rounded-xl bg-amber-500/15 text-amber-400 text-sm font-semibold"
                        >
                          {copiedType === 'summary' ? 'Copied!' : 'Copy'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Summary Output Area */}
                  <div className="max-h-[65vh] overflow-y-auto pr-2">
                    {summaryLoading ? (
                      <div className="py-16 text-center space-y-3">
                        <div className="inline-block h-7 w-7 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                        <p className="text-base font-medium">
                          Generating {summaryLang} AI summary...
                        </p>
                      </div>
                    ) : summaryError ? (
                      <div className="p-4 rounded-xl bg-red-950/50 border border-red-800/80 text-red-300 text-sm flex items-center justify-between gap-3">
                        <span>{summaryError}</span>
                        <button
                          onClick={() =>
                            handleGenerateSummary(currentItem, summaryLang, summaryFormat, true)
                          }
                          className="px-4 py-1.5 rounded-lg bg-red-900/60 text-sm font-semibold shrink-0"
                        >
                          Try Again
                        </button>
                      </div>
                    ) : activeSummaryText ? (
                      <RichMarkdownView content={activeSummaryText} fontSize={fontSize} />
                    ) : (
                      <div className="py-14 text-center">
                        <button
                          onClick={() =>
                            handleGenerateSummary(currentItem, summaryLang, summaryFormat, true)
                          }
                          className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white text-base font-bold"
                        >
                          Generate AI Summary Now
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}