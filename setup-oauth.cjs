const http = require('http');
const axios = require('axios');
const url = require('url');
const querystring = require('querystring');

// Read configuration from environment variables
const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/oauth/callback';
const SCOPE = 'Desk.tickets.READ';

// Zoho OAuth Endpoints
const ZOHO_ACCOUNTS_BASE_URL = 'https://accounts.zoho.com';
const AUTHORISATION_URL = `${ZOHO_ACCOUNTS_BASE_URL}/oauth/v2/auth`;
const TOKEN_URL = `${ZOHO_ACCOUNTS_BASE_URL}/oauth/v2/token`;

const PORT = 3000;

// Check if environment variables are set
if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET) {
  console.log('\n❌ Environment Variables Required');
  console.log('Please set the following environment variables:');
  console.log('- ZOHO_CLIENT_ID');
  console.log('- ZOHO_CLIENT_SECRET');
  console.log('\nYou can set them temporarily like this:');
  console.log('Windows: set ZOHO_CLIENT_ID=your_client_id && set ZOHO_CLIENT_SECRET=your_secret && node setup-oauth.js');
  console.log('macOS/Linux: ZOHO_CLIENT_ID=your_client_id ZOHO_CLIENT_SECRET=your_secret node setup-oauth.js');
  console.log('\nGet these credentials from: https://api-console.zoho.com/');
  process.exit(1);
}

// Construct Authorisation URL
const authUrlParams = new URLSearchParams({
  response_type: 'code',
  client_id: ZOHO_CLIENT_ID,
  scope: SCOPE,
  redirect_uri: REDIRECT_URI,
  access_type: 'offline',
  prompt: 'consent'
});
const authorisationRequestUrl = `${AUTHORISATION_URL}?${authUrlParams.toString()}`;

console.log('\n🔐 Zoho Desk OAuth Setup');
console.log('========================');
console.log('\n📋 Step 1: Authorise Application');
console.log('Open this URL in your browser:');
console.log(`\n${authorisationRequestUrl}\n`);
console.log('💡 After authorizing, your browser will redirect to localhost:3000');
console.log('   This might show an error page - that\'s normal!');
console.log(`\n🔍 Listening on http://localhost:${PORT}/oauth/callback ...\n`);

// Start temporary server to catch the redirect
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);

  if (parsedUrl.pathname === '/oauth/callback') {
    const authCode = parsedUrl.query.code;

    if (authCode) {
      console.log('✅ Authorisation code received');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2>✅ Authorisation Successful!</h2>
            <p>You can close this browser tab and return to your terminal.</p>
          </body>
        </html>
      `);

      try {
        console.log('🔄 Exchanging authorisation code for tokens...');
        const tokenResponse = await axios.post(TOKEN_URL, querystring.stringify({
          code: authCode,
          client_id: ZOHO_CLIENT_ID,
          client_secret: ZOHO_CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code'
        }), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });

        const { access_token, refresh_token, expires_in, error } = tokenResponse.data;

        if (error) {
          console.error('\n❌ Error getting tokens:', error);
          if (tokenResponse.data.error_description) {
            console.error('Description:', tokenResponse.data.error_description);
          }
        } else if (refresh_token) {
          console.log('\n🎉 SUCCESS! Setup Complete');
          console.log('============================');
          console.log('\n📝 Your credentials:');
          console.log(`Access Token: ${access_token}`);
          console.log(`Expires in: ${expires_in} seconds`);
          console.log('\n🔑 IMPORTANT - Save this refresh token securely:');
          console.log('─'.repeat(50));
          console.log(`${refresh_token}`);
          console.log('─'.repeat(50));
          console.log('\n📋 Next steps:');
          console.log('1. Add the refresh token to your MCP configuration');
          console.log('2. Update your Claude Desktop config or .roo/mcp.json with:');
          console.log(`
    "env": {
      "ZOHO_CLIENT_ID": "${ZOHO_CLIENT_ID}",
      "ZOHO_CLIENT_SECRET": "${ZOHO_CLIENT_SECRET}",
      "ZOHO_REFRESH_TOKEN": "${refresh_token}"
    }
          `);
          console.log('\n⚠️  Keep your refresh token secure - it provides access to your Zoho Desk data!');
        } else {
          console.warn('\n⚠️  Warning: Refresh token not returned');
          console.log('This might happen if:');
          console.log('- You\'ve already authorized this app before');
          console.log('- The app configuration doesn\'t request offline access');
          console.log('\nFull response:', tokenResponse.data);
        }

      } catch (err) {
        console.error('\n❌ Error during token exchange:');
        console.error(err.response ? err.response.data : err.message);
      } finally {
        console.log('\n🛑 Shutting down temporary server...');
        server.close(() => process.exit(0));
      }
    } else {
      const error = parsedUrl.query.error;
      console.error('\n❌ Authorisation failed');
      if (error) {
        console.error('Error:', error);
        if (parsedUrl.query.error_description) {
          console.error('Description:', parsedUrl.query.error_description);
        }
      }
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2>❌ Authorisation Failed</h2>
            <p>Authorisation code not found. Please try again.</p>
          </body>
        </html>
      `);
      server.close(() => process.exit(1));
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found. Waiting for /oauth/callback');
  }
});

server.listen(PORT, (err) => {
  if (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
});

process.on('SIGINT', () => {
  console.log('\n\n⏹️  Setup cancelled by user');
  server.close(() => {
    process.exit(0);
  });
});