import { NextRequest, NextResponse } from 'next/server';

interface TranscriptSegment {
  text: string;
  offset: number;
  duration?: number;
}

interface InnertubeCaptionTrack {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
}

interface InnertubePlayerResponse {
  playabilityStatus?: {
    status?: string;
    reason?: string;
  };
  videoDetails?: {
    title?: string;
    author?: string;
  };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: InnertubeCaptionTrack[];
    };
  };
}

interface InnertubeAttemptResult {
  segments: TranscriptSegment[];
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
      console.warn(`[Transcript] Supadata skipped (HTTP ${res.status}) — falling back.`);
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
    console.warn('[Transcript] Supadata request error — falling back:', err);
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

    if (!res.ok) {
      console.warn(`[Transcript] External proxy returned HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    if (Array.isArray(data?.segments)) {
      return data.segments
        .map((s: { text?: string; offset?: number }) => ({
          text: decodeHtmlEntities(s.text || ''),
          offset: Math.floor(Number(s.offset || 0)),
        }))
        .filter((s: TranscriptSegment) => s.text.length > 0);
    }
  } catch (err) {
    console.warn('[Transcript] External proxy error:', err);
  }

  return [];
}

async function fetchViaInnertubeClient(
  videoId: string,
  clientType: 'IOS' | 'ANDROID'
): Promise<InnertubeAttemptResult> {
  const clientConfig =
    clientType === 'IOS'
      ? {
          userAgent:
            'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)',
          client: {
            clientName: 'IOS',
            clientVersion: '19.29.1',
            deviceMake: 'Apple',
            deviceModel: 'iPhone16,2',
            osName: 'iPhone',
            osVersion: '17.5.1.21F90',
            hl: 'en',
            gl: 'US',
          },
        }
      : {
          userAgent: 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip',
          client: {
            clientName: 'ANDROID',
            clientVersion: '19.09.37',
            androidSdkVersion: 30,
            hl: 'en',
            gl: 'US',
          },
        };

  const playerRes = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': clientConfig.userAgent,
      'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
    },
    body: JSON.stringify({
      context: { client: clientConfig.client },
      videoId,
    }),
    signal: AbortSignal.timeout(9000),
    cache: 'no-store',
  });

  if (playerRes.status === 429 || playerRes.status === 403) {
    return { segments: [], ipBlocked: true, privateOrUnavailable: false };
  }

  if (!playerRes.ok) {
    return { segments: [], ipBlocked: false, privateOrUnavailable: false };
  }

  const data = (await playerRes.json()) as InnertubePlayerResponse;
  const status = data?.playabilityStatus?.status || '';
  const reason = data?.playabilityStatus?.reason || '';

  if (status === 'LOGIN_REQUIRED' || /bot|sign in|unusual traffic/i.test(reason)) {
    return { segments: [], ipBlocked: true, privateOrUnavailable: false };
  }

  if (status === 'UNPLAYABLE' || status === 'PRIVATE') {
    return { segments: [], ipBlocked: false, privateOrUnavailable: true };
  }

  const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return { segments: [], ipBlocked: false, privateOrUnavailable: false };
  }

  // Prefer manually uploaded captions first, then English/Hindi, then default track
  const preferredTrack =
    tracks.find((t) => t.kind !== 'asr' && t.languageCode === 'en') ||
    tracks.find((t) => t.kind !== 'asr') ||
    tracks.find((t) => t.languageCode === 'en') ||
    tracks.find((t) => t.languageCode === 'hi') ||
    tracks[0];

  if (!preferredTrack?.baseUrl) {
    return { segments: [], ipBlocked: false, privateOrUnavailable: false };
  }

  const captionRes = await fetch(preferredTrack.baseUrl, {
    signal: AbortSignal.timeout(9000),
    cache: 'no-store',
  });

  if (captionRes.status === 429 || captionRes.status === 403) {
    return { segments: [], ipBlocked: true, privateOrUnavailable: false };
  }

  if (!captionRes.ok) {
    return { segments: [], ipBlocked: false, privateOrUnavailable: false };
  }

  const xml = await captionRes.text();
  const segments = parseTimedTextXml(xml);

  return { segments, ipBlocked: false, privateOrUnavailable: false };
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
        // Continue with fallback title
      }

      // Tier 1: Managed API (Supadata)
      let segments = await fetchViaSupadata(videoId);

      // Tier 2: Custom Residential Proxy / VPS Worker (if configured)
      if (segments.length === 0) {
        segments = await fetchViaExternalWorker(videoId);
      }

      // Tier 3: YouTube Innertube Mobile Clients (iOS -> Android)
      let ipBlocked = false;
      let privateOrUnavailable = false;

      if (segments.length === 0) {
        const iosResult = await fetchViaInnertubeClient(videoId, 'IOS').catch(() => ({
          segments: [],
          ipBlocked: false,
          privateOrUnavailable: false,
        }));
        segments = iosResult.segments;
        ipBlocked = iosResult.ipBlocked;
        privateOrUnavailable = iosResult.privateOrUnavailable;
      }

      if (segments.length === 0 && !privateOrUnavailable) {
        const androidResult = await fetchViaInnertubeClient(videoId, 'ANDROID').catch(() => ({
          segments: [],
          ipBlocked: false,
          privateOrUnavailable: false,
        }));
        segments = androidResult.segments;
        ipBlocked = ipBlocked || androidResult.ipBlocked;
        privateOrUnavailable = privateOrUnavailable || androidResult.privateOrUnavailable;
      }

      if (segments.length === 0) {
        if (privateOrUnavailable) {
          return NextResponse.json(
            { error: 'This video is private, members-only, or unavailable.' },
            { status: 403 }
          );
        }
        if (ipBlocked) {
          console.error(`[Transcript] All providers blocked by YouTube IP restriction for ${videoId}`);
          return NextResponse.json(
            {
              error:
                'YouTube has temporarily rate-limited requests from this cloud server IP. Please try again shortly or configure TRANSCRIPT_PROXY_URL.',
            },
            { status: 503 }
          );
        }
        return NextResponse.json(
          {
            error:
              'Transcript unavailable for this video (captions may be disabled by the creator).',
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

    // B. Web Article Extraction (Preserved)
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
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
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