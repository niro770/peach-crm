require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: [process.env.FRONTEND_URL || 'http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many login attempts' } }));
app.use('/api/', rateLimit({ windowMs: 60 * 1000, max: 300 }));

// Routes
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/donors',        require('./routes/donors'));
app.use('/api/payments',      require('./routes/payments'));
app.use('/api/campaigns',     require('./routes/campaigns'));
app.use('/api/telemarketing', require('./routes/telemarketing'));
app.use('/api/tasks',         require('./routes/tasks'));
app.use('/api/mailing',       require('./routes/mailing'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), version: '1.0.0' });
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'public')));
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
}

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Server error' : err.message });
});

app.listen(PORT, () => {
  console.log(`🍑 Peach CRM API running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`   Env: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
