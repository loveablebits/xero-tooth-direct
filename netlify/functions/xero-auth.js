// netlify/functions/xero-auth.js
const crypto = require('crypto');

exports.handler = async function(event, context) {
  console.log("xero-auth function called");
  try {
    // Get Xero client ID from environment variables
    const clientId = process.env.XERO_CLIENT_ID;
    if (!clientId) {
      console.error('Missing XERO_CLIENT_ID environment variable');
      throw new Error('Missing XERO_CLIENT_ID environment variable');
    }

    console.log("Using client ID:", clientId);

    // Create a random state parameter to prevent CSRF attacks
    const state = crypto.randomBytes(16).toString('hex');

    // Create a random PKCE code verifier
    const codeVerifier = crypto.randomBytes(32).toString('hex');
    
    // Create code challenge for PKCE - SHA256 hash of the code verifier
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    // Store state and code verifier in a cookie (will be needed in the callback)
    const cookieExpiresDate = new Date(Date.now() + 1000 * 60 * 15); // 15 minutes
    const cookieValue = `state=${state}&code_verifier=${codeVerifier}`;
    const cookieHeader = `xero_auth=${encodeURIComponent(cookieValue)}; Path=/; Expires=${cookieExpiresDate.toUTCString()}; SameSite=Lax; HttpOnly; Secure`;
    
    // Add additional API scopes to ensure we can get connections
    const scope = [
      'openid',
      'profile',
      'email',
      'offline_access',
      'accounting.transactions.read',
      'accounting.settings.read'
    ].join(' ');

    // Build the redirect URI to Xero authorization endpoint
    const baseUrl = process.env.URL || 'http://localhost:8888';
    const redirectUri = `${baseUrl}/.netlify/functions/xero-callback`;
    console.log("Using redirect URI:", redirectUri);
    
    const xeroAuthUrl = new URL('https://login.xero.com/identity/connect/authorize');
    
    xeroAuthUrl.searchParams.append('client_id', clientId);
    xeroAuthUrl.searchParams.append('response_type', 'code');
    xeroAuthUrl.searchParams.append('redirect_uri', redirectUri);
    xeroAuthUrl.searchParams.append('scope', scope);
    xeroAuthUrl.searchParams.append('state', state);
    xeroAuthUrl.searchParams.append('code_challenge', codeChallenge);
    xeroAuthUrl.searchParams.append('code_challenge_method', 'S256');

    console.log('Redirecting to Xero auth URL:', xeroAuthUrl.toString());
    
    return {
      statusCode: 302,
      headers: {
        'Location': xeroAuthUrl.toString(),
        'Set-Cookie': cookieHeader,
        'Cache-Control': 'no-cache'
      }
    };
  } catch (error) {
    console.error('Error in xero-auth function:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Server error',
        message: error.message
      })
    };
  }
};