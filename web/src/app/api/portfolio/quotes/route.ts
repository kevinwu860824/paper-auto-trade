import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getSchwabQuotes } from '@/lib/schwabEngine';
import { createAdminSupabase } from '@/utils/supabase'; // Corrected path

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tickersStr = searchParams.get('tickers');
  
  if (!tickersStr) {
    return NextResponse.json({ error: 'Missing tickers parameter' }, { status: 400 });
  }

  const tickers = tickersStr.split(',').map(t => t.trim().toUpperCase());
  const supabase = await createClient();

  try {
    // 1. Identify User
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // 2. Fetch Schwab Quotes
    const quotesData = await getSchwabQuotes(user.id, tickers);

    // 3. Flatten the JSON & Sentinel Logic
    const flattened: Record<string, number> = {};
    tickers.forEach(symbol => {
      const q = quotesData[symbol];
      if (q && q.quote && q.quote.lastPrice) {
        flattened[symbol] = q.quote.lastPrice;
      }
    });

    const adminSupabase = createAdminSupabase();
    
    // Fetch all relevant portfolio items to check peaks and stops
    const { data: portfolioItems } = await adminSupabase
      .from('portfolio')
      .select('*')
      .in('ticker', tickers);

    if (portfolioItems && portfolioItems.length > 0) {
      for (const item of portfolioItems) {
        const currentPrice = flattened[item.ticker];
        if (!currentPrice || item.ticker === 'CASH') continue;

        const highestPrice = Number(item.highest_price || item.average_cost || 0);
        const stopLossPct = Number(item.stop_loss_pct || 0.1); 
        const threshold = highestPrice * (1 - stopLossPct);

        // A. Update defense line if new peak reached
        if (currentPrice > highestPrice) {
          console.log(`[Sentinel] New peak for ${item.ticker}: $${currentPrice}. Raising stop-loss line...`);
          await adminSupabase.from('portfolio')
            .update({ highest_price: currentPrice })
            .eq('ticker', item.ticker);
        }
        
        // B. Trigger Force Sell if broken threshold
        else if (currentPrice < threshold) {
          console.warn(`[SENTINEL] STOP LOSS TRIGGERED for ${item.ticker}! Current: $${currentPrice}, Stop: $${threshold.toFixed(2)}`);
          
          // Trigger the internal sell API
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
          fetch(`${baseUrl}/api/portfolio/sell`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticker: item.ticker })
          }).catch(err => console.error("[Sentinel] Internal trigger failed:", err));
        }
      }
    }

    return NextResponse.json(flattened);
  } catch (error: any) {
    console.error("[Quotes API] Critical Error:", error.message);
    const isAuthError = error.message.includes("Token Refresh") || error.message.includes("schwab_access_token") || error.message.includes("Unauthorized");
    return NextResponse.json({ 
      error: 'Failed to fetch Schwab quotes', 
      details: error.message 
    }, { status: isAuthError ? 401 : 500 });
  }
}
