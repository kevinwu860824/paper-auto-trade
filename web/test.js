const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: state } = await supabase.from('portfolio_state').select('*');
  console.log("State:", state);
  const { data: pos } = await supabase.from('positions').select('*');
  console.log("Positions:", pos);
}
run();
