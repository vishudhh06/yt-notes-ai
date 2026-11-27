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
          className="text-indigo-400 underline decoration-indigo-400/50 underline-offset-2 hover:text-indigo-300 break-words"
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
          className="text-indigo-400 underline decoration-indigo-400/50 underline-offset-2 hover:text-indigo-300 break-all"
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
    <div style={{ fontSize: `${fontSize}px` }} className="space-y-3 leading-relaxed">
      {lines.map((rawLine, index) => {
        const line = rawLine.trim();
        if (!line) return <div key={index} className="h-1" />;

        if (line.startsWith('### ')) {
          return (
            <h3 key={index} className="text-lg font-bold mt-4 mb-1 text-indigo-400">
              {renderInlineLinks(line.replace(/^###\s+/, ''))}
            </h3>
          );
        }
        if (line.startsWith('## ')) {
          return (
            <h2
              key={index}
              className="text-xl font-bold mt-5 mb-2 border-b border-current/10 pb-1"
            >
              {renderInlineLinks(line.replace(/^##\s+/, ''))}
            </h2>
          );
        }
        if (line.startsWith('# ')) {
          return (
            <h1 key={index} className="text-2xl font-extrabold mt-4 mb-2">
              {renderInlineLinks(line.replace(/^#\s+/, ''))}
            </h1>
          );
        }
        if (/^[-*•]\s+/.test(line)) {
          const cleanBullet = line.replace(/^[-*•]\s+/, '');
          const boldSplit = cleanBullet.match(/^\*\*(.+?)\*\*:?\s*(.*)$/);
          return (
            <div key={index} className="flex items-start gap-2.5 pl-1">
              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-indigo-400 shrink-0" />
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
  const [fontSize, setFontSize] = useState<number>(15);
  const [videoStartSec, setVideoStartSec] = useState<number>(0);

  const [summaryLang, setSummaryLang] = useState<'english' | 'hindi' | 'hinglish'>('english');
  const [summaryFormat, setSummaryFormat] = useState<'detailed' | 'short'>('detailed');
  const [summaryLoading, setSummaryLoading] = useState<boolean>(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [copiedType, setCopiedType] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('vc_reader_history_v3');
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
        localStorage.setItem('vc_reader_history_v3', JSON.stringify(updated));
      } catch {
        // Ignore quota error
      }
      return updated;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem('vc_reader_history_v3');
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
      className={`min-h-screen transition-colors duration-300 ${
        darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
      }`}
    >
      {/* Ambient Background Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 left-1/4 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
      </div>

      {/* Sticky Top Header & Persistent Input Bar */}
      <header
        className={`sticky top-0 z-30 backdrop-blur-xl border-b ${
          darkMode
            ? 'bg-slate-950/85 border-slate-800/80'
            : 'bg-white/90 border-slate-200'
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col md:flex-row items-center gap-3">
          {/* Brand Logo */}
          <div className="flex items-center justify-between w-full md:w-auto shrink-0">
            <button
              onClick={() => {
                setCurrentItem(null);
                setInputUrl('');
                setError(null);
              }}
              className="flex items-center gap-2.5 text-left"
            >
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-extrabold shadow-md">
                VC
              </div>
              <div>
                <span className="font-bold text-sm tracking-tight block leading-none">
                  SMRY &amp; YT Reader AI
                </span>
                <span className="text-[10px] opacity-60 font-medium">
                  by VisionCut Studio
                </span>
              </div>
            </button>

            <div className="flex items-center gap-2 md:hidden">
              {SHOW_DONATE_BUTTON && (
                <a
                  href={DONATE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 text-amber-400 text-xs font-medium"
                >
                  Support
                </a>
              )}
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="px-2.5 py-1.5 rounded-lg border border-current/15 text-xs font-medium hover:bg-current/5"
              >
                {darkMode ? 'Light' : 'Dark'}
              </button>
            </div>
          </div>

          {/* Persistent Search / Paste Another Link Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleExtract();
            }}
            className="flex-1 w-full flex items-center gap-2"
          >
            <div
              className={`flex-1 flex items-center rounded-xl border px-3 py-1.5 transition ${
                darkMode
                  ? 'bg-slate-900/90 border-slate-700/80 focus-within:border-indigo-500'
                  : 'bg-slate-100 border-slate-300 focus-within:border-indigo-500'
              }`}
            >
              <input
                ref={inputRef}
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="Paste YouTube video link or any article URL..."
                className="w-full bg-transparent text-sm focus:outline-none"
              />
              {inputUrl ? (
                <button
                  type="button"
                  onClick={handleNewLinkReset}
                  title="Clear & Paste New Link"
                  className="px-2 py-0.5 rounded-md text-xs font-bold opacity-70 hover:opacity-100 hover:bg-current/10"
                >
                  Clear
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePasteFromClipboard}
                  title="Paste from Clipboard"
                  className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 shrink-0"
                >
                  Paste
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-semibold shadow-md disabled:opacity-50 shrink-0"
            >
              {loading ? 'Extracting...' : 'Extract'}
            </button>
          </form>

          {/* Desktop Theme & Future Donate Button */}
          <div className="hidden md:flex items-center gap-2 shrink-0">
            {SHOW_DONATE_BUTTON && (
              <a
                href={DONATE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 text-xs font-semibold transition"
              >
                Support Us
              </a>
            )}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="px-3 py-2 rounded-xl border border-current/15 text-xs font-medium hover:bg-current/5 transition"
            >
              {darkMode ? 'Light Mode' : 'Dark Mode'}
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-4 py-6">
        {/* Error Banner */}
        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-between gap-3">
            <span className="text-sm">{error}</span>
            <button
              onClick={() => handleExtract()}
              className="px-3 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-xs font-semibold shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {/* Recent History Strip (Max 8 Items) */}
        {history.length > 0 && (
          <div
            className={`mb-6 p-3.5 rounded-2xl border ${
              darkMode
                ? 'bg-slate-900/60 border-slate-800'
                : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider opacity-60">
                Recent History ({history.length}/{MAX_HISTORY_ITEMS})
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
                    className={`px-3 py-1.5 rounded-xl border text-xs flex items-center gap-2 shrink-0 max-w-[240px] transition ${
                      isActive
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 font-medium'
                        : darkMode
                        ? 'bg-slate-800/70 border-slate-700/70 hover:border-slate-600'
                        : 'bg-slate-100 border-slate-200 hover:bg-slate-200/70'
                    }`}
                  >
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        item.type === 'youtube'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-emerald-500/20 text-emerald-400'
                      }`}
                    >
                      {item.type === 'youtube' ? 'YT' : 'WEB'}
                    </span>
                    <span className="truncate">{item.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty Landing State */}
        {!currentItem && !loading && (
          <div className="text-center py-14 max-w-2xl mx-auto">
            <div className="inline-block px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 text-xs font-medium mb-4">
              Free Transcript &amp; Clean Article Reader
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3">
              Extract YouTube Transcripts &amp; Summarize Any Article in 1 Second
            </h1>
            <p className="text-sm md:text-base opacity-70 mb-8">
              Paste any YouTube video URL for clickable timestamps or any blog link to read clutter-free with instant AI summaries in English, Hindi, and Hinglish.
            </p>

            {/* Quick Sample Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
              <span className="opacity-50">Try sample:</span>
              <button
                onClick={() => {
                  const sample = 'https://www.youtube.com/watch?v=aircAruvnKk';
                  setInputUrl(sample);
                  handleExtract(sample);
                }}
                className="px-3 py-1.5 rounded-lg border border-current/15 hover:bg-current/5"
              >
                YouTube: 3Blue1Brown Neural Networks
              </button>
              <button
                onClick={() => {
                  const sample = 'https://paulgraham.com/greatwork.html';
                  setInputUrl(sample);
                  handleExtract(sample);
                }}
                className="px-3 py-1.5 rounded-lg border border-current/15 hover:bg-current/5"
              >
                Article: Paul Graham Essay
              </button>
            </div>
          </div>
        )}

        {/* Active Workspace (Split View) */}
        {currentItem && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Video Embed or Article Info Card */}
            <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-20">
              <div
                className={`rounded-2xl border overflow-hidden ${
                  darkMode
                    ? 'bg-slate-900/75 border-slate-800'
                    : 'bg-white border-slate-200 shadow-sm'
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
                  <div className="p-5 bg-gradient-to-br from-indigo-600/15 to-purple-600/10 border-b border-current/10">
                    <span className="text-xs font-semibold text-emerald-400 block mb-2">
                      Clean Reader Mode
                    </span>
                    <h2 className="text-lg font-bold leading-snug">{currentItem.title}</h2>
                  </div>
                )}

                <div className="p-4 space-y-3">
                  {currentItem.type === 'youtube' && (
                    <h2 className="font-bold text-base leading-snug">{currentItem.title}</h2>
                  )}

                  <div className="flex flex-wrap items-center gap-3 text-xs opacity-70">
                    <span>{wordCount.toLocaleString()} words</span>
                    <span>•</span>
                    <span>~{readTimeMin} min read</span>
                  </div>

                  <div className="pt-2 border-t border-current/10 flex items-center justify-between gap-2">
                    <a
                      href={currentItem.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-400 hover:underline font-medium"
                    >
                      View Original Source ↗
                    </a>
                    <button
                      onClick={handleNewLinkReset}
                      className="px-2.5 py-1 rounded-lg bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 text-xs font-semibold"
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
                  ? 'bg-slate-900/75 border-slate-800'
                  : 'bg-white border-slate-200 shadow-sm'
              }`}
            >
              {/* Tabs Header */}
              <div className="p-3 border-b border-current/10 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-current/5">
                  <button
                    onClick={() => handleTabSwitch('content')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      activeTab === 'content'
                        ? 'bg-indigo-600 text-white shadow'
                        : 'opacity-70 hover:opacity-100'
                    }`}
                  >
                    {currentItem.type === 'youtube' ? 'Transcript' : 'Clean Article'}
                  </button>
                  <button
                    onClick={() => handleTabSwitch('summary')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      activeTab === 'summary'
                        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow'
                        : 'opacity-70 hover:opacity-100'
                    }`}
                  >
                    AI Summary
                  </button>
                </div>

                {/* Font Size & Export Controls */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setFontSize((f) => Math.max(13, f - 1))}
                    className="px-2 py-1 rounded-lg border border-current/15 text-xs font-bold hover:bg-current/5"
                    title="Decrease Font Size"
                  >
                    A-
                  </button>
                  <button
                    onClick={() => setFontSize((f) => Math.min(20, f + 1))}
                    className="px-2 py-1 rounded-lg border border-current/15 text-xs font-bold hover:bg-current/5"
                    title="Increase Font Size"
                  >
                    A+
                  </button>
                  <button
                    onClick={() => handleDownloadFile('txt')}
                    className="px-2.5 py-1 rounded-lg border border-current/15 text-xs font-medium hover:bg-current/5"
                    title="Download TXT"
                  >
                    Download .TXT
                  </button>
                </div>
              </div>

              {/* TAB 1: TRANSCRIPT OR CLEAN ARTICLE */}
              {activeTab === 'content' && (
                <div className="p-4 space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {currentItem.type === 'youtube' && (
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search keyword in transcript..."
                        className={`flex-1 min-w-[180px] px-3 py-1.5 rounded-xl border text-xs focus:outline-none ${
                          darkMode
                            ? 'bg-slate-800/80 border-slate-700'
                            : 'bg-slate-100 border-slate-300'
                        }`}
                      />
                    )}

                    {currentItem.type === 'youtube' && (
                      <button
                        onClick={() => setShowTimestamps(!showTimestamps)}
                        className="px-2.5 py-1.5 rounded-xl border border-current/15 text-xs font-medium hover:bg-current/5"
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
                      className="px-3 py-1.5 rounded-xl bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 text-xs font-semibold ml-auto"
                    >
                      {copiedType === 'main' ? 'Copied!' : 'Copy Text'}
                    </button>
                  </div>

                  {/* Content Body */}
                  <div className="max-h-[65vh] overflow-y-auto pr-1 space-y-2">
                    {currentItem.type === 'youtube' && currentItem.segments ? (
                      filteredSegments.length > 0 ? (
                        filteredSegments.map((seg, i) => (
                          <div
                            key={i}
                            onClick={() => setVideoStartSec(seg.offset)}
                            style={{ fontSize: `${fontSize}px` }}
                            className="p-2 rounded-xl hover:bg-indigo-500/10 cursor-pointer transition flex items-start gap-3 group"
                          >
                            {showTimestamps && (
                              <span className="px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-400 font-mono text-xs shrink-0 mt-0.5 group-hover:bg-indigo-600 group-hover:text-white transition">
                                {formatSeconds(seg.offset)}
                              </span>
                            )}
                            <p className="leading-relaxed">{seg.text}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm opacity-60 text-center py-8">
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
                <div className="p-4 space-y-4">
                  {/* Language & Format Controls */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-current/10">
                    <div className="flex items-center gap-1.5">
                      {(['english', 'hindi', 'hinglish'] as const).map((lang) => (
                        <button
                          key={lang}
                          onClick={() => {
                            setSummaryLang(lang);
                            handleGenerateSummary(currentItem, lang, summaryFormat, false);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition ${
                            summaryLang === lang
                              ? 'bg-indigo-600 text-white'
                              : 'border border-current/15 opacity-75 hover:opacity-100'
                          }`}
                        >
                          {lang}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <select
                        value={summaryFormat}
                        onChange={(e) => {
                          const fmt = e.target.value as 'detailed' | 'short';
                          setSummaryFormat(fmt);
                          handleGenerateSummary(currentItem, summaryLang, fmt, false);
                        }}
                        className={`px-2.5 py-1 rounded-lg border text-xs font-medium focus:outline-none ${
                          darkMode
                            ? 'bg-slate-800 border-slate-700'
                            : 'bg-slate-100 border-slate-300'
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
                        className="px-2.5 py-1 rounded-lg border border-current/15 hover:bg-current/5 text-xs font-medium"
                      >
                        {summaryLoading ? 'Generating...' : 'Regenerate'}
                      </button>

                      {activeSummaryText && (
                        <button
                          onClick={() => triggerCopy(activeSummaryText, 'summary')}
                          className="px-2.5 py-1 rounded-lg bg-indigo-500/15 text-indigo-400 text-xs font-semibold"
                        >
                          {copiedType === 'summary' ? 'Copied!' : 'Copy'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Summary Output Area */}
                  <div className="max-h-[60vh] overflow-y-auto pr-1">
                    {summaryLoading ? (
                      <div className="py-14 text-center space-y-2">
                        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
                        <p className="text-sm font-medium">
                          Generating {summaryLang} AI summary...
                        </p>
                      </div>
                    ) : summaryError ? (
                      <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center justify-between gap-2">
                        <span>{summaryError}</span>
                        <button
                          onClick={() =>
                            handleGenerateSummary(currentItem, summaryLang, summaryFormat, true)
                          }
                          className="px-3 py-1 rounded-lg bg-red-500/20 text-xs font-semibold shrink-0"
                        >
                          Try Again
                        </button>
                      </div>
                    ) : activeSummaryText ? (
                      <RichMarkdownView content={activeSummaryText} fontSize={fontSize} />
                    ) : (
                      <div className="py-12 text-center">
                        <button
                          onClick={() =>
                            handleGenerateSummary(currentItem, summaryLang, summaryFormat, true)
                          }
                          className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold"
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