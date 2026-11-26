import { NextResponse } from 'next/server';
import { YoutubeTranscript } from 'youtube-transcript';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

function extractVideoId(input: string) {
  if (/^[a-zA-Z0-9_-]{11}$/.test(input.trim())) return input.trim();
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = input.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

export async function POST(req: Request) {
  try {
    const { url, action, language, transcriptText } = await req.json();

    // Action 2: Jab user "Generate AI Notes" button dabaye (Fast Text Summary)
    if (action === 'summarize') {
      if (!transcriptText) {
        return NextResponse.json({ error: 'Transcript missing.' }, { status: 400 });
      }
      const model = genAI.getGenerativeModel({ model: 'gemini-3.8-flash' });
      const prompt = `Create clean, structured study notes and a quick summary in ${language || 'English'} from this YouTube transcript:\n\n${transcriptText.slice(0, 35000)}`;
      const result = await model.generateContent(prompt);
      return NextResponse.json({ notes: result.response.text() });
    }

    // Action 1: Instant Transcript Fetch (1-2 seconds)
    const videoId = extractVideoId(url);
    if (!videoId) {
      return NextResponse.json({ error: 'Invalid YouTube URL or Video ID.' }, { status: 400 });
    }

    const items = await YoutubeTranscript.fetchTranscript(videoId);
    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: 'Is video par captions/subtitles available nahi hain.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      videoId,
      segments: items.map((item) => ({
        text: item.text.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
        offset: Math.floor(item.offset / 1000), // seconds mein timestamp
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Captions fetch nahi ho paye. Check karein ki video public hai aur usme CC/Subtitles hain.' },
      { status: 500 }
    );
  }
}