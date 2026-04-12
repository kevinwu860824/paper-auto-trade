import { runBacktest } from './lib/backtestEngine';

async function main() {
    console.log("REPRO BUG: 2021-01-01 to 2026-03-31, MA50/200 ON, Alpha Shield ON");
    const res = await runBacktest('2021-01-01', '2026-03-31', 100000, {
        useVixFilter: false,
        useSlopeFilter: false,
        useGoldenCross: true,
        useBearSurf: false,
        useAlphaShield: true,
        useFastSignal: false,
        strategyMode: 'mean-reversion'
    });
    console.log("----------------------------------------");
    console.log("TOTAL RETURN: " + res.totalReturn.toFixed(2) + "%");
    console.log("ANNUAL RETURN: " + res.annualReturn.toFixed(2) + "%");
    console.log("MAX DRAWDOWN: " + res.maxDrawdown.toFixed(2) + "%");
    console.log("SHARPE: " + res.sharpeRatio.toFixed(2));
    console.log("CURVE START DATE: " + res.equityCurve[0].date);
    console.log("CURVE START EQUITY: " + res.equityCurve[0].equity);
    console.log("----------------------------------------");
}
main().catch(console.error);
