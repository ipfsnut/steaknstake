// Test leaderboard cache table directly
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://steaknstake:eicf3phXpGGVm3rybBlmH59Fj3ctT7TV@dpg-d40hjf49c44c73bb73lg-a.oregon-postgres.render.com/steaknstake?sslmode=require';

async function testLeaderboardCache() {
  const { Client } = require('pg');
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Test simple cache query
    console.log('🔍 Testing simple cache query...');
    const cacheResult = await client.query('SELECT * FROM leaderboard_cache ORDER BY rank');
    console.log('📊 Cache contents:');
    console.table(cacheResult.rows);

    // Test the complex join query from endpoint
    console.log('🔍 Testing complex join query...');
    const complexResult = await client.query(`
      SELECT 
        lc.wallet_address,
        lc.rank,
        lc.staked_amount,
        lc.total_tips_sent,
        lc.total_tips_received,
        lc.leaderboard_score,
        u.farcaster_username,
        u.farcaster_fid,
        sp.staked_at,
        sp.total_rewards_earned
      FROM leaderboard_cache lc
      LEFT JOIN users u ON lc.wallet_address = u.wallet_address
      LEFT JOIN staking_positions sp ON u.id = sp.user_id
      ORDER BY lc.rank
      LIMIT 20 OFFSET 0
    `);
    console.log('📊 Complex query results:');
    console.table(complexResult.rows);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.end();
  }
}

testLeaderboardCache();