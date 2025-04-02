// netlify/functions/xero-callback.js
const fetch = require('node-fetch');
const cookie = require('cookie');
const querystring = require('querystring');

exports.handler = async function(event, context) {
  try {
    console.log('Xero callback received');
    
    // Parse the query parameters from the URL
    const params = event.queryStringParameters;
    
    // Check for errors in the callback
    if (params.error) {
      console.error('Xero auth error:', params.error, params.error_description);
      return redirectWithError(`Authentication error: ${params.error_description || params.error}`);
    }
    
    // Get the authorization code from the query parameters
    const code = params.code;
    if (!code) {
      console.error('No authorization code received from Xero');
      return redirectWithError('No authorization code received from Xero');
    }
    
    // Get state from query parameters
    const receivedState = params.state;
    if (!receivedState) {
      console.error('No state parameter received from Xero');
      return redirectWithError('Invalid authentication request (missing state)');
    }
    
    // Get stored state and code verifier from cookies
    const cookies = cookie.parse(event.headers.cookie || '');
    const xeroCookie = cookies.xero_auth;
    
    if (!xeroCookie) {
      console.error('No auth cookie found');
      return redirectWithError('Authentication session expired or invalid');
    }
    
    // Parse cookie value
    const cookieData = querystring.parse(decodeURIComponent(xeroCookie));
    const storedState = cookieData.state;
    const codeVerifier = cookieData.code_verifier;
    
    // Verify state parameter to prevent CSRF attacks
    if (receivedState !== storedState) {
      console.error('State parameter mismatch, possible CSRF attack');
      return redirectWithError('Invalid authentication request (state mismatch)');
    }
    
    // Get Xero client credentials from environment variables
    const clientId = process.env.XERO_CLIENT_ID;
    const clientSecret = process.env.XERO_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      console.error('Missing Xero client credentials in environment variables');
      return redirectWithError('Server configuration error (missing Xero credentials)');
    }
    
    // Build the redirect URI (must match the one used in the authorization request)
    const redirectUri = `${process.env.URL || 'http://localhost:8888'}/.netlify/functions/xero-callback`;
    
    // Exchange the authorization code for tokens
    console.log('Exchanging authorization code for tokens');
    const tokenResponse = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
      },
      body: querystring.stringify({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier
      })
    });
    
    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token exchange failed:', tokenResponse.status, errorData);
      return redirectWithError(`Failed to exchange code for tokens (${tokenResponse.status})`);
    }
    
    // Parse the token response
    const tokenData = await tokenResponse.json();
    console.log('Successfully received tokens from Xero');
    
    // Get user info from Xero
    const userInfoResponse = await fetch('https://api.xero.com/connections', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/json'
      }
    });
    
    if (!userInfoResponse.ok) {
      console.error('Failed to get user info:', userInfoResponse.status);
      return redirectWithError('Connected to Xero, but failed to get user details');
    }
    
    const connections = await userInfoResponse.json();
    console.log(`Found ${connections.length} Xero connections`);
    
    // Store the first tenant ID in a cookie (simplified approach)
    const tenantId = connections.length > 0 ? connections[0].tenantId : null;
    const tenantName = connections.length > 0 ? connections[0].tenantName : 'Unknown Organization';
    
    // Set up cookie options
    const cookieOptions = {
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
      maxAge: 30 * 24 * 60 * 60 // 30 days
    };
    
    // Create simplified authentication cookies - we only need to know the user is authenticated
    const authCookie = cookie.serialize('xero_authenticated', 'true', cookieOptions);
    const tenantIdCookie = cookie.serialize('xero_tenant_id', tenantId || '', cookieOptions);
    const tenantNameCookie = cookie.serialize('xero_tenant_name', tenantName || '', cookieOptions);
    const userIdCookie = tokenData.id_token ? 
      cookie.serialize('xero_user_id', tokenData.id_token.split('.')[1] || '', cookieOptions) : '';
    
    // Clear the auth cookie as it's no longer needed
    const clearAuthCookie = cookie.serialize('xero_auth', '', {
      ...cookieOptions,
      expires: new Date(0) // Set to expired
    });
    
    // Store connections for tenant selection if there are multiple
    const tenantsData = connections.map(conn => ({
      tenantId: conn.tenantId,
      tenantName: conn.tenantName || 'Unnamed Organization'
    }));
    
    // Redirect back to the application with success
    console.log('Authentication successful, redirecting to app');
    
// Store connections for tenant selection if there are multiple
const orgData = connections.map(conn => ({
  tenantId: conn.tenantId,
  tenantName: conn.tenantName || 'Unnamed Organization'
}));

console.log('Redirecting with tenant data in URL params');

// Use URL parameters to pass everything we need including tokens
return {
  statusCode: 302,
  headers: {
    'Location': `/?auth=success&tenantName=${encodeURIComponent(tenantName || "Unknown")}&tenantId=${encodeURIComponent(tenantId || "")}&multipleOrgs=${connections.length > 1}&tenants=${encodeURIComponent(JSON.stringify(orgData))}&tokens=${encodeURIComponent(JSON.stringify({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: Date.now() + (tokenData.expires_in * 1000)
    }))}`,
    'Cache-Control': 'no-cache'
  }
};
    
  } catch (error) {
    console.error('Error in Xero callback function:', error);
    return redirectWithError(`Server error: ${error.message}`);
  }
};

// Helper function to redirect with an error message
function redirectWithError(message) {
  return {
    statusCode: 302,
    headers: {
      'Location': `/?auth=error&message=${encodeURIComponent(message)}`,
      'Cache-Control': 'no-cache'
    }
  };
}