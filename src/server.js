const app = require('./app');
require('dotenv').config();

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[Relay Backend] Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
