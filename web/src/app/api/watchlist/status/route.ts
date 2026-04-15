import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/utils/supabase';
import { createClient } from '@/utils/supabase/server';
import { getSchwabQuotes } from '@/lib/schwabEngine';

export async function GET(request: Request) {
  const adminSupabase = createAdminSupabase();

  try {
    // 1. Identify current authenticated user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = user.id;

    // 2. Fetch Active Watchlist
    let { data: watchlist, error: watchError } = await adminSupabase
      .from('watchlist')
      .select('*')
      .eq('is_active', true)
      .order('ticker', { ascending: true });

    if (watchError) throw watchError;

    let tickers: string[] = [];
    let isAutoDiscovered = false;

    if (!watchlist || watchlist.length === 0) {
      // SMART FALLBACK: If watchlist is empty, discover from trade_signals
      console.log("🕵️ [Watchlist API] Table 'watchlist' is empty. Attempting discovery from 'trade_signals'...");
      
      const { data: recentSignals, error: fallbackError } = await adminSupabase
        .from('trade_signals')
        .select('ticker')
        .order('created_at', { ascending: false })
        .limit(300); // Broaden scan to 300 recent signals

      if (fallbackError) {
        console.error("❌ [Watchlist API] Fallback discovery failed:", fallbackError.message);
        throw fallbackError;
      }

      if (recentSignals && recentSignals.length > 0) {
        const uniqueTickers = Array.from(new Set(recentSignals.map(s => s.ticker)));
        tickers = uniqueTickers;
        isAutoDiscovered = true;
        console.log(`✅ [Watchlist API] Discovered ${tickers.length} tickers from signals:`, tickers);
        
        watchlist = tickers.map(t => ({
          ticker: t,
          is_active: true,
          last_triggered_at: null
        })) as any[];
      } else {
        console.log("ℹ️ [Watchlist API] No signals found in 'trade_signals' either.");
      }
    } else {
      tickers = watchlist.map(item => item.ticker);
      console.log(`📋 [Watchlist API] Found ${tickers.length} active items in watchlist.`);
    }

    if (tickers.length === 0) {
      return NextResponse.json({ success: true, data: [], message: "No tickers found in watchlist or signals." });
    }

    // 3. Fetch Latest ALL Signals for these tickers
    const { data: signals, error: sigError } = await adminSupabase
      .from('trade_signals')
      .select('ticker, composite_score, action, created_at')
      .in('ticker', tickers)
      .order('created_at', { ascending: false });

    if (sigError) throw sigError;

    // 4. Fetch Real-time Quotes
    console.log(`📡 [Watchlist API] Fetching Schwab quotes for: ${tickers.join(', ')}`);
    const quotes = await getSchwabQuotes(userId, tickers);

    // 5. Merge Data
    if (!watchlist) {
      return NextResponse.json({ success: true, data: [] });
    }

    const result = watchlist.map(item => {
      const q = quotes[item.ticker];
      const latestSignal = signals?.find(s => s.ticker === item.ticker);
      
      // Safety Casting: Handle cases where database might return string for numeric fields
      const score = latestSignal ? Number(latestSignal.composite_score) : 0;
      
      let tier = 'N/A';
      if (score >= 85) tier = 'S';
      else if (score >= 70) tier = 'A';
      else if (score >= 60) tier = 'B';
      else if (score > 0) tier = 'C';

      return {
        ticker: item.ticker,
        price: q?.quote?.lastPrice || null,
        changePct: q?.quote?.netChangePercent ? q.quote.netChangePercent * 100 : null,
        tier,
        score,
        action: latestSignal?.action || null,
        lastAnalysis: latestSignal?.created_at || null,
        lastTriggered: item.last_triggered_at,
        isAutoDiscovered
      };
    });

    return NextResponse.json({
      success: true,
      data: result,
      source: isAutoDiscovered ? 'signals_fallback' : 'watchlist'
    });

  } catch (error: any) {
    console.error("🚨 [Watchlist API] Critical Error:", error.message);
    const isAuthError = error.message.includes("Token Refresh") || error.message.includes("schwab_access_token");
    return NextResponse.json(
      { success: false, error: error.message }, 
      { status: isAuthError ? 401 : 500 }
    );
  }
}
