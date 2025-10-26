#!/usr/bin/env node

require('dotenv').config();

async function checkUsers() {
  try {
    const db = require('../src/services/database');
    const client = await db.getClient();
    
    const result = await client.query('SELECT * FROM users ORDER BY created_at DESC LIMIT 5');
    console.log('👥 Users in database:', result.rows);
    
    client.release();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkUsers();