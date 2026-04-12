"use server"

import { runBacktest, BacktestResult } from "@/lib/backtestEngine";

export async function runBacktestAction(
    startDate: string, 
    endDate: string, 
    useVixFilter: boolean = false,
    strategyMode: 'mean-reversion' | 'momentum' | 'tqqq-trend' = 'mean-reversion',
    useSlopeFilter: boolean = true,
    useGoldenCross: boolean = true,
    useBearSurf: boolean = false,
    useAlphaShield: boolean = false,
    useFastSignal: boolean = false,
    useRiskParity: boolean = false,
    useCoreTrend: boolean = false,
    spatialBuffer: number = 1.5,
    temporalBuffer: number = 2
): Promise<BacktestResult> {
    try {
        console.log(`Running V19 Iron Shield: ${startDate} to ${endDate}. Buffers: ${spatialBuffer}% / ${temporalBuffer}d`);
        return await runBacktest(startDate, endDate, 100000, {
            useVixFilter,
            strategyMode,
            useSlopeFilter,
            useGoldenCross,
            useBearSurf,
            useAlphaShield,
            useFastSignal,
            useRiskParity,
            useCoreTrend,
            spatialBuffer,
            temporalBuffer
        });
    } catch (error: any) {
        console.error("Backtest action error:", error.message);
        throw new Error(error.message || "Failed to run backtest");
    }
}
