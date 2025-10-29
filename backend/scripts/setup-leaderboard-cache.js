const fs = require('fs');
const path = require('path');

// Database connection for Render PostgreSQL
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://steaknstake:eicf3phXpGGVm3rybBlmH59Fj3ctT7TV@dpg-d40hjf49c44c73bb73lg-a.oregon-postgres.render.com/steaknstake?sslmode=require';

console.log('🗃️ Setting up leaderboard cache table...');

async function setupLeaderboardCache() {
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

    // Read and execute the SQL file
    const sqlFile = path.join(__dirname, '../database-leaderboard-cache.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    console.log('📄 Executing leaderboard cache SQL...');
    await client.query(sql);
    console.log('✅ Leaderboard cache table and function created');

    // Initial population of cache
    console.log('🔄 Populating initial leaderboard cache...');
    await client.query('SELECT refresh_leaderboard_cache()');
    console.log('✅ Leaderboard cache populated');

    // Check results
    const result = await client.query('SELECT * FROM leaderboard_cache ORDER BY rank');
    console.log('📊 Leaderboard cache contents:');
    console.table(result.rows);

  } catch (error) {
    console.error('❌ Error setting up leaderboard cache:', error);
    throw error;
  } finally {
    await client.end();
  }
}

setupLeaderboardCache()
  .then(() => {
    console.log('🎉 Leaderboard cache setup complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Setup failed:', error);
    process.exit(1);
  });