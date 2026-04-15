"use client"

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import {
    Play,
    TrendingUp,
    ArrowLeft,
    BarChart3,
    History,
    DollarSign,
    ShieldAlert,
    Calendar,
    Loader2,
    CheckCircle2
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
    ResponsiveContainer,
    Legend
} from 'recharts'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

export default function BacktestVisualizer() {
    // 1. States for controls
    const [ticker, setTicker] = useState('NVDA')
    const [startDate, setStartDate] = useState('2023-01-01')
    const [endDate, setEndDate] = useState('2024-03-31')
    const [stopLossPct, setStopLossPct] = useState(10)
    const [initialCapital, setInitialCapital] = useState(100000)
    const [strategyMode, setStrategyMode] = useState('mean-reversion')

    // 2. States for results
    const [loading, setLoading] = useState(false)
    const [results, setResults] = useState<any>(null)
    const [error, setError] = useState<string | null>(null)

    const handleRunBacktest = async () => {
        setLoading(true)
        setError(null)
        try {
            const response = await fetch('/api/backtest/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticker,
                    startDate,
                    endDate,
                    stopLossPct,
                    initialCapital,
                    strategyMode
                })
            })
            
            const result = await response.json()
            if (result.success) {
                setResults(result.data)
            } else {
                setError(result.error || "回測計算發生錯誤")
            }
        } catch (e: any) {
            setError("無法連線至回測伺服器")
        } finally {
            setLoading(false)
        }
    }

    return (
        <main className="min-h-screen bg-[#0a0a0b] text-slate-50 flex flex-col font-sans">
            {/* Header */}
            <header className="z-30 flex items-center justify-between px-8 py-4 border-b border-white/5 bg-[#0a0a0b]/80 backdrop-blur-xl sticky top-0">
                <div className="flex items-center gap-4">
                    <Link href="/" className="p-2 hover:bg-white/5 rounded-xl transition-colors border border-white/5">
                        <ArrowLeft size={18} />
                    </Link>
                    <div className="flex items-center gap-2">
                        <div className="bg-indigo-500 p-1.5 rounded-lg shadow-lg shadow-indigo-500/20">
                            <BarChart3 size={18} className="text-white" />
                        </div>
                        <h1 className="font-black tracking-tight text-xl uppercase italic">
                            Backtest <span className="text-indigo-400 not-italic tracking-tighter ml-1">Visualizer</span>
                        </h1>
                    </div>
                </div>
                <div className="flex items-center gap-2 p-1 bg-white/5 rounded-full border border-white/5 px-4 text-[10px] font-bold text-slate-500 tracking-widest uppercase">
                    <div className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    Engine Active
                </div>
            </header>

            <div className="grid grid-cols-12 gap-0 flex-1">
                {/* LEFT CONSOLE (3 units) */}
                <aside className="col-span-12 lg:col-span-3 border-r border-white/5 bg-[#0d0d0e] p-6 space-y-8 h-full overflow-y-auto">
                    <div>
                        <h2 className="text-xs font-black text-indigo-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                            <div className="w-4 h-px bg-indigo-500/50" />
                            回測控制台
                        </h2>
                        
                        <div className="space-y-6">
                            {/* Ticker Input */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                    <TrendingUp size={12} /> 標的代號 (Ticker)
                                </label>
                                <input 
                                    value={ticker}
                                    onChange={(e) => setTicker(e.target.value.toUpperCase())}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono focus:border-indigo-500 focus:outline-none transition-colors"
                                    placeholder="例如: NVDA, TSLA..."
                                />
                            </div>

                            {/* Date Range */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                        <Calendar size={12} /> 起始日期
                                    </label>
                                    <input 
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono focus:border-indigo-500 focus:outline-none transition-colors"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                        <Calendar size={12} /> 結束日期
                                    </label>
                                    <input 
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono focus:border-indigo-500 focus:outline-none transition-colors"
                                    />
                                </div>
                            </div>

                            {/* Initial Capital */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                    <DollarSign size={12} /> 初始資金 (USD)
                                </label>
                                <input 
                                    type="number"
                                    value={initialCapital}
                                    onChange={(e) => setInitialCapital(Number(e.target.value))}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono focus:border-indigo-500 focus:outline-none transition-colors"
                                />
                            </div>

                            {/* Stop Loss Slider */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                        <ShieldAlert size={12} /> Sentinel 停損 (%)
                                    </label>
                                    <span className="text-xs font-mono text-indigo-400 font-bold">{stopLossPct}%</span>
                                </div>
                                <input 
                                    type="range"
                                    min="1"
                                    max="50"
                                    value={stopLossPct}
                                    onChange={(e) => setStopLossPct(Number(e.target.value))}
                                    className="w-full accent-indigo-500 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer"
                                />
                                <p className="text-[9px] text-slate-500 italic">當股價從高點回落此比例時將觸發保險平倉。</p>
                            </div>

                            {/* Strategy Mode Select */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                    <History size={12} /> 策略模式
                                </label>
                                <select 
                                    value={strategyMode}
                                    onChange={(e) => setStrategyMode(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none transition-colors appearance-none"
                                >
                                    <option value="mean-reversion">大跌抄底 (Mean Reversion)</option>
                                    <option value="momentum">強勢突破 (Momentum)</option>
                                    <option value="tqqq-trend">趨勢跟隨 (TQQQ Trend)</option>
                                </select>
                            </div>

                            {/* Run Button */}
                            <button 
                                onClick={handleRunBacktest}
                                disabled={loading}
                                className={cn(
                                    "w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg",
                                    loading 
                                        ? "bg-slate-800 text-slate-500 cursor-not-allowed" 
                                        : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20"
                                )}
                            >
                                {loading ? <Loader2 size={18} className="animate-spin" /> : <Play size={16} fill="white" />}
                                {loading ? '回測運算中...' : '開始歷史回測'}
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex gap-2 items-start">
                            <ShieldAlert size={16} className="shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}
                </aside>

                {/* MAIN VISUALIZATION (9 units) */}
                <section className="col-span-12 lg:col-span-9 p-8 bg-[#0a0a0b] relative overflow-y-auto">
                    {results ? (
                        <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-8"
                        >
                            {/* Performance Metrics */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <Card className="bg-white/5 border-white/10 border-b-2 border-b-indigo-500/50 backdrop-blur-xl">
                                    <CardHeader className="pb-2">
                                        <CardDescription className="text-[9px] uppercase font-bold text-slate-500 tracking-widest">總計報酬率 (Cumulative Return)</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className={cn(
                                            "text-3xl font-black font-mono tracking-tighter",
                                            results.metrics.totalReturn >= 0 ? "text-emerald-400" : "text-rose-400"
                                        )}>
                                            {results.metrics.totalReturn >= 0 ? '+' : ''}{results.metrics.totalReturn.toFixed(2)}%
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className="bg-white/5 border-white/10 border-b-2 border-b-rose-500/50 backdrop-blur-xl">
                                    <CardHeader className="pb-2">
                                        <CardDescription className="text-[9px] uppercase font-bold text-slate-500 tracking-widest">最大回撤 (Max Drawdown)</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-3xl font-black font-mono tracking-tighter text-rose-400">
                                            -{results.metrics.maxDrawdown.toFixed(2)}%
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className="bg-white/5 border-white/10 border-b-2 border-b-sky-500/50 backdrop-blur-xl">
                                    <CardHeader className="pb-2">
                                        <CardDescription className="text-[9px] uppercase font-bold text-slate-500 tracking-widest">夏普比率 (Sharpe Ratio)</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-3xl font-black font-mono tracking-tighter text-sky-400">
                                            {results.metrics.sharpeRatio.toFixed(2)}
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Main Equity Chart */}
                            <Card className="bg-white/5 border-white/10 backdrop-blur-2xl">
                                <CardHeader>
                                    <CardTitle className="text-base font-bold flex items-center gap-2 uppercase tracking-wide italic">
                                        Equity <span className="text-indigo-400 not-italic tracking-tighter ml-1">Curve</span>
                                    </CardTitle>
                                    <CardDescription>策略淨值成長與標普 500 (SPY) 對照圖。</CardDescription>
                                </CardHeader>
                                <CardContent className="h-[500px] w-full pt-4">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={results.equityCurve} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                                            <XAxis 
                                                dataKey="date" 
                                                stroke="#475569" 
                                                fontSize={10} 
                                                tickFormatter={(str) => str.split('-').slice(1).join('/')}
                                                tickLine={false}
                                                axisLine={false}
                                            />
                                            <YAxis 
                                                stroke="#475569" 
                                                fontSize={10} 
                                                tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                                                tickLine={false}
                                                axisLine={false}
                                            />
                                            <Tooltip 
                                                contentStyle={{ backgroundColor: '#0d0d0e', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px' }}
                                                itemStyle={{ fontSize: '12px' }}
                                                labelStyle={{ fontSize: '10px', color: '#64748b', marginBottom: '8px' }}
                                            />
                                            <Legend verticalAlign="top" height={36}/>
                                            <Line 
                                                type="monotone" 
                                                dataKey="equity" 
                                                stroke="#818cf8" 
                                                strokeWidth={4} 
                                                dot={false} 
                                                name="策略淨值 (Strategy)" 
                                                animationDuration={1500}
                                            />
                                            <Line 
                                                type="monotone" 
                                                dataKey="spy" 
                                                stroke="#475569" 
                                                strokeWidth={2} 
                                                strokeDasharray="5 5" 
                                                dot={false} 
                                                name="標普 500 (SPY Benchmark)" 
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>

                            <div className="flex items-center gap-2 p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 mb-20">
                                <CheckCircle2 className="text-indigo-400" size={18} />
                                <p className="text-xs text-slate-400">
                                    回測完成。共分析 {results.equityCurve.length} 個交易日。這項策略在回測期間展現了 {results.metrics.totalReturn > 0 ? '正向' : '負向'} 的財富累積效應。
                                </p>
                            </div>
                        </motion.div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
                            <div className="p-6 rounded-full bg-white/5 border border-white/10">
                                <History size={64} className="text-slate-700" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold">尚未啟動演算</h3>
                                <p className="text-sm text-slate-500 max-w-[280px]">請在左側面板設定參數，啟動沙盒回測以驗證您的交易假設。</p>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </main>
    )
}
