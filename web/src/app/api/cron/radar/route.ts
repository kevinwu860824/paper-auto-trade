import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/utils/supabase';
import { createClient } from '@/utils/supabase/server';
import { getSchwabQuotes } from '@/lib/schwabEngine';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const forceAnalyzeAll = searchParams.get('forceAnalyzeAll') === 'true';

  // 1. Security Check (Bearer Token for CRON or User Session for Dashboard)
  const authHeader = request.headers.get('authorization');
  let userId: string | null = null;

  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    // Authorized via Cron Secret
  } else {
    // Try authorizing via UI session
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Missing CRON_SECRET or valid session.' }, { status: 401 });
    }
    userId = user.id;
  }

  const adminSupabase = createAdminSupabase();

  try {
    // 2. Fetch Active Watchlist Tickers
    const { data: watchlist, error: watchError } = await adminSupabase
      .from('watchlist')
      .select('ticker')
      .eq('is_active', true);

    if (watchError) throw watchError;
    if (!watchlist || watchlist.length === 0) {
      return NextResponse.json({ message: 'Watchlist is empty, radar idle.' });
    }

    const tickers = watchlist.map(item => item.ticker);

    // 3. Obtain a Valid User ID for Schwab Context (Pick first connected user if not present)
    if (!userId) {
      const { data: tokenEntry } = await adminSupabase
        .from('settings')
        .select('user_id')
        .eq('key', 'schwab_access_token')
        .limit(1)
        .maybeSingle();

      if (!tokenEntry) {
        return NextResponse.json({ error: 'No user with Schwab connection found for market data.' }, { status: 500 });
      }
      userId = tokenEntry.user_id;
    }

    // 4. Determine Candidates
    let candidates: string[] = [];

    if (forceAnalyzeAll) {
      // Opt-in: Directly analyze everything in watchlist
      console.log(`🚀 [Radar API] Force Analyzing ALL: ${tickers.length} tickers.`);
      candidates = [...tickers];
    } else {
      // Default: Only analyze stocks with > 5% drop
      const BATCH_SIZE = 40;
      
      if (!userId) {
        return NextResponse.json({ error: 'System integrity error: Missing active user context for market check.' }, { status: 500 });
      }

      for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
        const batch = tickers.slice(i, i + BATCH_SIZE);
        const quotes = await getSchwabQuotes(userId, batch);

        for (const ticker of batch) {
          const q = quotes[ticker];
          if (!q || !q.quote) continue;
          if (q.quote.netChangePercent <= -0.05) {
            candidates.push(ticker);
          }
        }
      }
    }

    if (candidates.length === 0) {
      return NextResponse.json({ message: 'Radar check complete: No black swan events detected today.' });
    }

    // 5. Trigger Analysis Tasks & Wake up AI
    console.log(`📡 [Radar Detected] Analysis requested for: ${candidates.join(', ')}`);
    
    const taskInserts = candidates.map(ticker => {
      const item: any = { ticker, status: 'pending' };
      if (userId) item.user_id = userId;
      return item;
    });

    const { error: insertError } = await adminSupabase.from('analysis_tasks').insert(taskInserts);
    if (insertError) {
      console.error("[Radar] Task Insert failed. Attempting fallback without user_id...");
      // Fallback: Try without user_id if the column doesn't exist yet
      const fallbackInserts = candidates.map(ticker => ({ ticker, status: 'pending' }));
      const { error: fallbackError } = await adminSupabase.from('analysis_tasks').insert(fallbackInserts);
      if (fallbackError) throw fallbackError;
    }

    // 6. Trigger Cloud Run Job (Automated Wakeup)
    // We reuse the existing external trigger logic
    const triggerUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/trigger-job`;
    fetch(triggerUrl, { method: 'POST' }).catch(err => {
      console.error("[Radar] Failed to trigger Cloud Run background:", err);
    });

    // Update watchlist trigger timestamps
    await adminSupabase
      .from('watchlist')
      .update({ last_triggered_at: new Date().toISOString() })
      .in('ticker', candidates);

    return NextResponse.json({ 
      success: true, 
      detected: candidates, 
      message: `Successfully triggered AI analysis for ${candidates.length} tickers.` 
    });

  } catch (error: any) {
    console.error("🚨 [Radar Error]:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
