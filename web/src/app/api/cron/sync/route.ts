import { NextResponse } from 'next/server';
import { syncForMarketSnapshots } from '@/lib/schwabEngine';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const result = await syncForMarketSnapshots();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Market Sync Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
