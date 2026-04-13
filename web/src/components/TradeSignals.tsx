'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Brain, ChevronDown, ChevronUp, Clock, Target } from "lucide-react"
import { useState } from 'react'
import { cn } from "@/lib/utils"

export interface AnalystSignal {
  signal: string;
  confidence: number;
  reasoning: string;
}

export interface TradeSignal {
  id: string;
  ticker: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  quantity: number;
  reasoning: string;
  created_at: string;
  composite_score?: number;
  analyst_data?: Record<string, AnalystSignal>;
}

const ScoreGauge = ({ score }: { score: number }) => {
  const getColor = (s: number) => {
    if (s >= 80) return "text-emerald-500 stroke-emerald-500";
    if (s >= 60) return "text-emerald-400 stroke-emerald-400";
    if (s >= 40) return "text-amber-400 stroke-amber-400";
    if (s >= 20) return "text-orange-400 stroke-orange-400";
    return "text-rose-500 stroke-rose-500";
  };

  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg className="h-10 w-10 transform -rotate-90">
        <circle
          className="text-white/10"
          strokeWidth="3"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx="20"
          cy="20"
        />
        <circle
          className={cn("transition-all duration-1000 ease-out", getColor(score))}
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx="20"
          cy="20"
        />
      </svg>
      <span className={cn("absolute text-[10px] font-bold font-mono", getColor(score).split(' ')[0])}>
        {score}
      </span>
    </div>
  );
};

export function TradeSignals({ signals }: { signals: TradeSignal[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <Card className="bg-white/5 border-white/10 backdrop-blur-md mb-6 overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-bold flex items-center gap-2">
          <Brain className="h-5 w-5 text-emerald-400" />
          AI 決策指揮中心 (Latest Signals)
        </CardTitle>
        <Badge variant="outline" className="text-[10px] border-emerald-500/20 text-emerald-400">
          REAL-TIME
        </Badge>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-white/10 text-slate-500 uppercase text-[10px] font-bold tracking-widest">
                <th className="px-6 py-3">分析時間</th>
                <th className="px-6 py-3">股票代號</th>
                <th className="px-6 py-3">AI 評分</th>
                <th className="px-6 py-3">建議動作</th>
                <th className="px-6 py-3">交易數量</th>
                <th className="px-6 py-3 text-right">詳情</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {signals.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-500 italic">
                    目前尚無 AI 交易信號，請等待系統運行。
                  </td>
                </tr>
              ) : (
                signals.map((signal) => (
                  <React.Fragment key={signal.id}>
                    <tr 
                      className={cn(
                        "hover:bg-white/5 transition-colors cursor-pointer group",
                        expandedId === signal.id && "bg-white/5"
                      )}
                      onClick={() => toggleExpand(signal.id)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-slate-400">
                          <Clock size={12} />
                          <span className="text-xs font-mono">
                            {new Date(signal.created_at).toLocaleString('zh-TW', { 
                              month: 'numeric', 
                              day: 'numeric', 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Target size={14} className="text-slate-500" />
                          <span className="font-bold text-white uppercase">{signal.ticker}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <ScoreGauge score={signal.composite_score || 50} />
                      </td>
                      <td className="px-6 py-4">
                        <Badge 
                          className={cn(
                            "font-bold text-[10px] px-2 py-0.5",
                            signal.action === 'BUY' && "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
                            signal.action === 'SELL' && "bg-rose-500/20 text-rose-400 border-rose-500/30",
                            signal.action === 'HOLD' && "bg-amber-500/20 text-amber-400 border-amber-500/30",
                          )}
                          variant="outline"
                        >
                          {signal.action === 'BUY' ? '買入 (BUY)' : signal.action === 'SELL' ? '賣出 (SELL)' : '觀望 (HOLD)'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-slate-300 font-mono">
                        {signal.quantity > 0 ? `${signal.quantity} 股` : '--'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {expandedId === signal.id ? (
                          <ChevronUp size={16} className="text-slate-500 inline" />
                        ) : (
                          <ChevronDown size={16} className="text-slate-500 inline" />
                        )}
                      </td>
                    </tr>
                    {expandedId === signal.id && (
                      <tr className="bg-black/40">
                        <td colSpan={6} className="px-6 py-6 ring-1 ring-white/5">
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            <div className="md:col-span-1 space-y-4">
                              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">綜合分析結論</h4>
                                <p className="text-xs text-slate-300 leading-relaxed italic border-l-2 border-emerald-500/50 pl-3">
                                  {signal.reasoning}
                                </p>
                              </div>
                            </div>
                            
                            <div className="md:col-span-3">
                              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">各領域專家報告 (Detailed Reports)</h4>
                              {signal.analyst_data && Object.keys(signal.analyst_data).length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {Object.entries(signal.analyst_data).map(([agent, data]) => {
                                    if (!data || !data.signal) return null;
                                    const sigType = data.signal.toLowerCase();
                                    return (
                                      <div key={agent} className="p-3 rounded-lg bg-white/5 border border-white/10 hover:border-white/20 transition-colors">
                                        <div className="flex items-center justify-between mb-2">
                                          <span className="text-[10px] font-bold text-emerald-400 uppercase truncate max-w-[120px]">
                                            {agent.replace('_agent', '').replace(/_/g, ' ')}
                                          </span>
                                          <Badge variant="outline" className={cn(
                                            "text-[8px] py-0 px-1 border-white/10",
                                            sigType === 'bullish' ? "text-emerald-400" : 
                                            sigType === 'bearish' ? "text-rose-400" : "text-amber-400"
                                          )}>
                                            {data.signal.toUpperCase()} ({data.confidence}%)
                                          </Badge>
                                        </div>
                                        <p className="text-[11px] text-slate-400 leading-snug line-clamp-3 hover:line-clamp-none transition-all cursor-help">
                                          {data.reasoning || "尚無詳細推論摘要"}
                                        </p>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="p-10 text-center border border-dashed border-white/10 rounded-xl">
                                  <p className="text-xs text-slate-500 italic">舊有紀錄尚未生成詳細報告，新運行的分析將會顯示於此。</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

import React from 'react'
