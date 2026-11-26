'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  PlaySquare,
  Search,
  Copy,
  Check,
  Download,
  Sparkles,
  Loader2,
  Clock,
} from 'lucide-react';

interface Segment {
  text: string;
  offset: number;
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

function TranscriptWorkspace() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlParam = searchParams.get('v');

  const [inputUrl, setInputUrl] = useState('');
  const [videoId, setVideoId] = useState('');
  const [startTime, setStartTime] = useState(0);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // AI Notes states
  const [notes, setNotes] = useState('');
  const [notesLoading, setNotesLoading] = useState(false);
  const [language, setLanguage] = useState('English');
  const [viewMode, setViewMode] = useState<'transcript' | 'notes'>('transcript');

  const fetchTranscript = async (target: string) => {
    setLoading(true);
    setError('');
    setNotes('');
    setViewMode('transcript');

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target, action: 'transcript' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Transcript nahi mil paya.');
      } else {
        setVideoId(data.videoId);
        setSegments(data.segments);
        setStartTime(0);
        router.push(`/?v=${data.videoId}`, { scroll: false });
      }
    } catch {
      setError('Server connection error.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (urlParam && urlParam !== videoId) {
      setInputUrl(`https://www.youtube.com/watch?v=${urlParam}`);
      fetchTranscript(urlParam);
    }
  }, [urlParam]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim()) return;
    fetchTranscript(inputUrl);
  };

  const handleGenerateNotes = async () => {
    if (notes) {
      setViewMode('notes');
      return;
    }
    setNotesLoading(true);
    setViewMode('notes');
    try {
      const fullText = segments.map((s) => s.text).join(' ');
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'summarize',
          language,
          transcriptText: fullText,
        }),
      });
      const data = await res.json();
      if (res.ok) setNotes(data.notes);
      else setNotes('Notes generate nahi ho paye: ' + data.error);
    } catch {
      setNotes('Error generating AI notes.');
    } finally {
      setNotesLoading(false);
    }
  };

  const filteredSegments = segments.filter((s) =>
    s.text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getPlainText = () => {
    if (viewMode === 'notes') return notes;
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
    link.download = `${videoId || 'youtube'}-${viewMode}.txt`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/90 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col md:flex-row items-center gap-3">
          <div
            onClick={() => {
              setVideoId('');
              setSegments([]);
              router.push('/');
            }}
            className="flex items-center gap-2 cursor-pointer shrink-0"
          >
            <div className="bg-red-600 p-1.5 rounded-lg">
              <PlaySquare className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">YT Transcript & Notes</span>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 flex w-full gap-2">
            <input
              type="text"
              required
              placeholder="Paste YouTube URL or Video ID (e.g., https://youtu.be/lF6MOx6BxXM)"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white text-sm font-semibold px-5 py-2 rounded-lg transition cursor-pointer shrink-0"
            >
              {loading ? 'Loading...' : 'Get Transcript'}
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {error && (
          <div className="bg-red-950/60 border border-red-800 text-red-300 px-4 py-3 rounded-xl mb-6 text-sm">
            {error}
          </div>
        )}

        {/* Landing Hero (Jab koi video open na ho) */}
        {!videoId && !loading && (
          <div className="text-center py-16 max-w-2xl mx-auto">
            <h1 className="text-4xl font-extrabold mb-4">
              Free YouTube Transcript & AI Notes Generator
            </h1>
            <p className="text-slate-400 mb-8">
              Kisi bhi YouTube video ka link upar paste karein aur 1 second mein clickable timestamps ke saath full transcript aur AI study notes payein.
            </p>
            <button
              onClick={() => {
                setInputUrl('https://www.youtube.com/watch?v=lF6MOx6BxXM');
                fetchTranscript('lF6MOx6BxXM');
              }}
              className="text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg border border-slate-700 cursor-pointer"
            >
              Try Demo Video (lF6MOx6BxXM)
            </button>
          </div>
        )}

        {/* Split Workspace (Video Left + Interactive Transcript Right) */}
        {videoId && segments.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Embedded Video + AI Summary Controls */}
            <div className="lg:col-span-5 lg:sticky lg:top-20 space-y-4">
              <div className="aspect-video w-full rounded-xl overflow-hidden border border-slate-800 bg-black shadow-lg">
                <iframe
                  className="w-full h-full"
                  src={`https://www.youtube.com/embed/${videoId}?start=${startTime}&autoplay=${startTime > 0 ? 1 : 0}`}
                  title="YouTube video player"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>

              {/* AI Notes Box */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    AI Study Notes
                  </span>
                  <select
                    value={language}
                    onChange={(e) => {
                      setLanguage(e.target.value);
                      setNotes('');
                    }}
                    className="bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-300"
                  >
                    <option value="English">English</option>
                    <option value="Hindi">Hindi</option>
                    <option value="Hinglish">Hinglish</option>
                  </select>
                </div>
                <button
                  onClick={handleGenerateNotes}
                  disabled={notesLoading}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  {notesLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating Notes...
                    </>
                  ) : (
                    'Generate AI Summary & Notes'
                  )}
                </button>
              </div>
            </div>

            {/* Right Column: Searchable Timestamped Transcript / Notes */}
            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
              {/* Toolbar */}
              <div className="p-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-900/95">
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setViewMode('transcript')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                      viewMode === 'transcript' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    Transcript ({segments.length})
                  </button>
                  {notes && (
                    <button
                      onClick={() => setViewMode('notes')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                        viewMode === 'notes' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      AI Notes
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {viewMode === 'transcript' && (
                    <button
                      onClick={() => setShowTimestamps(!showTimestamps)}
                      className="flex items-center gap-1 text-xs bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 rounded-lg text-slate-300 cursor-pointer"
                      title="Toggle Timestamps"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      {showTimestamps ? 'Hide Time' : 'Show Time'}
                    </button>
                  )}
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-xs bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 rounded-lg text-slate-200 cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1 text-xs bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 rounded-lg text-slate-200 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    .TXT
                  </button>
                </div>
              </div>

              {/* Search Inside Transcript */}
              {viewMode === 'transcript' && (
                <div className="p-3 border-b border-slate-800 bg-slate-950/50">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search words in transcript..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-600"
                    />
                  </div>
                </div>
              )}

              {/* Content Display */}
              <div className="p-4 max-h-[650px] overflow-y-auto space-y-2">
                {viewMode === 'notes' ? (
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                    {notes}
                  </div>
                ) : (
                  filteredSegments.map((seg, idx) => (
                    <div
                      key={idx}
                      onClick={() => setStartTime(seg.offset)}
                      className="group flex items-start gap-3 p-2 rounded-lg hover:bg-slate-800/70 cursor-pointer transition"
                    >
                      {showTimestamps && (
                        <span className="text-xs font-mono text-red-400 bg-red-950/50 px-2 py-0.5 rounded shrink-0 mt-0.5 group-hover:bg-red-600 group-hover:text-white transition">
                          {formatTime(seg.offset)}
                        </span>
                      )}
                      <p className="text-sm text-slate-300 leading-relaxed">{seg.text}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-white p-10">Loading...</div>}>
      <TranscriptWorkspace />
    </Suspense>
  );
}