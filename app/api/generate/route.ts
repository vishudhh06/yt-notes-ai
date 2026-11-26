import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

function extractVideoId(input: string) {
  if (/^[a-zA-Z0-9_-]{11}$/.test(input.trim())) return input.trim();
  const match = input.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/);
  return match && match[2].length === 11 ? match[2] : null;
}

export async function POST(req: Request) {
  try {
    const { url, action, language, transcriptText } = await req.json();

    // Generate AI Study Notes (Only runs when user clicks Generate Notes)
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

    if (!process.env.SUPADATA_API_KEY) {
      return NextResponse.json(
        { error: 'Vercel Environment Variables mein SUPADATA_API_KEY add karein.' },
        { status: 500 }
      );
    }

    const ytUrl = encodeURIComponent(`https://youtu.be/${videoId}`);
    const apiRes = await fetch(
      `https://api.supadata.ai/v1/transcript?url=${ytUrl}&text=false`,
      {
        headers: {
          'x-api-key': process.env.SUPADATA_API_KEY,
        },
      }
    );

    const data = await apiRes.json();

    if (!apiRes.ok || !data?.content) {
      return NextResponse.json(
        { error: data?.message || 'Is video ka transcript available nahi hai.' },
        { status: 404 }
      );
    }

    const segments = Array.isArray(data.content)
      ? data.content.map((item: any) => ({
          offset: Math.floor((item.offset || 0) / 1000),
          text: (item.text || '').replace(/\n/g, ' ').trim(),
        }))
      : [{ offset: 0, text: String(data.content).trim() }];

    return NextResponse.json({ videoId, segments });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Transcript fetch failed.' },
      { status: 500 }
    );
  }
}