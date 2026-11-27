import { NextRequest, NextResponse } from 'next/server';

interface TranscriptSegment {
  text: string;
  offset: number;
  duration?: number;
}

interface CaptionTrack {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
}

interface PlayerResponse {
  playabilityStatus?: {
    status?: string;
    reason?: string;
  };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[];
    };
  };
}

interface ExtractionAttempt {
  segments: TranscriptSegment[];
  tracksFound: boolean;
  ipBlocked: boolean;
  privateOrUnavailable: boolean;
}

function extractYouTubeId(url: string): string | null {
  const trimmed = url.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

function extractJsonArrayAfterKey(source: string, key: string): unknown[] | null {
  const keyIndex = source.indexOf(key);
  if (keyIndex === -1) return null;

  const startBracket = source.indexOf('[', keyIndex + key.length);
  if (startBracket === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startBracket; i < source.length; i++) {
    const ch = source[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === '[') depth++;
      else if (ch === ']') {
        depth--;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(source.slice(startBracket, i + 1));
            return Array.isArray(parsed) ? parsed : null;
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

function parseTimedTextXml(xml: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];

  // Format 1: <text start="1.23" dur="4.56">Caption</text>
  const textRegex = /<text\s+start="([^"]+)"(?:\s+dur="([^"]+)")?[^>]*>([\s\S]*?)<\/text>/g;
  let match: RegExpExecArray | null;

  while ((match = textRegex.exec(xml)) !== null) {
    const startSec = Math.floor(parseFloat(match[1] || '0'));
    const durSec = parseFloat(match[2] || '0');
    const cleanText = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, ''));
    if (cleanText) {
      segments.push({ text: cleanText, offset: startSec, duration: durSec });
    }
  }

  if (segments.length > 0) return segments;

  // Format 2: <p t="1230" d="4560">Caption</p>
  const pRegex = /<p\s+t="(\d+)"(?:\s+d="(\d+)")?[^>]*>([\s\S]*?)<\/p>/g;
  while ((match = pRegex.exec(xml)) !== null) {
    const startSec = Math.floor(parseInt(match[1] || '0', 10) / 1000);
    const durSec = parseInt(match[2] || '0', 10) / 1000;
    const cleanText = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, ''));
    if (cleanText) {
      segments.push({ text: cleanText, offset: startSec, duration: durSec });
    }
  }

  return segments;
}

function parseJson3Captions(raw: string): TranscriptSegment[] {
  try {
    const data = JSON.parse(raw) as {
      events?: Array<{
        tStartMs?: number;
        dDurationMs?: number;
        segs?: Array<{ utf8?: string }>;
      }>;
    };
    if (!Array.isArray(data?.events)) return [];

    const segments: TranscriptSegment[] = [];
    for (const ev of data.events) {
      if (!Array.isArray(ev.segs)) continue;
      const combined = decodeHtmlEntities(
        ev.segs.map((s) => s.utf8 || '').join('')
      );
      if (combined) {
        segments.push({
          text: combined,
          offset: Math.floor((ev.tStartMs || 0) / 1000),
          duration: (ev.dDurationMs || 0) / 1000,
        });
      }
    }
    return segments;
  } catch {
    return [];
  }
}

function selectPreferredTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (!tracks.length) return null;
  return (
    tracks.find((t) => t.kind !== 'asr' && t.languageCode === 'en') ||
    tracks.find((t) => t.kind !== 'asr' && t.languageCode === 'hi') ||
    tracks.find((t) => t.kind !== 'asr') ||
    tracks.find((t) => t.languageCode === 'en') ||
    tracks.find((t) => t.languageCode === 'hi') ||
    tracks[0]
  );
}

