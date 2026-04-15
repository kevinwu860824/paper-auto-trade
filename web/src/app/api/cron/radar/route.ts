import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/utils/supabase';
import { getSchwabQuotes } from '@/lib/schwabEngine';

export async function GET(request: Request) {
  // 1. Security Check (Bearer Token)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    // 3. Obtain a Valid User ID for Schwab Context (Pick first connected user)
    // In production, this should ideally be a system admin user.
    const { data: tokenEntry } = await adminSupabase
      .from('settings')
      .select('user_id')
      .eq('key', 'schwab_access_token')
      .limit(1)
      .maybeSingle();

    if (!tokenEntry) {
      return NextResponse.json({ error: 'No user with Schwab connection found for market data.' }, { status: 500 });
    }
    const userId = tokenEntry.user_id;

    // 4. Multi-Batch Quote Fetch (Schwab limit ~50)
    const BATCH_SIZE = 40;
    const candidates: string[] = [];
    
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      const batch = tickers.slice(i, i + BATCH_SIZE);
      const quotes = await getSchwabQuotes(userId, batch);

      for (const ticker of batch) {
        const q = quotes[ticker];
        if (!q || !q.quote) continue;

        // Condition: Daily Drop > 5% (netChangePercent is decimal, e.g. -0.051)
        if (q.quote.netChangePercent <= -0.05) {
          candidates.push(ticker);
        }
      }
    }

    if (candidates.length === 0) {
      return NextResponse.json({ message: 'Radar check complete: No black swan events detected today.' });
    }

    // 5. Trigger Analysis Tasks & Wake up AI
    console.log(`📡 [Radar Detected] Critical drops in: ${candidates.join(', ')}`);
    
    const taskInserts = candidates.map(ticker => ({
      ticker,
      status: 'pending',
      user_id: userId // Tagged to the system user
    }));

    const { error: insertError } = await adminSupabase.from('analysis_tasks').insert(taskInserts);
    if (insertError) throw insertError;

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
