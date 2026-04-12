import { runBacktest } from './lib/backtestEngine';

async function main() {
    try {
        const res = await runBacktest('2021-01-01', '2026-03-31', 100000, {
            useVixFilter: false,
            useSlopeFilter: false,
            useGoldenCross: true,
            useBearSurf: false,
            useAlphaShield: true,
            useFastSignal: false,
            strategyMode: 'mean-reversion'
        });
        console.log('RESULTS_START');
        console.log(JSON.stringify({
            totalReturn: res.totalReturn.toFixed(2),
            annualReturn: res.annualReturn.toFixed(2),
            maxDrawdown: res.maxDrawdown.toFixed(2),
            sharpeRatio: res.sharpeRatio.toFixed(2)
        }, null, 2));
        console.log('RESULTS_END');
    } catch (e) {
        console.error(e);
    }
}
main();
