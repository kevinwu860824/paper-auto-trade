'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BrainCircuit, X, Plus, Loader2 } from "lucide-react"

export function AIPanel({ initialTickers, userId }: { initialTickers: string[], userId: string }) {
  const [tickers, setTickers] = useState<string[]>(initialTickers)
  const [newTicker, setNewTicker] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const handleAdd = async () => {
    if (!newTicker.trim()) return
    const symbol = newTicker.trim().toUpperCase()
    if (tickers.includes(symbol)) {
      setNewTicker('')
      return
    }

    const updated = [...tickers, symbol]
    setTickers(updated)
    setNewTicker('')
    await saveSettings(updated)
  }

  const handleRemove = async (symbol: string) => {
    const updated = tickers.filter(t => t !== symbol)
    setTickers(updated)
    await saveSettings(updated)
  }

  const saveSettings = async (updatedTickers: string[]) => {
    setIsSaving(true)
    try {
      await fetch('/api/ai-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: updatedTickers })
      })
    } catch (e) {
      console.error("Failed to save AI tickers", e)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card className="bg-white/5 border-white/10 backdrop-blur-md mb-6">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-indigo-400" />
            AI 分析目標池 (大腦監控清單)
          </CardTitle>
          <CardDescription className="text-slate-400 mt-1">
            設定 AI 每日盤前分析的股票清單。AI 將根據您的模擬現金與持倉給出買賣決策。
          </CardDescription>
        </div>
        {isSaving && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 mb-4">
          {tickers.length === 0 && (
            <span className="text-sm text-slate-500 italic">目前沒有監控目標，請新增。</span>
          )}
          {tickers.map(ticker => (
            <Badge key={ticker} variant="outline" className="bg-indigo-500/10 text-indigo-300 border-indigo-500/30 text-sm px-3 py-1 flex items-center gap-1">
              {ticker}
              <button onClick={() => handleRemove(ticker)} className="ml-1 hover:text-rose-400 focus:outline-none">
                <X size={14} />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex items-center gap-2 max-w-sm">
          <input
            type="text"
            value={newTicker}
            onChange={(e) => setNewTicker(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="例如: NVDA, AAPL"
            className="flex h-9 w-full rounded-md border border-white/10 bg-black/20 px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 text-white"
          />
          <button 
            onClick={handleAdd}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-indigo-500 text-white shadow hover:bg-indigo-500/90 h-9 px-4 py-2"
          >
            <Plus size={16} className="mr-1"/> 加入
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
