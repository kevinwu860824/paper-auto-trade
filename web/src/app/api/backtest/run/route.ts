import { NextResponse } from 'next/server';
import { runBacktest } from '@/lib/backtestEngine';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      ticker = 'SPY', 
      startDate, 
      endDate, 
      stopLossPct = 10, 
      initialCapital = 100000,
      strategyMode = 'mean-reversion'
    } = body;

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'Missing start or end date' }, { status: 400 });
    }

    console.log(`[Backtest API] Running simulation for ${ticker} from ${startDate} to ${endDate}...`);

    const result = await runBacktest(
      startDate,
      endDate,
      Number(initialCapital),
      {
        focusTicker: ticker,
        stopLossPct: Number(stopLossPct),
        strategyMode: strategyMode,
        useVixFilter: true, // Enable default smart filters
        useRiskParity: true
      }
    );

    return NextResponse.json({
      success: true,
      data: {
        equityCurve: result.equityCurve,
        metrics: {
          totalReturn: result.totalReturn,
          annualReturn: result.annualReturn,
          maxDrawdown: result.maxDrawdown,
          sharpeRatio: result.sharpeRatio
        },
        tradeCount: result.trades.length
      }
    });

  } catch (error: any) {
    console.error("[Backtest API] Error:", error.message);
    return NextResponse.json({ 
      success: false, 
      error: 'Backtest execution failed', 
      details: error.message 
    }, { status: 500 });
  }
}
