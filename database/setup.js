const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "stock_manager.db");
const db = new Database(dbPath);

db.pragma("foreign_keys = ON");

// =========================
// CREATE TABLES
// =========================

db.exec(`
  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    units_per_carton INTEGER NOT NULL CHECK (units_per_carton > 0),
    cartons INTEGER NOT NULL DEFAULT 0 CHECK (cartons >= 0),
    unit_price REAL NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    carton_price REAL NOT NULL DEFAULT 0 CHECK (carton_price >= 0),
    minimum_stock INTEGER NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT UNIQUE NOT NULL,
    name TEXT,
    username TEXT,
    role TEXT NOT NULL DEFAULT 'viewer',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('ENTRY', 'EXIT')),
    cartons_quantity INTEGER NOT NULL CHECK (cartons_quantity > 0),
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (article_id) REFERENCES articles(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// =========================
// INSERT TEST USER
// =========================

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users
  (telegram_id, name, username, role)
  VALUES (?, ?, ?, ?)
`);

insertUser.run("123456789", "Test Admin", "testadmin", "admin");

// =========================
// INSERT TEST ARTICLES
// =========================

const insertArticle = db.prepare(`
  INSERT INTO articles
  (name, units_per_carton, cartons, unit_price, carton_price, minimum_stock)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const articles = [
  ["Vatika Shampoo Black Seed 180ml", 24, 12, 450, 10800, 2],
  ["Vatika Shampoo Garlic 180ml", 24, 8, 450, 10800, 2],
  ["Vatika Shampoo Egg Protein 180ml", 24, 15, 450, 10800, 2],
  ["Vatika Shampoo Olive 180ml", 24, 4, 500, 12000, 2]
];

const count = db
  .prepare("SELECT COUNT(*) AS count FROM articles")
  .get();

if (count.count === 0) {
  const insertMany = db.transaction(() => {
    for (const article of articles) {
      insertArticle.run(...article);
    }
  });

  insertMany();

  console.log("✅ Test articles inserted!");
}

// =========================
// DISPLAY ARTICLES
// =========================

console.log("\n📦 CURRENT STOCK\n");

const rows = db.prepare(`
  SELECT
    id,
    name,
    units_per_carton,
    cartons,
    unit_price,
    carton_price,
    (units_per_carton * cartons) AS total_units,
    (cartons * carton_price) AS stock_value,
    minimum_stock
  FROM articles
`).all();

console.table(rows);

db.close();

console.log("\n✅ Database setup complete!");