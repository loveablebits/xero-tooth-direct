// netlify/functions/xero-connections.js
const cookie = require('cookie');

exports.handler = async function(event, context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }

  try {
    // Get cookie to verify authentication
    const cookies = cookie.parse(event.headers.cookie || '');
    const isAuthenticated = cookies.xero_authenticated === 'true';
    
    if (!isAuthenticated) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Unauthorized',
          message: 'Please connect to Xero first'
        })
      };
    }
    
    // In a simplified flow, we store tenant info in cookies during authentication
    // We can just return that info here
    const tenantId = cookies.xero_tenant_id;
    const tenantName = cookies.xero_tenant_name;
    
    if (!tenantId) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Not Found',
          message: 'No Xero organization found. Please reconnect to Xero.'
        })
      };
    }
    
    // Return minimal tenant info
    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([{
        tenantId: tenantId,
        tenantName: tenantName || 'Xero Organization'
      }])
    };
  } catch (error) {
    console.error('Error in xero-connections function:', error);
    
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