// Uses better-sqlite3 when its native module loads; otherwise falls back to Node's built-in SQLite (node:sqlite, Node 22+)
// with the small part of the better-sqlite3 API that Relay uses. This keeps the app runnable on hosts where the native
// module cannot be built or loaded (for example some serverless platforms).
let Database;
try {
  Database = require('better-sqlite3');
  new Database(':memory:').close(); // fails here if the native binding is missing
} catch (err) {
  console.warn('[DB] better-sqlite3 unavailable (' + String(err && err.message).split('\n')[0] + '); using node:sqlite instead.');
  const { DatabaseSync } = require('node:sqlite');
  Database = class {
    constructor(file) { this.d = new DatabaseSync(file); }
    pragma(text) { this.d.exec('PRAGMA ' + text); }
    exec(sql) { this.d.exec(sql); }
    close() { this.d.close(); }
    prepare(sql) {
      const st = this.d.prepare(sql);
      return { get: (...a) => st.get(...a), all: (...a) => st.all(...a), run: (...a) => st.run(...a) };
    }
    transaction(fn) {
      return (...args) => {
        this.d.exec('BEGIN');
        try { const result = fn(...args); this.d.exec('COMMIT'); return result; }
        catch (e) { try { this.d.exec('ROLLBACK'); } catch (_) { /* ignore */ } throw e; }
      };
    }
  };
}
module.exports = Database;