async function downloadCaptionTrack(
  baseUrl: string
): Promise<{ segments: TranscriptSegment[]; blocked: boolean }> {
  const cleanBase = baseUrl.replace(/\\u0026/g, '&');

  // 1. Try default XML timedtext URL
  const xmlRes = await fetch(cleanBase, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(9000),
    cache: 'no-store',
  });

  if (xmlRes.status === 429 || xmlRes.status === 403) {
    return { segments: [], blocked: true };
  }

  if (xmlRes.ok) {
    const bodyText = await xmlRes.text();
    if (bodyText.trim()) {
      const xmlSegments = parseTimedTextXml(bodyText);
      if (xmlSegments.length > 0) {
        return { segments: xmlSegments, blocked: false };
      }
      const jsonSegments = parseJson3Captions(bodyText);
      if (jsonSegments.length > 0) {
        return { segments: jsonSegments, blocked: false };
      }
    }
  }

  // 2. Try explicit json3 format if default XML returned empty
  const json3Url = cleanBase.includes('fmt=')
    ? cleanBase.replace(/fmt=[^&]+/, 'fmt=json3')
    : `${cleanBase}&fmt=json3`;

  const jsonRes = await fetch(json3Url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(9000),
    cache: 'no-store',
  });

  if (jsonRes.status === 429 || jsonRes.status === 403) {
    return { segments: [], blocked: true };
  }

  if (jsonRes.ok) {
    const jsonText = await jsonRes.text();
    if (jsonText.trim()) {
      const segments = parseJson3Captions(jsonText);
      if (segments.length > 0) {
        return { segments, blocked: false };
      }
    }
  }

  // Track existed on YouTube, but timedtext returned 0 bytes (datacenter IP block)
  return { segments: [], blocked: true };
}

