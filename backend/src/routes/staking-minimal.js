const express = require('express');
const router = express.Router();

// Minimal test route
router.get('/minimal-test', (req, res) => {
  res.json({
    success: true,
    message: 'Minimal staking route working'
  });
});

module.exports = router;