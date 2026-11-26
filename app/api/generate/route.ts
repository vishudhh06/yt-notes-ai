import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

function extractVideoId(input: string) {
  if (/^[a-zA-Z0-9_-]{11}$/.test(input.trim())) return input.trim();
  const match = input.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/);
  return match && match[2].length === 11 ? match[2] : null;
}

async function getFastCaptions(videoId: string) {
  const clients = [
    {
      ua: 'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)',
      context: {
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
      },
    },
    {
      ua: 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip',
      context: {
        client: {
          clientName: 'ANDROID',
          clientVersion: '19.09.37',
          androidSdkVersion: 30,
          hl: 'en',
          gl: 'US',
        },
      },
    },
  ];

  for (const c of clients) {
    try {
      const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': c.ua,
        },
        body: JSON.stringify({ context: c.context, videoId }),
      });

      const data = await res.json();
      const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (!tracks || tracks.length === 0) continue;

      const track =
        tracks.find((t: any) => t.languageCode === 'en' && !t.kind) ||
        tracks.find((t: any) => t.languageCode?.startsWith('en')) ||
        tracks[0];

      const captionRes = await fetch(`${track.baseUrl}&fmt=json3`);
      const captionJson = await captionRes.json();

      const segments = (captionJson.events || [])
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
    } catch {
      continue;
    }
  }
  return null;
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

    const segments = await getFastCaptions(videoId);
    if (!segments) {
      return NextResponse.json(
        { error: 'Is video par captions/subtitles available nahi hain.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ videoId, segments });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Server error.' },
      { status: 500 }
    );
  }
}