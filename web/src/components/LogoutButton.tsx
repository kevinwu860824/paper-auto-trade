'use client'

import { LogOut } from 'lucide-react'
import { signOut } from '@/app/login/actions'
import { useState } from 'react'

export function LogoutButton() {
    const [loading, setLoading] = useState(false)

    const handleLogout = async () => {
        setLoading(true)
        try {
            await signOut()
        } catch (e) {
            console.error("Logout failed", e)
            setLoading(false)
        }
    }

    return (
        <button 
            onClick={handleLogout}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-400/10 transition-all border border-transparent hover:border-rose-400/20 group ml-2"
            title="登出安全中心 (V22)"
        >
            <LogOut size={16} className={loading ? 'animate-spin' : 'group-hover:rotate-12 transition-transform'}/>
            <span className="text-xs font-bold uppercase tracking-wider">退出系統</span>
        </button>
    )
}
