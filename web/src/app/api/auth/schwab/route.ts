import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.SCHWAB_CLIENT_ID;
  const redirectUri = process.env.REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return new NextResponse('Missing Schwab credentials (SCHWAB_CLIENT_ID or REDIRECT_URI) in environment variables', { status: 500 });
  }

  // Standard safe URL encoding required by Charles Schwab
  const encodedUri = encodeURIComponent(redirectUri);
  const authUrl = `https://api.schwabapi.com/v1/oauth/authorize?client_id=${clientId}&redirect_uri=${encodedUri}&response_type=code&scope=readonly`;
  
  return NextResponse.redirect(authUrl);
}
