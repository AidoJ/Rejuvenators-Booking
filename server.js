const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Serve static files
app.use(express.static('.'));

// Secure endpoint to get Google API key
app.get('/api/google-key', (req, res) => {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error('Google API key not found in environment variables');
    return res.status(500).json({ error: 'Google API key not configured' });
  }
  res.json({ apiKey });
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  if (!process.env.GOOGLE_API_KEY) {
    console.warn('⚠️  WARNING: GOOGLE_API_KEY environment variable not set!');
    console.warn('   Create a .env file with your Google API key to enable Maps functionality.');
  } else {
    console.log('✅ Google API key loaded successfully');
  }
}); 