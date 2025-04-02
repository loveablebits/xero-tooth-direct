// netlify/functions/xero-refresh.js
const fetch = require('node-fetch');
const querystring = require('querystring');

exports.handler = async function(event, context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders
    };
  }

  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }

    // Parse request body to get refresh token
    const requestData = JSON.parse(event.body || '{}');
    const refreshToken = requestData.refresh_token;

    if (!refreshToken) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Refresh token is required' })
      };
    }

    // Get Xero client credentials from environment variables
    const clientId = process.env.XERO_CLIENT_ID;
    const clientSecret = process.env.XERO_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing Xero credentials' })
      };
    }

    // Request new tokens using the refresh token
    const tokenResponse = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
      },
      body: querystring.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token refresh failed:', tokenResponse.status, errorText);
      
      return {
        statusCode: tokenResponse.status,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Failed to refresh token',
          details: errorText
        })
      };
    }

    // Parse the token response
    const tokenData = await tokenResponse.json();
    
    // Calculate expiration time
    const expiresAt = Date.now() + (tokenData.expires_in * 1000);

    // Return the new tokens
    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt
      })
    };
  } catch (error) {
    console.error('Error in xero-refresh function:', error);
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Server error',
        message: error.message
      })
    };
  }
};