import { login } from './actions'
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { ShieldAlert } from "lucide-react"

export default async function LoginPage(props: {
  searchParams: Promise<{ error?: string }>
}) {
  const searchParams = await props.searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-50 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-900/20 via-slate-950 to-slate-950 pointer-events-none" />

      <Card className="z-10 w-full max-w-sm bg-white/5 border-white/10 backdrop-blur-md shadow-2xl">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-4 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
            <ShieldAlert className="h-8 w-8 text-emerald-400" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-white">System Locked</CardTitle>
          <p className="text-sm text-slate-400 mt-2">Quantitative Engine Access terminal.</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4">
            <div>
              <input 
                 id="email" 
                 name="email" 
                 type="email" 
                 required 
                 className="w-full rounded-md bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-mono" 
                 placeholder="Terminal ID (Email)" 
              />
            </div>
            <div>
              <input 
                 id="password" 
                 name="password" 
                 type="password" 
                 required 
                 className="w-full rounded-md bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-mono" 
                 placeholder="Access Code (Password)" 
              />
            </div>
            
            {searchParams?.error && (
              <p className="text-xs text-rose-400 text-center bg-rose-500/10 py-2 rounded border border-rose-500/20">
                {searchParams.error}
              </p>
            )}

            <button 
              formAction={login} 
              className="mt-6 w-full rounded-md bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 shadow-sm hover:bg-emerald-400 transition-colors uppercase tracking-widest"
            >
              Authenticate
            </button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
