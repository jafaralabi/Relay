const app = require('./app');
const { seedDemoData } = require('./demo');
const { getAllCases } = require('./db');
require('dotenv').config();

if (process.env.SEED_ON_EMPTY === 'true') {
  const cases = getAllCases();
  if (cases.length === 0) {
    console.log('[Server Boot] SEED_ON_EMPTY=true and database is empty. Seeding demo cases...');
    seedDemoData();
  }
}

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`[Relay Backend] Server running on http://localhost:${PORT}`);
});

module.exports = server;
