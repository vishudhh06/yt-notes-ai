import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

function extractVideoId(input: string) {
  if (/^[a-zA-Z0-9_-]{11}$/.test(input.trim())) return input.trim();
  const match = input.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/);
  return match && match[2].length === 11 ? match[2] : null;
}

async function fetchTranscriptFromWatchPage(videoId: string) {
  const watchRes = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      Cookie: 'CONSENT=YES+cb.20210328-17-p0.en+FX+417',
    },
  });

  const html = await watchRes.text();

  // Extract captionTracks JSON directly from ytInitialPlayerResponse
  const match = html.match(/"captionTracks":(\[.*?\])/);
  if (!match) {
    if (html.includes('Sign in to confirm you’re not a bot') || html.includes('g-recaptcha')) {
      throw new Error('YouTube ne Vercel server IP ko temporarily block kiya hai.');
    }
    throw new Error('Is video ke captions HTML mein nahi mile.');
  }

  const tracks = JSON.parse(match[1]);
  if (!tracks || tracks.length === 0) {
    throw new Error('Is video mein koi caption track nahi hai.');
  }

  const track =
    tracks.find((t: any) => t.languageCode === 'en' && !t.kind) ||
    tracks.find((t: any) => t.languageCode?.startsWith('en')) ||
    tracks.find((t: any) => t.languageCode === 'hi') ||
    tracks[0];

  // Fetch JSON3 format first
  const jsonRes = await fetch(`${track.baseUrl}&fmt=json3`);
  const raw = await jsonRes.text();

  if (raw.trim().startsWith('{')) {
    const data = JSON.parse(raw);
    const segments = (data.events || [])
      .filter((ev: any) => ev.segs && ev.tStartMs !== undefined)
      .map((ev: any) => ({
        offset: Math.floor(ev.tStartMs / 1000),
        text: ev.segs
          .map((s: any) => s.utf8 || '')
          .join('')
          .replace(/\n/g, ' ')
          .trim(),
      }))
      .filter((s: any) => s.text.length > 0);

    if (segments.length > 0) return segments;
  }

  // Fallback to XML parsing if JSON3 is empty
  const xmlRes = await fetch(track.baseUrl);
  const xml = await xmlRes.text();
  const segments: { offset: number; text: string }[] = [];
  const regex = /<text start="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let m;
  while ((m = regex.exec(xml)) !== null) {
    const clean = m[2]
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\n/g, ' ')
      .trim();
    if (clean) {
      segments.push({ offset: Math.floor(parseFloat(m[1])), text: clean });
    }
  }

  if (segments.length === 0) {
    throw new Error('Caption file empty aayi.');
  }
  return segments;
}

export async function POST(req: Request) {
  try {
    const { url, action, language, transcriptText } = await req.json();

    if (action === 'summarize') {
      if (!transcriptText) {
        return NextResponse.json({ error: 'Transcript empty hai.' }, { status: 400 });
      }
      const model = genAI.getGenerativeModel({ model: 'gemini-3.8-flash' });
      const prompt = `Create clean, structured study notes and a quick summary in ${language || 'English'} from this YouTube transcript:\n\n${transcriptText.slice(0, 35000)}`;
      const result = await model.generateContent(prompt);
      return NextResponse.json({ notes: result.response.text() });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return NextResponse.json({ error: 'Invalid YouTube URL.' }, { status: 400 });
    }

    const segments = await fetchTranscriptFromWatchPage(videoId);
    return NextResponse.json({ videoId, segments });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Transcript fetch failed.' },
      { status: 500 }
    );
  }
}