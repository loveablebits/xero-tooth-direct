// netlify/functions/xero-api.js
const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Xero-Tenant-Id',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  // Handle preflight CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders
    };
  }

  try {
    // Parse the request path to get the Xero API endpoint
    const path = event.path.split('/api/xero-api/')[1];
    
    if (!path) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing API endpoint' })
      };
    }
    
    // Get authentication details from the request
    const authHeader = event.headers.authorization;
    const tenantId = event.headers['xero-tenant-id'];
    
    if (!authHeader || !tenantId) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing authentication details' })
      };
    }
    
  // Build the Xero API URL
const xeroApiUrl = `https://api.xero.com/api.xro/2.0/${path}`;

// Add query parameters if present
const url = new URL(xeroApiUrl);
const queryParams = event.queryStringParameters || {};

// Special handling for the 'where' parameter
if (queryParams.where) {
  try {
    // For Xero API, the 'where' parameter needs special handling
    // First, decode it (it comes in encoded from the browser)
    const decodedWhere = decodeURIComponent(queryParams.where);
    
    // Then append it to the URL - the URL class will encode it properly
    url.searchParams.append('where', decodedWhere);
    
    console.log("Decoded where:", decodedWhere);
    console.log("Final URL with where:", url.toString());
  } catch (error) {
    console.error("Error processing where parameter:", error);
    
    // Fallback to direct append if decoding fails
    url.searchParams.append('where', queryParams.where);
  }
  
  // Remove the 'where' parameter so we don't add it twice
  delete queryParams.where;
}

// Add all other query parameters
Object.entries(queryParams).forEach(([key, value]) => {
  url.searchParams.append(key, value);
});
    
    console.log(`Making request to Xero API: ${url.toString()}`);
    
    // Make the request to Xero
    const xeroResponse = await fetch(url.toString(), {
      method: event.httpMethod === 'OPTIONS' ? 'GET' : event.httpMethod,
      headers: {
        'Authorization': authHeader,
        'Xero-Tenant-Id': tenantId,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: event.body && event.httpMethod !== 'GET' ? event.body : undefined
    });
    
    // Get the response body
    const responseText = await xeroResponse.text();
    
    // Try to parse as JSON
    let responseBody;
    try {
      responseBody = JSON.parse(responseText);
    } catch (e) {
      // If it's not valid JSON, return as is
      responseBody = responseText;
    }
    
    // Return the response from Xero
    return {
      statusCode: xeroResponse.status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      body: typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody)
    };
  } catch (error) {
    console.error('Error in xero-api function:', error);
    
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