// Test: cargar modulos uno por uno
console.log('Step 1: require express');
const express = require('express');
console.log('Step 2: express OK');
const session = require('express-session');
console.log('Step 3: session OK');
const cookieParser = require('cookie-parser');
console.log('Step 4: cookieParser OK');
const helmet = require('helmet');
console.log('Step 5: helmet OK');
const rateLimit = require('express-rate-limit');
console.log('Step 6: rateLimit OK');
const multer = require('multer');
console.log('Step 7: multer OK');
const path = require('path');
console.log('Step 8: path OK');
const cron = require('node-cron');
console.log('Step 9: cron OK');
const fs = require('fs');
console.log('Step 10: fs OK');
const bcrypt = require('bcrypt');
console.log('Step 11: bcrypt OK');
const crypto = require('crypto');
console.log('Step 12: crypto OK');

console.log('All modules loaded OK, starting server...');
const app = express();
const PORT = process.env.PORT || 3300;
app.get('/', (req, res) => res.send('Queen VIP Royal - OK'));
app.get('/health', (req, res) => res.json({ok: true}));
app.listen(PORT, '0.0.0.0', () => {
  console.log('Server running on port ' + PORT);
});
