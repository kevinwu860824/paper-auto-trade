import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/utils/supabase';
import { scanForSignalsAndTrade } from '@/lib/schwabEngine';

export const maxDuration = 300; // Allow 5 minutes maximum for Vercel execution (Hobby Tier max is usually 10-60s, Pro is 300s. Rate limits are handled inside).

export async function GET(request: Request) {
  try {
    // Basic protection against brute force triggering (In Vercel production, utilize CRON_SECRET)
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new NextResponse('Unauthorized Cron Execution', { status: 401 });
    }

    const supabase = createServerSupabase();
    
    // V23 Find all users who have an active Schwab connection
    const { data: usersWithTokens, error: userError } = await supabase
      .from('settings')
      .select('user_id')
      .eq('key', 'schwab_access_token');

    if (userError || !usersWithTokens || usersWithTokens.length === 0) {
      return NextResponse.json({ status: 'Skipped - No connected users' });
    }

    console.log(`[V23 Trade Cron] Starting scan for ${usersWithTokens.length} users...`);
    const results = [];

    // Iterate through all users and execute their private scanning/trading logic
    for (const entry of usersWithTokens) {
        if (!entry.user_id) continue;
        try {
            const res = await scanForSignalsAndTrade(entry.user_id);
            results.push({ userId: entry.user_id, result: res });
        } catch (e: any) {
            results.push({ userId: entry.user_id, error: e.message });
        }
    }

    return NextResponse.json({ success: true, processed: results.length, details: results });
  } catch (error: any) {
    return new NextResponse(error.message, { status: 500 });
  }
}
