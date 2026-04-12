"use client"

import React, { useState } from 'react'
import Link from 'next/link'
import {
    Play,
    TrendingUp,
    History,
    ArrowLeft,
    BarChart3,
    Download
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts'
import { runBacktestAction } from './actions'
import { BacktestResult } from '@/lib/backtestEngine'
import { LogoutButton } from '@/components/LogoutButton'

export default function BacktestExplorer() {
    const [startDate, setStartDate] = useState('2021-01-01')
    const [endDate, setEndDate] = useState('2026-03-31')
    const [strategyMode, setStrategyMode] = useState<'mean-reversion' | 'momentum' | 'tqqq-trend'>('tqqq-trend')
    const [spatialBuffer, setSpatialBuffer] = useState(1.5)
    const [temporalBuffer, setTemporalBuffer] = useState(2)

    // V21 Pure Strategy Mode (All Shields Off - Manual Clean)
    const useVixFilter = false
    const useAlphaShield = false
    const useRiskParity = false
    const useCoreTrend = false
    const useBearSurf = false
    const useSlopeFilter = false
    const useGoldenCross = false
    const useFastSignal = false

    const [selectedTickers, setSelectedTickers] = useState<string[]>([])
    const [loading, setLoading] = useState(false)
    const [results, setResults] = useState<BacktestResult | null>(null)

    const handleRunBacktest = async () => {
        setLoading(true)
        try {
            const res = await runBacktestAction(
                startDate,
                endDate,
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
            )
            setResults(res)
        } catch (e) {
            console.error(e)
            alert("回測失敗，請檢查網路或控制台日誌。")
        } finally {
            setLoading(false)
        }
    }

    const downloadTradesCSV = () => {
        if (!results || !results.trades) return;
        const headers = ["Date", "Ticker", "Action", "Price", "Reason", "Current Equity", "Cash Balance", "QQQ Hold Comparison"];
        const rows = results.trades.map(t => [
            t.date,
            t.ticker,
            t.action,
            t.price.toFixed(2),
            `"${t.reason || ''}"`,
            t.equity?.toFixed(2) || '0.00',
            t.balance?.toFixed(2) || '0.00',
            t.qqq?.toFixed(2) || '0.00'
        ]);

        const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `backtest_trades_${startDate}_to_${endDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    return (
        <main className="min-h-screen bg-slate-950 text-slate-50 flex flex-col relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-500/10 blur-[120px] rounded-full pointer-events-none" />

            <header className="z-20 flex items-center justify-between px-8 py-4 border-b border-white/5 backdrop-blur-md bg-slate-950/50 sticky top-0">
                <div className="flex items-center gap-4">
                    <Link href="/" className="p-2 hover:bg-white/5 rounded-lg transition-colors border border-transparent hover:border-white/10">
                        <ArrowLeft size={20} />
                    </Link>
                    <div className="h-6 w-px bg-white/10" />
                    <Link href="/" className="flex items-center gap-2 group">
                        <div className="bg-emerald-500 p-1.5 rounded-lg shadow-[0_0_15px_rgba(16,185,129,0.3)] group-hover:scale-110 transition-transform">
                            <TrendingUp size={18} className="text-slate-950" />
                        </div>
                        <span className="font-bold tracking-tight text-lg">AutoTrade <span className="text-emerald-400 text-sm">PRO</span></span>
                    </Link>
                </div>
                <div className="flex items-center gap-6">
                    <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400 mr-4">
                        <Link href="/" className="hover:text-white cursor-pointer transition-colors">總覽概況</Link>
                        <Link href="/engine" className="hover:text-white cursor-pointer transition-colors">交易引擎</Link>
                        <span className="text-white">回測探險家</span>
                        <div className="h-4 w-px bg-white/10 mx-2" />
                        <LogoutButton />
                    </nav>
                </div>
            </header>

            <div className="z-10 flex-1 space-y-8 p-8 pt-6 max-w-7xl mx-auto w-full">
                {/* Header Block */}
                <div className="mb-2">
                    <h2 className="text-3xl font-bold tracking-tight mb-1">回測 <span className="text-emerald-400">Backtest Explorer</span></h2>
                    <p className="text-sm text-slate-400">在安全沙盒中驗證你的量化指標與撤退策略。</p>
                </div>

                {!results ? (
                    <div className="flex flex-col items-center justify-center py-32 bg-white/5 border border-dashed border-white/10 rounded-3xl opacity-60">
                        <History size={48} className="text-slate-600 mb-4" />
                        <p className="text-slate-400 font-medium">尚未執行回測，請設定下方參數並點擊全速回測。</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* KPI Cards */}
                        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                            <Card className="bg-white/5 border-white/10 backdrop-blur-md border-b-2 border-b-emerald-500/50">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium text-slate-400">總報酬率 (Total Return)</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-3xl font-bold font-mono text-emerald-400">{results.totalReturn.toFixed(2)}%</div>
                                </CardContent>
                            </Card>
                            <Card className="bg-white/5 border-white/10 backdrop-blur-md">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium text-slate-400">年化報酬 (Annualized)</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-3xl font-bold font-mono">{results.annualReturn.toFixed(2)}%</div>
                                </CardContent>
                            </Card>
                            <Card className="bg-white/5 border-white/10 backdrop-blur-md border-b-2 border-b-rose-500/50">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium text-slate-400">最大回撤 (Max DD)</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-3xl font-bold font-mono text-rose-400">-{results.maxDrawdown.toFixed(2)}%</div>
                                </CardContent>
                            </Card>
                            <Card className="bg-white/5 border-white/10 backdrop-blur-md">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium text-slate-400">夏普比率 (Sharpe)</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-3xl font-bold font-mono">{results.sharpeRatio.toFixed(2)}</div>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
                            <Card className="lg:col-span-2 bg-white/5 border-white/10 backdrop-blur-md overflow-hidden">
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <div>
                                        <CardTitle>資產淨值成長比例 (Equity Curve)</CardTitle>
                                        <CardDescription>策略對比標普 500 指數 (SPY) 表現。</CardDescription>
                                    </div>
                                    <BarChart3 className="text-emerald-500" />
                                </CardHeader>
                                <CardContent className="h-[400px] w-full pt-4">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={results.equityCurve}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                                            <XAxis
                                                dataKey="date"
                                                stroke="#475569"
                                                fontSize={10}
                                                tickFormatter={(str) => str.split('-').slice(1).join('/')}
                                            />
                                            <YAxis
                                                stroke="#475569"
                                                fontSize={10}
                                                tickFormatter={(val) => `\$${(val / 1000).toFixed(0)}k`}
                                            />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                                                labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                                            />
                                            <Line type="monotone" dataKey="equity" stroke="#10b981" strokeWidth={3} dot={false} name="Strategy Equity" />
                                            <Line type="monotone" dataKey="qqq" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" dot={false} name="QQQ Hold" />
                                            <Line type="monotone" dataKey="spy" stroke="#64748b" strokeWidth={2} strokeDasharray="5 5" dot={false} name="SPY Benchmark" />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>

                            <Card className="bg-white/5 border-white/10 backdrop-blur-md">
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <History size={18} className="text-emerald-500" />
                                        交易日誌 (Trade Log)
                                    </CardTitle>
                                    {results && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-slate-500 uppercase font-bold">篩選標的:</span>
                                            <select
                                                multiple
                                                value={selectedTickers}
                                                onChange={(e) => {
                                                    const values = Array.from(e.target.selectedOptions, option => option.value);
                                                    setSelectedTickers(values);
                                                }}
                                                className="bg-slate-900 text-[10px] border border-white/10 rounded px-1 py-0.5 focus:outline-none text-emerald-400 min-w-[80px]"
                                            >
                                                <option value="">全部 (All)</option>
                                                {Array.from(new Set(results.trades.map(t => t.ticker))).sort().map(t => (
                                                    <option key={t} value={t}>{t}</option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={downloadTradesCSV}
                                                className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-bold transition-colors border border-emerald-500/20"
                                            >
                                                <Download size={12} />
                                                CSV
                                            </button>
                                        </div>
                                    )}
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3 h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                        {results.trades
                                            .slice()
                                            .reverse()
                                            .filter(trade => selectedTickers.length === 0 || selectedTickers.includes("") || selectedTickers.includes(trade.ticker))
                                            .map((trade, idx) => (
                                                <div key={idx} className="flex flex-col gap-1 p-3 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-colors">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] font-mono text-slate-500">{trade.date}</span>
                                                        <Badge className={trade.action === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}>
                                                            {trade.action === 'BUY' ? '買入' : '賣出'}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-sm font-bold uppercase">{trade.ticker}</span>
                                                        <span className="text-sm font-mono text-slate-300">\${trade.price.toFixed(2)}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between mt-1 pt-1 border-t border-white/5">
                                                        <div className="flex flex-col">
                                                            <span className="text-[8px] text-slate-500 uppercase">帳戶總額 (Equity)</span>
                                                            <span className="text-[10px] font-mono text-emerald-400 font-bold">\${trade.equity?.toLocaleString() || '--'}</span>
                                                        </div>
                                                        <div className="flex flex-col items-end">
                                                            <span className="text-[8px] text-slate-500 uppercase">剩餘現金 (Cash)</span>
                                                            <span className="text-[10px] font-mono text-blue-400 font-bold">\${trade.balance?.toLocaleString() || '--'}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center justify-between text-[8px] text-slate-500 uppercase mt-1 px-1 py-0.5 bg-white/5 rounded">
                                                        <span>QQQ Hold 對比:</span>
                                                        <span className="font-mono">\${trade.qqq?.toLocaleString() || '--'}</span>
                                                    </div>
                                                    {trade.reason && <div className="text-[9px] text-slate-500 italic mt-1">{trade.reason}</div>}
                                                </div>
                                            ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                )}

                {/* Footer Controls - Minimalist V20 */}
                <div className="bg-white/5 p-6 rounded-3xl border border-white/10 backdrop-blur-xl shadow-2xl mt-6">
                    <div className="flex flex-wrap items-center justify-center gap-8">
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] uppercase font-bold text-slate-500">起始日期</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="bg-transparent text-sm font-mono focus:outline-none"
                            />
                        </div>
                        <div className="h-8 w-px bg-white/10 hidden md:block" />
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] uppercase font-bold text-slate-500">結束日期</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="bg-transparent text-sm font-mono focus:outline-none"
                            />
                        </div>
                        <div className="h-8 w-px bg-white/10 hidden md:block" />

                        {/* Core Controls */}
                        <div className="flex flex-wrap items-center justify-center gap-8">
                            <div className="flex flex-col gap-1 pr-4">
                                <label className="text-[10px] uppercase font-bold text-slate-500">Strategy Mode</label>
                                <select
                                    value={strategyMode}
                                    onChange={(e) => setStrategyMode(e.target.value as any)}
                                    className="bg-transparent text-sm font-bold focus:outline-none text-emerald-400 cursor-pointer"
                                >
                                    <option value="tqqq-trend">大盤趨勢跟隨 (TQQQ-Trend)</option>
                                    <option value="mean-reversion">接飛刀 (Mean Rev)</option>
                                    <option value="momentum">20D 突破 (Momentum)</option>
                                </select>
                            </div>

                            <div className="flex flex-col gap-1 px-4 border-l border-white/10">
                                <label className="text-[10px] uppercase font-bold text-slate-500">Space Buffer %</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={spatialBuffer}
                                    onChange={(e) => setSpatialBuffer(parseFloat(e.target.value))}
                                    className="bg-transparent text-sm font-bold focus:outline-none text-emerald-400 w-16"
                                />
                            </div>

                            <div className="flex flex-col gap-1 px-4 border-l border-white/10">
                                <label className="text-[10px] uppercase font-bold text-slate-500">Time Buffer (Days)</label>
                                <input
                                    type="number"
                                    value={temporalBuffer}
                                    onChange={(e) => setTemporalBuffer(parseInt(e.target.value))}
                                    className="bg-transparent text-sm font-bold focus:outline-none text-emerald-400 w-16"
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleRunBacktest}
                            disabled={loading}
                            className={`flex items-center gap-3 px-8 py-3 rounded-2xl font-bold transition-all ${loading ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 hover:scale-105 shadow-[0_0_20px_rgba(16,185,129,0.4)]'}`}
                        >
                            {loading ? <div className="animate-spin h-5 w-5 border-3 border-slate-500 border-t-transparent rounded-full" /> : <Play size={20} fill="currentColor" />}
                            {loading ? '計算中' : '全速回測'}
                        </button>
                    </div>
                </div>
            </div>
        </main>
    )
}
