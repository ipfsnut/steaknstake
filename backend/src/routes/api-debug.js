const express = require('express');
const router = express.Router();
const db = require('../services/database');

// API Debug Dashboard - Test all endpoints systematically
router.get('/dashboard', async (req, res) => {
  const baseUrl = process.env.NODE_ENV === 'production' 
    ? 'https://happy-determination-production.up.railway.app'
    : 'http://localhost:3005';

  const testAddress = '0x18a85ad341b2d6a2bd67fbb104b4827b922a2a3c';
  
  const endpoints = [
    // Basic endpoints
    { name: 'Health Check', url: '/api/health', method: 'GET' },
    { name: 'Root Info', url: '/', method: 'GET' },
    { name: 'Debug Deployment', url: '/api/debug/deployment', method: 'GET' },
    
    // Staking endpoints (the problematic ones)
    { name: 'Staking Stats', url: '/api/staking/stats', method: 'GET' },
    { name: 'Staking Position', url: `/api/staking/position/${testAddress}`, method: 'GET' },
    { name: 'Staking Leaderboard', url: '/api/staking/leaderboard', method: 'GET' },
    { name: 'Staking Test Route', url: `/api/staking/test/${testAddress}`, method: 'GET' },
    
    // User endpoints
    { name: 'User Profile', url: `/api/users/profile/${testAddress}`, method: 'GET' },
    { name: 'User Search', url: '/api/users/search?q=epic', method: 'GET' },
    { name: 'Tippers Leaderboard', url: '/api/users/leaderboard/tippers', method: 'GET' },
    
    // Farcaster endpoints
    { name: 'Farcaster User', url: '/api/farcaster/user/8573', method: 'GET' },
    { name: 'Farcaster Webhook', url: '/api/farcaster/webhook', method: 'POST', body: {} },
    
    // New minimal route
    { name: 'Minimal Test', url: '/api/staking-minimal/minimal-test', method: 'GET' },
    
    // Database direct test
    { name: 'Database Test', url: '/api/api-debug/db-test', method: 'GET' },
  ];

  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>SteakNStake API Debug Dashboard</title>
    <style>
        body { font-family: monospace; padding: 20px; background: #1a1a1a; color: #fff; }
        .endpoint { margin: 10px 0; padding: 10px; border: 1px solid #333; border-radius: 4px; }
        .success { background: #1a4a1a; border-color: #4a8a4a; }
        .error { background: #4a1a1a; border-color: #8a4a4a; }
        .pending { background: #1a1a4a; border-color: #4a4a8a; }
        button { padding: 8px 12px; margin: 5px; cursor: pointer; }
        .response { margin-top: 10px; padding: 10px; background: #2a2a2a; border-radius: 4px; white-space: pre-wrap; }
        .status { font-weight: bold; }
        h1 { color: #ff6b6b; }
        h2 { color: #4ecdc4; }
    </style>
</head>
<body>
    <h1>🥩 SteakNStake API Debug Dashboard</h1>
    <p>Base URL: <strong>${baseUrl}</strong></p>
    <p>Test Address: <strong>${testAddress}</strong></p>
    
    <button onclick="testAllEndpoints()">🧪 Test All Endpoints</button>
    <button onclick="testStakingOnly()">💰 Test Staking Only</button>
    <button onclick="clearResults()">🗑️ Clear Results</button>
    
    <h2>Endpoints</h2>
    <div id="endpoints">
        ${endpoints.map((endpoint, i) => `
            <div class="endpoint pending" id="endpoint-${i}">
                <div class="status">${endpoint.name}</div>
                <div><strong>${endpoint.method}</strong> ${endpoint.url}</div>
                <button onclick="testEndpoint(${i})">Test</button>
                <div class="response" id="response-${i}" style="display:none;"></div>
            </div>
        `).join('')}
    </div>

    <script>
        const endpoints = ${JSON.stringify(endpoints)};
        const baseUrl = '${baseUrl}';
        
        async function testEndpoint(index) {
            const endpoint = endpoints[index];
            const elementId = 'endpoint-' + index;
            const responseId = 'response-' + index;
            
            document.getElementById(elementId).className = 'endpoint pending';
            document.getElementById(responseId).style.display = 'block';
            document.getElementById(responseId).textContent = 'Testing...';
            
            try {
                const options = {
                    method: endpoint.method,
                    headers: { 'Content-Type': 'application/json' }
                };
                
                if (endpoint.body) {
                    options.body = JSON.stringify(endpoint.body);
                }
                
                const response = await fetch(baseUrl + endpoint.url, options);
                const data = await response.text();
                
                const success = response.ok;
                document.getElementById(elementId).className = success ? 'endpoint success' : 'endpoint error';
                
                document.getElementById(responseId).textContent = 
                    'Status: ' + response.status + ' ' + response.statusText + '\\n\\n' + 
                    (data || 'No response body');
                    
            } catch (error) {
                document.getElementById(elementId).className = 'endpoint error';
                document.getElementById(responseId).textContent = 'Error: ' + error.message;
            }
        }
        
        async function testAllEndpoints() {
            for (let i = 0; i < endpoints.length; i++) {
                await testEndpoint(i);
                await new Promise(resolve => setTimeout(resolve, 200)); // Small delay
            }
        }
        
        async function testStakingOnly() {
            const stakingIndices = [3, 4, 5, 6]; // Staking endpoints
            for (const i of stakingIndices) {
                await testEndpoint(i);
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
        
        function clearResults() {
            document.querySelectorAll('.endpoint').forEach(el => {
                el.className = 'endpoint pending';
            });
            document.querySelectorAll('.response').forEach(el => {
                el.style.display = 'none';
                el.textContent = '';
            });
        }
    </script>
</body>
</html>
  `;

  res.send(html);
});

// Direct database test
router.get('/db-test', async (req, res) => {
  try {
    const client = await db.getClient();
    
    // Test basic connection
    const timeResult = await client.query('SELECT NOW() as current_time');
    
    // Test user lookup
    const userResult = await client.query(
      'SELECT * FROM users WHERE wallet_address = $1',
      ['0x18a85ad341b2d6a2bd67fbb104b4827b922a2a3c']
    );
    
    // Test staking position lookup
    const positionResult = await client.query(
      'SELECT * FROM staking_positions WHERE user_id = $1',
      [userResult.rows[0]?.id]
    );
    
    client.release();
    
    res.json({
      success: true,
      currentTime: timeResult.rows[0].current_time,
      userFound: userResult.rows.length > 0,
      userData: userResult.rows[0] || null,
      positionFound: positionResult.rows.length > 0,
      positionData: positionResult.rows[0] || null,
      message: 'Database connection and queries working perfectly'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Manual batch processor trigger for testing
router.post('/trigger-batch', async (req, res) => {
  try {
    const { triggerBatchProcessing } = require('../services/batchProcessor');
    
    console.log('🔧 Manual batch processing triggered via API endpoint');
    await triggerBatchProcessing();
    
    res.json({
      success: true,
      message: 'Batch processing completed successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Batch processing failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

module.exports = router;