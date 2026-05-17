import { NextResponse } from 'next/server';

export const runtime = 'edge'; // optional for speed

export async function GET() {
  return NextResponse.json({
    ablyKey: process.env.NEXT_PUBLIC_ABLY_KEY ?? '',
    channelName: process.env.NEXT_PUBLIC_ABLY_CHANNEL ?? 'ar-art:peace-board:v1',
    ablyEnabled: process.env.NEXT_PUBLIC_ABLY_ENABLED === 'true',
  });
}