async function fetchViaSupadata(videoId: string): Promise<TranscriptSegment[]> {
  const supadataKey = process.env.SUPADATA_API_KEY;
  if (!supadataKey) return [];

  try {
    const res = await fetch(
      `https://api.supadata.ai/v1/youtube/transcript?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${videoId}`
      )}&text=false`,
      {
        headers: { 'x-api-key': supadataKey },
        signal: AbortSignal.timeout(10000),
        cache: 'no-store',
      }
    );

    if (!res.ok) {
      console.warn(`[Transcript] Supadata skipped (HTTP ${res.status}) — using fallback.`);
      return [];
    }

    const data = await res.json();
    if (Array.isArray(data?.content)) {
      return data.content
        .map((item: { text?: string; offset?: number; duration?: number }) => ({
          text: decodeHtmlEntities(item.text || ''),
          offset: Math.floor((item.offset || 0) / 1000),
          duration: (item.duration || 0) / 1000,
        }))
        .filter((s: TranscriptSegment) => s.text.length > 0);
    }

    if (typeof data?.content === 'string' && data.content.trim()) {
      return [{ text: decodeHtmlEntities(data.content), offset: 0 }];
    }
  } catch (err) {
    console.warn('[Transcript] Supadata network error — using fallback:', err);
  }

  return [];
}

async function fetchViaExternalWorker(videoId: string): Promise<TranscriptSegment[]> {
  const proxyUrl = process.env.TRANSCRIPT_PROXY_URL;
  if (!proxyUrl) return [];

  try {
    const res = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.TRANSCRIPT_PROXY_SECRET
          ? { Authorization: `Bearer ${process.env.TRANSCRIPT_PROXY_SECRET}` }
          : {}),
      },
      body: JSON.stringify({
        videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
      }),
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    });

    if (!res.ok) return [];

    const data = await res.json();
    if (Array.isArray(data?.segments)) {
      return data.segments
        .map((s: { text?: string; offset?: number }) => ({
          text: decodeHtmlEntities(s.text || ''),
          offset: Math.floor(Number(s.offset || 0)),
        }))
        .filter((s: TranscriptSegment) => s.text.length > 0);
    }
  } catch {
    // Fall through
  }

  return [];
}

async function fetchViaInnertubeClient(
  videoId: string,
  clientType: 'TV_EMBED' | 'IOS' | 'ANDROID'
): Promise<ExtractionAttempt> {
  const configs = {
    TV_EMBED: {
      userAgent:
        'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version',
      body: {
        context: {
          client: {
            clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
            clientVersion: '2.0',
            hl: 'en',
            gl: 'US',
          },
          thirdParty: {
            embedUrl: 'https://www.youtube.com/',
          },
        },
        videoId,
      },
    },
    IOS: {
      userAgent:
        'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
      body: {
        context: {
          client: {
            clientName: 'IOS',
            clientVersion: '20.10.4',
            deviceMake: 'Apple',
            deviceModel: 'iPhone16,2',
            osName: 'iPhone',
            osVersion: '18.3.2.22D82',
            hl: 'en',
            gl: 'US',
          },
        },
        videoId,
      },
    },
    ANDROID: {
      userAgent: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip',
      body: {
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: '20.10.38',
            androidSdkVersion: 34,
            hl: 'en',
            gl: 'US',
          },
        },
        videoId,
      },
    },
  };

  const selected = configs[clientType];
  const playerRes = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': selected.userAgent,
      'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
    },
    body: JSON.stringify(selected.body),
    signal: AbortSignal.timeout(9000),
    cache: 'no-store',
  });

  if (playerRes.status === 429 || playerRes.status === 403) {
    return { segments: [], tracksFound: false, ipBlocked: true, privateOrUnavailable: false };
  }

  if (!playerRes.ok) {
    return { segments: [], tracksFound: false, ipBlocked: false, privateOrUnavailable: false };
  }

  const data = (await playerRes.json()) as PlayerResponse;
  const status = data?.playabilityStatus?.status || '';
  const reason = data?.playabilityStatus?.reason || '';

  if (status === 'LOGIN_REQUIRED' || /bot|sign in|unusual traffic/i.test(reason)) {
    return { segments: [], tracksFound: false, ipBlocked: true, privateOrUnavailable: false };
  }

  if (status === 'UNPLAYABLE' || status === 'PRIVATE') {
    return { segments: [], tracksFound: false, ipBlocked: false, privateOrUnavailable: true };
  }

  const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return { segments: [], tracksFound: false, ipBlocked: false, privateOrUnavailable: false };
  }

  const track = selectPreferredTrack(tracks);
  if (!track?.baseUrl) {
    return { segments: [], tracksFound: true, ipBlocked: false, privateOrUnavailable: false };
  }

  const download = await downloadCaptionTrack(track.baseUrl);
  return {
    segments: download.segments,
    tracksFound: true,
    ipBlocked: download.blocked,
    privateOrUnavailable: false,
  };
}

async function fetchViaWatchPageHtml(videoId: string): Promise<ExtractionAttempt> {
  const watchRes = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      Cookie: 'CONSENT=YES+cb.20210328-17-p0.en+FX+667',
    },
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
  });

  if (watchRes.status === 429 || watchRes.status === 403) {
    return { segments: [], tracksFound: false, ipBlocked: true, privateOrUnavailable: false };
  }

  if (!watchRes.ok) {
    return { segments: [], tracksFound: false, ipBlocked: false, privateOrUnavailable: false };
  }

  const html = await watchRes.text();

  if (html.includes('consent.youtube.com') || html.includes('Sorry for the interruption')) {
    return { segments: [], tracksFound: false, ipBlocked: true, privateOrUnavailable: false };
  }

  const rawTracks = extractJsonArrayAfterKey(html, '"captionTracks":');
  if (!rawTracks || rawTracks.length === 0) {
    return { segments: [], tracksFound: false, ipBlocked: false, privateOrUnavailable: false };
  }

  const tracks = rawTracks as CaptionTrack[];
  const track = selectPreferredTrack(tracks);
  if (!track?.baseUrl) {
    return { segments: [], tracksFound: true, ipBlocked: false, privateOrUnavailable: false };
  }

  const download = await downloadCaptionTrack(track.baseUrl);
  return {
    segments: download.segments,
    tracksFound: true,
    ipBlocked: download.blocked,
    privateOrUnavailable: false,
  };
}

function cleanArticleMarkdown(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\((javascript:[^)]+|#)\)/gi, '$1')
    .replace(/!\[[^\]]*\]\(data:image[^)]+\)/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function generateSummaryDirect(
  text: string,
  language: string,
  format: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing in environment variables.');
  }

  const langInstruction =
    language === 'hindi'
      ? 'Write the entire summary in natural, clear Hindi (Devanagari script).'
      : language === 'hinglish'
      ? 'Write the entire summary in natural conversational Hinglish (Hindi words written in English alphabet).'
      : 'Write the entire summary in clear, crisp English.';

  const formatInstruction =
    format === 'short'
      ? 'Keep it ultra-concise: 1-line TL;DR + 5 sharp bullet points.'
      : 'Provide a structured breakdown with: ## TL;DR (2 lines), ## Key Takeaways (5-8 detailed bullet points with bold lead-ins), and ## Conclusion.';

  const safeText = text.slice(0, 28000);
  const prompt = `You are an expert research assistant. Summarize the following content accurately.\n${langInstruction}\n${formatInstruction}\nStart directly with the summary without any intro.\n\nCONTENT:\n${safeText}`;

  const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
  let lastErr = 'AI summary generation failed.';

  for (const modelName of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
          signal: AbortSignal.timeout(20000),
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        lastErr = errData?.error?.message || `Gemini API error (${res.status})`;
        continue;
      }

      const data = await res.json();
      const output: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (output.trim()) {
        return output.trim();
      }
    } catch (e: unknown) {
      if (e instanceof Error) lastErr = e.message;
    }
  }

  throw new Error(lastErr);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const url = typeof body?.url === 'string' ? body.url : '';
    const mode = typeof body?.mode === 'string' ? body.mode : 'extract';
    const text = typeof body?.text === 'string' ? body.text : '';
    const language = typeof body?.language === 'string' ? body.language : 'english';
    const format = typeof body?.format === 'string' ? body.format : 'detailed';

    // 1. AI Summary Mode
    if (mode === 'summary') {
      if (text.trim().length < 25) {
        return NextResponse.json(
          { error: 'Not enough content available to summarize.' },
          { status: 400 }
        );
      }
      const summary = await generateSummaryDirect(text, language, format);
      return NextResponse.json({ summary });
    }

    // 2. Content Extraction Mode
    if (!url.trim()) {
      return NextResponse.json({ error: 'Please enter a valid URL.' }, { status: 400 });
    }

    const cleanUrl = url.trim();
    const videoId = extractYouTubeId(cleanUrl);

    // A. YouTube Transcript Extraction Chain
    if (videoId) {
      let title = `YouTube Video (${videoId})`;
      try {
        const oembed = await fetch(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
          { signal: AbortSignal.timeout(6000), cache: 'no-store' }
        );
        if (oembed.status === 404) {
          return NextResponse.json(
            { error: 'Video not found. Please check the YouTube URL.' },
            { status: 404 }
          );
        }
        if (oembed.ok) {
          const meta = await oembed.json();
          if (meta?.title) title = meta.title;
        }
      } catch {
        // Continue with default title
      }

      // Tier 1: Managed API (Supadata)
      let segments = await fetchViaSupadata(videoId);

      // Tier 2: Custom External Worker / Proxy (if configured)
      if (segments.length === 0) {
        segments = await fetchViaExternalWorker(videoId);
      }

      let tracksFound = false;
      let ipBlocked = false;
      let privateOrUnavailable = false;

      // Tier 3: YouTube Embedded TV Client -> Watch Page HTML -> iOS -> Android
      const fallbackSteps: Array<() => Promise<ExtractionAttempt>> = [
        () => fetchViaInnertubeClient(videoId, 'TV_EMBED'),
        () => fetchViaWatchPageHtml(videoId),
        () => fetchViaInnertubeClient(videoId, 'IOS'),
        () => fetchViaInnertubeClient(videoId, 'ANDROID'),
      ];

      for (const runStep of fallbackSteps) {
        if (segments.length > 0 || privateOrUnavailable) break;
        try {
          const attempt = await runStep();
          if (attempt.segments.length > 0) {
            segments = attempt.segments;
            break;
          }
          tracksFound = tracksFound || attempt.tracksFound;
          ipBlocked = ipBlocked || attempt.ipBlocked;
          privateOrUnavailable = privateOrUnavailable || attempt.privateOrUnavailable;
        } catch {
          // Try next extraction method
        }
      }

      if (segments.length === 0) {
        if (privateOrUnavailable) {
          return NextResponse.json(
            { error: 'This video is private, members-only, or unavailable.' },
            { status: 403 }
          );
        }

        if (tracksFound || ipBlocked) {
          console.error(
            `[Transcript] YouTube blocked caption download from Vercel IP for ${videoId} (tracksFound=${tracksFound}, ipBlocked=${ipBlocked})`
          );
          return NextResponse.json(
            {
              error:
                'Captions exist for this video, but YouTube temporarily blocked the transcript download from Vercel’s server IP. Update SUPADATA_API_KEY or configure TRANSCRIPT_PROXY_URL in Vercel to bypass datacenter IP blocks.',
            },
            { status: 503 }
          );
        }

        return NextResponse.json(
          {
            error:
              'No captions or subtitles were found for this video (it may not have subtitles enabled).',
          },
          { status: 404 }
        );
      }

      const plainText = segments.map((s) => s.text).join(' ');

      return NextResponse.json({
        type: 'youtube',
        videoId,
        title,
        sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
        segments,
        content: plainText,
        transcript: plainText,
      });
    }

    // B. Web Article Flow (Preserved)
    let targetUrl = cleanUrl;
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = `https://${targetUrl}`;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrl);
    } catch {
      return NextResponse.json({ error: 'Invalid URL format.' }, { status: 400 });
    }

    let articleMarkdown = '';
    let articleTitle = parsedUrl.hostname.replace('www.', '');

    try {
      const jinaHeaders: Record<string, string> = {
        Accept: 'text/plain',
        'X-Remove-Selector': 'nav, footer, header, aside, .ads, .sidebar, .comments',
      };
      if (process.env.JINA_API_KEY) {
        jinaHeaders.Authorization = `Bearer ${process.env.JINA_API_KEY}`;
      }

      const jinaRes = await fetch(`https://r.jina.ai/${targetUrl}`, {
        headers: jinaHeaders,
        signal: AbortSignal.timeout(12000),
        cache: 'no-store',
      });

      if (jinaRes.ok) {
        const rawMd = await jinaRes.text();
        const titleMatch = rawMd.match(/^Title:\s*(.+)$/m);
        if (titleMatch && titleMatch[1]) {
          articleTitle = titleMatch[1].trim();
        }
        const cleaned = rawMd
          .replace(/^Title:.*$/m, '')
          .replace(/^URL Source:.*$/m, '')
          .replace(/^Markdown Content:\s*/m, '');
        articleMarkdown = cleanArticleMarkdown(cleaned);
      }
    } catch {
      // Proceed to direct HTML fallback
    }

    if (!articleMarkdown || articleMarkdown.length < 100) {
      const directRes = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!directRes.ok) {
        return NextResponse.json(
          { error: 'Unable to fetch this webpage. The site may block automated readers.' },
          { status: 400 }
        );
      }
      const html = await directRes.text();
      const h1Match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (h1Match && h1Match[1]) articleTitle = h1Match[1].trim();

      articleMarkdown = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    return NextResponse.json({
      type: 'article',
      title: articleTitle,
      sourceUrl: targetUrl,
      content: articleMarkdown,
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      return NextResponse.json(
        { error: 'Request timed out while fetching content. Please try again.' },
        { status: 504 }
      );
    }
    const message = err instanceof Error ? err.message : 'Something went wrong.';
    console.error('[API /generate Error]:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}