import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminSupabase } from '@/utils/supabase';
import { getSchwabQuotes } from '@/lib/schwabEngine';

export async function POST() {
  const supabase = await createClient(); // For auth
  const adminSupabase = createAdminSupabase(); // For database consistency

  try {
    // 1. Identify User
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // 2. Fetch PENDING High-Score Signals (>= 60)
    const { data: signals, error: sigError } = await adminSupabase
      .from('trade_signals')
      .select('*')
      .eq('status', 'PENDING')
      .gte('composite_score', 60);

    if (sigError) throw sigError;
    if (!signals || signals.length === 0) {
      return NextResponse.json({ success: false, message: "目前無符合建倉條件 (Score >= 60) 的訊號。" }, { status: 400 });
    }

    // 3. Fetch current CASH balance (Stored in 'portfolio' table as ticker='CASH')
    const { data: cashRecord, error: cashError } = await adminSupabase
      .from('portfolio')
      .select('*')
      .eq('ticker', 'CASH')
      // .eq('user_id', user.id) // Enable if user_id column exists
      .single();

    if (cashError || !cashRecord) {
      return NextResponse.json({ success: false, message: "找不到 CASH 賬戶紀錄，請確保 portfolio 表已初始化。" }, { status: 400 });
    }
    
    const currentCash = cashRecord.shares;
    const reserveThreshold = 30000;

    if (currentCash < reserveThreshold) {
      return NextResponse.json({ success: false, message: `資金警戒：現金餘額 $${currentCash} 低於 $${reserveThreshold} 備用金限制，中止建倉。` }, { status: 400 });
    }

    // 4. Fetch Real-time Quotes from Schwab
    const tickers = signals.map(s => s.ticker);
    console.log(`[Allocation API] Getting Schwab quotes for candidates: ${tickers.join(', ')}`);
    const quotesData = await getSchwabQuotes(user.id, tickers);

    // 5. Allocation Logic
    const getTargetAmount = (score: number) => {
      if (score >= 85) return 10000; // S Tier
      if (score >= 70) return 8000;  // A Tier
      if (score >= 60) return 5000;  // B Tier
      return 0;
    };

    const getTierLabel = (score: number) => {
      if (score >= 85) return 'S';
      if (score >= 70) return 'A';
      return 'B';
    };

    const allocationItems = [];
    let totalTargetCost = 0;

    for (const sig of signals) {
      const q = quotesData[sig.ticker];
      const price = q?.quote?.lastPrice;

      if (!price || price <= 0) {
        console.warn(`[Allocation API] Skipping ${sig.ticker}: No valid Schwab quote.`);
        continue;
      }

      const targetAmount = getTargetAmount(sig.composite_score);
      const sharesToBuy = Math.floor(targetAmount / price);
      const actualCost = sharesToBuy * price;

      if (sharesToBuy > 0) {
        allocationItems.push({
          id: sig.id,
          ticker: sig.ticker,
          shares: sharesToBuy,
          price: price,
          cost: actualCost,
          tier: getTierLabel(sig.composite_score)
        });
        totalTargetCost += actualCost;
      }
    }

    // Checking if we still have 30k left after this hypothetical purchase
    if (currentCash - totalTargetCost < reserveThreshold) {
       return NextResponse.json({ 
         success: false, 
         message: `資金分配失敗：預計支出 $${totalTargetCost.toFixed(2)}，執行後剩餘將低於 $${reserveThreshold} 限額。`
       }, { status: 400 });
    }

    // 6. Execution (Simulated Transactions)
    console.log(`[Allocation API] Executing ${allocationItems.length} purchases...`);
    let executedCount = 0;
    let finalSpent = 0;

    for (const item of allocationItems) {
      // Insert to portfolio
      const { error: insError } = await adminSupabase.from('portfolio').insert({
        ticker: item.ticker,
        shares: item.shares,
        average_cost: item.price,
        tier: item.tier
        // user_id: user.id // Enable if user_id column exists
      });

      if (insError) {
        console.error(`[Allocation API] DB Insert Error for ${item.ticker}:`, insError.message);
        continue; // Skip if we already own it (Unique constraint) or other error
      }

      // Mark signal as EXECUTED
      await adminSupabase.from('trade_signals').update({ status: 'EXECUTED' }).eq('id', item.id);
      
      executedCount++;
      finalSpent += item.cost;
    }

    // Update CASH Balance
    if (executedCount > 0) {
      await adminSupabase
        .from('portfolio')
        .update({ shares: currentCash - finalSpent })
        .eq('ticker', 'CASH');
    }

    return NextResponse.json({ 
      success: true, 
      message: `建倉完畢！成功買入 ${executedCount} 檔標的，共支出 $${finalSpent.toFixed(2)}。`,
      summary: { count: executedCount, totalCost: finalSpent }
    });

  } catch (error: any) {
    console.error("[Allocation API] Critical Fail:", error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
