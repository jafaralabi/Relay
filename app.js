// Entry point for Vercel. Vercel looks for a file that imports express and exports the app.
// Locally Relay still starts with `npm start` (src/server.js); this file is only used when hosted on Vercel.
const express = require('express'); // eslint-disable-line no-unused-vars
require('./src/data-manifest');     // makes sure the data files are part of the deployed bundle
const app = require('./src/app');

// src/server.js never runs on Vercel, so seed the sample cases here when the (temporary) database is empty.
if (process.env.SEED_ON_EMPTY === 'true') {
  try {
    const { getAllCases } = require('./src/db');
    const { seedDemoData } = require('./src/demo');
    if (getAllCases().length === 0) {
      console.log('[Vercel Boot] SEED_ON_EMPTY=true and the database is empty. Seeding sample cases...');
      seedDemoData();
    }
  } catch (err) {
    console.error('[Vercel Boot] Seeding failed:', err.message);
  }
}

module.exports = app;
