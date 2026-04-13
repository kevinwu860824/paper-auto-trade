import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const authCode = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    console.error("Schwab returned OAuth Error:", error);
    return new NextResponse(`Schwab Error: ${error}`, { status: 400 });
  }

  if (!authCode) {
    return new NextResponse('Authorization code not found in the URL parameter.', { status: 400 });
  }

  const clientId = process.env.SCHWAB_CLIENT_ID;
  const clientSecret = process.env.SCHWAB_CLIENT_SECRET;
  const redirectUri = process.env.REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return new NextResponse('Missing Schwab credentials in environment.', { status: 500 });
  }

  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    // Exchange Access Token via Native Fetch (Serverless optimized)
    const tokenResponse = await fetch('https://api.schwabapi.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: redirectUri
      }).toString()
    });

    const data = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("Schwab Token Exchange Failed:", data);
      return new NextResponse(JSON.stringify(data), { status: tokenResponse.status });
    }

    const { access_token, refresh_token, expires_in } = data;
    const expiresAt = Date.now() + (expires_in * 1000);

    // Initialize SSR Supabase Client to read session cookies
    const supabase = await createClient();

    // Store credentials securely in the database settings table
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // 💡 明確加上 { onConflict: 'user_id,key' }，並抓取潛在錯誤
    await supabase.from('settings').upsert(
      { key: 'schwab_access_token', value: access_token, user_id: user.id },
      { onConflict: 'user_id,key' }
    );

    await supabase.from('settings').upsert(
      { key: 'schwab_refresh_token', value: refresh_token, user_id: user.id },
      { onConflict: 'user_id,key' }
    );

    await supabase.from('settings').upsert(
      { key: 'schwab_expires_at', value: expiresAt.toString(), user_id: user.id },
      { onConflict: 'user_id,key' }
    );

    console.log(`✅ OAuth Flow completed successfully for user [${user.id}]. Tokens & Expiry written to Supabase.`);
    // Redirect the user back to the dashboard with a success notification flag
    const url = new URL('/', request.url);
    url.searchParams.set('schwab_linked', 'true');
    return NextResponse.redirect(url);

  } catch (err: any) {
    console.error('Fatal error exchanging token:', err);
    return new NextResponse(err.message || 'Fatal error exchanging token.', { status: 500 });
  }
}
