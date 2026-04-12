'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Brain, ChevronDown, ChevronUp, Clock, Target } from "lucide-react"
import { useState } from 'react'
import { cn } from "@/lib/utils"

export interface TradeSignal {
  id: string;
  ticker: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  quantity: number;
  reasoning: string;
  created_at: string;
}

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
                <th className="px-6 py-3">股票</th>
                <th className="px-6 py-3">動作</th>
                <th className="px-6 py-3">數量</th>
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
                        <Badge 
                          className={cn(
                            "font-bold text-[10px] px-2 py-0.5",
                            signal.action === 'BUY' && "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
                            signal.action === 'SELL' && "bg-rose-500/20 text-rose-400 border-rose-500/30",
                            signal.action === 'HOLD' && "bg-amber-500/20 text-amber-400 border-amber-500/30",
                          )}
                          variant="outline"
                        >
                          {signal.action}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-slate-300 font-mono">
                        {signal.quantity > 0 ? signal.quantity : '--'}
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
                      <tr className="bg-black/20">
                        <td colSpan={5} className="px-6 py-4">
                          <div className="text-xs leading-relaxed text-slate-300 border-l-2 border-emerald-500/30 pl-4 py-1">
                            <span className="text-emerald-400 font-bold mb-1 block uppercase tracking-tighter text-[10px]">AI Reasoning & Analysis</span>
                            {signal.reasoning}
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
