const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "stock_manager.db");
const db = new Database(dbPath);

db.pragma("foreign_keys = ON");

// Get our test user
const user = db.prepare(`
  SELECT * FROM users
  WHERE telegram_id = ?
`).get("123456789");

// Get Coca-Cola equivalent: first Vatika article
const article = db.prepare(`
  SELECT * FROM articles
  WHERE id = 1
`).get();

console.log("\n📦 ARTICLE BEFORE MOVEMENT");
console.log(article);

// =========================
// STOCK ENTRY
// =========================

function stockEntry(articleId, userId, quantity, note = "") {
  const article = db.prepare(`
    SELECT * FROM articles WHERE id = ?
  `).get(articleId);

  const previousQuantity = article.cartons;
  const newQuantity = previousQuantity + quantity;

  const update = db.prepare(`
    UPDATE articles
    SET cartons = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const movement = db.prepare(`
    INSERT INTO stock_movements
    (
      article_id,
      user_id,
      type,
      cartons_quantity,
      previous_quantity,
      new_quantity,
      note
    )
    VALUES (?, ?, 'ENTRY', ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    update.run(newQuantity, articleId);

    movement.run(
      articleId,
      userId,
      quantity,
      previousQuantity,
      newQuantity,
      note
    );
  });

  transaction();

  console.log(`\n📥 ENTRY: +${quantity} cartons`);
  console.log(`Stock: ${previousQuantity} → ${newQuantity}`);
}

// =========================
// STOCK EXIT
// =========================

function stockExit(articleId, userId, quantity, note = "") {
  const article = db.prepare(`
    SELECT * FROM articles WHERE id = ?
  `).get(articleId);

  const previousQuantity = article.cartons;
  const newQuantity = previousQuantity - quantity;

  if (newQuantity < 0) {
    console.log("\n❌ ERROR: Not enough stock!");
    console.log(`Available: ${previousQuantity} cartons`);
    console.log(`Requested: ${quantity} cartons`);
    return;
  }

  const update = db.prepare(`
    UPDATE articles
    SET cartons = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const movement = db.prepare(`
    INSERT INTO stock_movements
    (
      article_id,
      user_id,
      type,
      cartons_quantity,
      previous_quantity,
      new_quantity,
      note
    )
    VALUES (?, ?, 'EXIT', ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    update.run(newQuantity, articleId);

    movement.run(
      articleId,
      userId,
      quantity,
      previousQuantity,
      newQuantity,
      note
    );
  });

  transaction();

  console.log(`\n📤 EXIT: -${quantity} cartons`);
  console.log(`Stock: ${previousQuantity} → ${newQuantity}`);

  if (newQuantity === 0) {
    console.log("🔴 OUT OF STOCK");
  } else if (newQuantity <= article.minimum_stock) {
    console.log("⚠️ LOW STOCK");
  }
}

// =========================
// TEST
// =========================

console.log("\n👤 USER");
console.log(user);

console.log("\n📦 STARTING STOCK");
console.log(`${article.name}: ${article.cartons} cartons`);

// +5 cartons
stockEntry(article.id, user.id, 5, "New delivery");

// -3 cartons
stockExit(article.id, user.id, 3, "Customer order");

// Show final article
const finalArticle = db.prepare(`
  SELECT
    *,
    units_per_carton * cartons AS total_units,
    carton_price * cartons AS stock_value
  FROM articles
  WHERE id = ?
`).get(article.id);

console.log("\n📦 FINAL STOCK");
console.table(finalArticle);

// Show movement history
console.log("\n📜 MOVEMENT HISTORY");

const history = db.prepare(`
  SELECT
    sm.id,
    a.name AS article,
    u.name AS user,
    sm.type,
    sm.cartons_quantity,
    sm.previous_quantity,
    sm.new_quantity,
    sm.note,
    sm.created_at
  FROM stock_movements sm
  JOIN articles a ON a.id = sm.article_id
  JOIN users u ON u.id = sm.user_id
  ORDER BY sm.id
`).all();

console.table(history);

db.close();