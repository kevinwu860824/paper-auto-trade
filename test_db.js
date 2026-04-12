import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: 'web/.env.local' })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function run() {
  const { data: state } = await supabase.from('portfolio_state').select('*')
  console.log("State:", state)
  const { data: pos } = await supabase.from('positions').select('*')
  console.log("Positions:", pos)
}
run()
