// netlify/functions/make-webhook.js
const fetch = require('node-fetch');
const cookie = require('cookie');

exports.handler = async function(event, context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Handle preflight CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders
    };
  }

  try {
    // Verify authentication
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
    
    // Log the incoming request for debugging
    console.log('Received request body:', event.body);
    
    // Parse the request body to get search parameters
    let requestData;
    try {
      requestData = JSON.parse(event.body);
    } catch (error) {
      console.error('Error parsing request body:', error);
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Bad Request',
          message: 'Invalid JSON in request body'
        })
      };
    }
    
    // Get the tenant ID from the request or from cookies
    const tenantId = requestData.tenantId || cookies.xero_tenant_id;
    
    if (!tenantId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Bad Request',
          message: 'Missing tenant ID'
        })
      };
    }
    
    // Get the Make.com webhook URL from environment variables
const webhookUrl = process.env.MAKE_WEBHOOK_URL;

// Add a check to ensure the webhook URL exists
if (!webhookUrl) {
  console.error('Missing MAKE_WEBHOOK_URL environment variable');
  return {
    statusCode: 500,
    headers: corsHeaders,
    body: JSON.stringify({
      error: 'Server Configuration Error',
      message: 'Webhook URL not configured. Please contact the administrator.'
    })
  };
}
    
// Forward the request to Make with tenant ID and search params
const makeResponse = await fetch(webhookUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    tenantId: tenantId,
    searchTerm: requestData.searchTerm || '',
    status: requestData.status || '',
    dateFrom: requestData.dateFrom || '',
    dateTo: requestData.dateTo || '',
    sortBy: requestData.sortBy || 'Date',
    sortOrder: requestData.sortOrder || 'desc'
  })
});
    
    // Read the response as text
    const responseText = await makeResponse.text();
    console.log('Raw response from Make.com:', responseText);
    
    // Process the response based on content
    if (!responseText || responseText.trim() === '') {
      // Handle empty response
      console.warn('Empty response received from Make.com');
      return {
        statusCode: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([]) // Return empty array for no results
      };
    }
    
    // Check if the response is just a number or simple text
    const isJustNumber = /^\s*\d+\s*$/.test(responseText);
    const isSimpleText = responseText.length < 100 && !responseText.includes('{') && !responseText.includes('[');
    
    if (isJustNumber || isSimpleText) {
      console.warn('Make.com returned a simple value instead of invoice data:', responseText);
      return {
        statusCode: 502,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Integration Error',
          message: 'Make.com webhook is not configured to return proper invoice data. Please check the webhook configuration.',
          responseValue: responseText
        })
      };
    }
    
    // Try to parse as JSON
    try {
      const responseData = JSON.parse(responseText);
      
      // Check if we have the expected data structure
      if (Array.isArray(responseData)) {
        // Direct array of invoices
        return {
          statusCode: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(responseData)
        };
      } else if (responseData && responseData.Invoices && Array.isArray(responseData.Invoices)) {
        // Xero API standard response format
        return {
          statusCode: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(responseData)
        };
      } else {
        // Unexpected data format
        console.warn('Unexpected data format from Make.com:', responseData);
        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({
            error: 'Invalid Response',
            message: 'Received unexpected data format from Make.com webhook',
            data: responseData
          })
        };
      }
    } catch (error) {
      console.error('Error parsing JSON response from Make.com:', error);
      return {
        statusCode: 502,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Parse Error',
          message: 'Unable to parse response from Make.com as JSON',
          responsePreview: responseText.substring(0, 100)
        })
      };
    }
  } catch (error) {
    console.error('Error calling Make webhook:', error);
    
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