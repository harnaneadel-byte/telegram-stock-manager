const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
const PORT = 3001;

// Connect to the existing SQLite database
const dbPath = path.join(
  __dirname,
  "..",
  "database",
  "stock_manager.db"
);

const db = new Database(dbPath);

// Middleware
app.use(cors());
app.use(express.json());

// =========================
// GET ALL ARTICLES
// =========================
app.get("/api/articles", (req, res) => {
  try {
    const articles = db.prepare(`
      SELECT
        id,
        name,
        units_per_carton,
        cartons,
        unit_price,
        carton_price,
        minimum_stock,
        (units_per_carton * cartons) AS total_units,
        (cartons * carton_price) AS stock_value,
        CASE
          WHEN cartons <= minimum_stock THEN 1
          ELSE 0
        END AS low_stock
      FROM articles
      ORDER BY name
    `).all();

    res.json(articles);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load articles" });
  }
});

// =========================
// GET ONE ARTICLE
// =========================
app.get("/api/articles/:id", (req, res) => {
  try {
    const article = db.prepare(`
      SELECT
        id,
        name,
        units_per_carton,
        cartons,
        unit_price,
        carton_price,
        minimum_stock,
        (units_per_carton * cartons) AS total_units,
        (cartons * carton_price) AS stock_value,
        CASE
          WHEN cartons <= minimum_stock THEN 1
          ELSE 0
        END AS low_stock
      FROM articles
      WHERE id = ?
    `).get(req.params.id);

    if (!article) {
      return res.status(404).json({ error: "Article not found" });
    }

    res.json(article);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load article" });
  }
});

// =========================
// STOCK ENTRY
// =========================
app.post("/api/stock/entry", (req, res) => {
  try {
    const { article_id, cartons_quantity, note } = req.body;

    if (!article_id || !cartons_quantity) {
      return res.status(400).json({
        error: "article_id and cartons_quantity are required"
      });
    }

    const quantity = Number(cartons_quantity);

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({
        error: "cartons_quantity must be a positive integer"
      });
    }

    const article = db.prepare(`
      SELECT * FROM articles WHERE id = ?
    `).get(article_id);

    if (!article) {
      return res.status(404).json({
        error: "Article not found"
      });
    }

    const previousQuantity = article.cartons;
    const newQuantity = previousQuantity + quantity;

    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE articles
        SET cartons = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newQuantity, article_id);

      db.prepare(`
        INSERT INTO stock_movements (
          article_id,
          user_id,
          type,
          cartons_quantity,
          previous_quantity,
          new_quantity,
          note
        )
        VALUES (?, ?, 'ENTRY', ?, ?, ?, ?)
      `).run(
        article_id,
        1,
        quantity,
        previousQuantity,
        newQuantity,
        note || null
      );
    });

    transaction();

    res.json({
      success: true,
      previous_quantity: previousQuantity,
      new_quantity: newQuantity
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Failed to add stock"
    });
  }
});

// =========================
// STOCK EXIT
// =========================
app.post("/api/stock/exit", (req, res) => {
  try {
    const { article_id, cartons_quantity, note } = req.body;

    if (!article_id || !cartons_quantity) {
      return res.status(400).json({
        error: "article_id and cartons_quantity are required"
      });
    }

    const quantity = Number(cartons_quantity);

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({
        error: "cartons_quantity must be a positive integer"
      });
    }

    const article = db.prepare(`
      SELECT * FROM articles WHERE id = ?
    `).get(article_id);

    if (!article) {
      return res.status(404).json({
        error: "Article not found"
      });
    }

    const previousQuantity = article.cartons;

    if (quantity > previousQuantity) {
      return res.status(400).json({
        error: "Not enough stock"
      });
    }

    const newQuantity = previousQuantity - quantity;

    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE articles
        SET cartons = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newQuantity, article_id);

      db.prepare(`
        INSERT INTO stock_movements (
          article_id,
          user_id,
          type,
          cartons_quantity,
          previous_quantity,
          new_quantity,
          note
        )
        VALUES (?, ?, 'EXIT', ?, ?, ?, ?)
      `).run(
        article_id,
        1,
        quantity,
        previousQuantity,
        newQuantity,
        note || null
      );
    });

    transaction();

    res.json({
      success: true,
      previous_quantity: previousQuantity,
      new_quantity: newQuantity
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Failed to remove stock"
    });
  }
});

// =========================
// MOVEMENT HISTORY
// =========================
app.get("/api/movements", (req, res) => {
  try {
    const movements = db.prepare(`
      SELECT
        stock_movements.id,
        articles.name AS article_name,
        users.name AS user_name,
        stock_movements.type,
        stock_movements.cartons_quantity,
        stock_movements.previous_quantity,
        stock_movements.new_quantity,
        stock_movements.note,
        stock_movements.created_at
      FROM stock_movements
      JOIN articles
        ON articles.id = stock_movements.article_id
      JOIN users
        ON users.id = stock_movements.user_id
      ORDER BY stock_movements.id DESC
    `).all();

    res.json(movements);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Failed to load movements"
    });
  }
});

// =========================
// TEST ROUTE
// =========================
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Stock Manager API is running"
  });
});

// =========================
// START SERVER
// =========================
app.listen(PORT, () => {
  console.log(`Stock Manager API running at http://localhost:${PORT}`);
});