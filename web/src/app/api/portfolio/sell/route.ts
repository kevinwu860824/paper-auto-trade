import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminSupabase } from '@/utils/supabase';
import { getSchwabQuotes } from '@/lib/schwabEngine';

export async function POST(request: Request) {
  const supabase = await createClient(); // For auth
  const adminSupabase = createAdminSupabase(); // For atomic DB ops

  try {
    const { ticker } = await request.json();
    if (!ticker) return NextResponse.json({ error: 'Missing ticker' }, { status: 400 });

    // 1. Identify User
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // 2. Fetch Position and CASH record (Atomic)
    const { data: portfolioItems, error: fetchError } = await adminSupabase
      .from('portfolio')
      .select('*')
      .in('ticker', [ticker.toUpperCase(), 'CASH']);

    if (fetchError) throw fetchError;

    const position = portfolioItems.find(p => p.ticker === ticker.toUpperCase());
    const cashEntry = portfolioItems.find(p => p.ticker === 'CASH');

    if (!position) {
      return NextResponse.json({ success: false, message: `找不到 ${ticker} 的持倉紀錄，可能已平倉。` });
    }
    if (!cashEntry) {
      return NextResponse.json({ error: 'CASH account missing' }, { status: 500 });
    }

    // 3. Fetch Real-time Selling Price from Schwab
    console.log(`[Force Sell API] Fetching final quote for ${ticker} from Schwab...`);
    const quotesData = await getSchwabQuotes(user.id, [ticker.toUpperCase()]);
    const currentPrice = quotesData[ticker.toUpperCase()]?.quote?.lastPrice;

    if (!currentPrice || currentPrice <= 0) {
      throw new Error(`無法獲取 ${ticker} 的賣出報價，中止平倉以防損害。`);
    }

    const sellProceeds = position.shares * currentPrice;
    const finalCash = cashEntry.shares + sellProceeds;

    // 4. Execution: Transaction-like sequence
    // A. Add cash back
    const { error: cashUpdateError } = await adminSupabase
      .from('portfolio')
      .update({ shares: finalCash })
      .eq('ticker', 'CASH');
    if (cashUpdateError) throw cashUpdateError;

    // B. Delete the position
    const { error: deleteError } = await adminSupabase
      .from('portfolio')
      .delete()
      .eq('ticker', ticker.toUpperCase());
    if (deleteError) throw deleteError;

    // 5. Logging (Sentinel Alert)
    const logMessage = `【⚠️ 移動停損觸發】標的：${ticker}，以 $${currentPrice.toFixed(2)} 強制平倉 ${position.shares} 股，拿回資金 $${sellProceeds.toFixed(2)}。`;
    console.log(logMessage);

    await adminSupabase.from('analysis_tasks').insert({
      ticker: ticker.toUpperCase(),
      status: 'completed',
      error_log: logMessage, // Repurpose error_log for summary
      user_id: user.id
    });

    return NextResponse.json({ 
      success: true, 
      message: `標的 ${ticker} 已按移動停損機制強制平倉。`,
      data: { ticker, soldPrice: currentPrice, proceeds: sellProceeds }
    });

  } catch (error: any) {
    console.error("[Force Sell API] Fail:", error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
