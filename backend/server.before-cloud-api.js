require("dotenv").config();

const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3001;

// --------------------------------------------------
// Middleware
// --------------------------------------------------

app.use(cors());
app.use(express.json());

// --------------------------------------------------
// SQLite - local prototype / backup
// --------------------------------------------------

const db = new Database(
  "C:\\telegram-stock-manager\\database\\stock_manager.db"
);

// --------------------------------------------------
// Supabase - production cloud database
// --------------------------------------------------

if (!process.env.SUPABASE_URL) {
  console.error("❌ SUPABASE_URL is missing from .env");
  process.exit(1);
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY is missing from .env");
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// --------------------------------------------------
// Health check
// --------------------------------------------------

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Telegram Stock Manager API is running",
    database: "SQLite + Supabase",
    port: PORT
  });
});

// --------------------------------------------------
// Existing SQLite articles endpoint
// Keeps the current frontend working.
// --------------------------------------------------

app.get("/api/articles", (req, res) => {
  try {
    const articles = db.prepare(`
      SELECT
        id,
        name,
        units_per_carton,
        cartons,
        (cartons * units_per_carton) AS units,
        unit_price,
        carton_price,
        minimum_stock,
        (cartons * carton_price) AS stock_value,
        created_at,
        updated_at
      FROM articles
      ORDER BY id
    `).all();

    const totals = db.prepare(`
      SELECT
        COALESCE(SUM(cartons), 0) AS total_cartons,
        COALESCE(SUM(cartons * units_per_carton), 0) AS total_units,
        COALESCE(SUM(cartons * carton_price), 0) AS total_stock_value
      FROM articles
    `).get();

    res.json({
      success: true,
      source: "sqlite",
      articles,
      totals
    });
  } catch (error) {
    console.error("SQLite articles error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to load articles"
    });
  }
});

// --------------------------------------------------
// CLOUD: Get SORALI company
// --------------------------------------------------

app.get("/api/cloud/company", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("companies")
      .select("id, name, code, currency, active")
      .eq("code", "SORALI")
      .single();

    if (error) {
      console.error("Supabase company query error:", error);

      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      source: "supabase",
      company: data
    });
  } catch (error) {
    console.error("Cloud company error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to connect to cloud database"
    });
  }
});

// --------------------------------------------------
// CLOUD: Get warehouses for SORALI
// --------------------------------------------------

app.get("/api/cloud/warehouses", async (req, res) => {
  try {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("code", "SORALI")
      .single();

    if (companyError) {
      return res.status(500).json({
        success: false,
        error: companyError.message
      });
    }

    const { data, error } = await supabase
      .from("warehouses")
      .select("id, name, code, active, company_id")
      .eq("company_id", company.id)
      .order("name");

    if (error) {
      console.error("Supabase warehouses query error:", error);

      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      source: "supabase",
      warehouses: data
    });
  } catch (error) {
    console.error("Cloud warehouses error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to load warehouses"
    });
  }
});

// --------------------------------------------------
// CLOUD: Get admin user
// --------------------------------------------------

app.get("/api/cloud/admin", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select(`
        id,
        telegram_id,
        username,
        full_name,
        role,
        active,
        company_id
      `)
      .eq("telegram_id", "1046422785")
      .single();

    if (error) {
      console.error("Supabase admin query error:", error);

      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      source: "supabase",
      user: data
    });
  } catch (error) {
    console.error("Cloud admin error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to load admin user"
    });
  }
});

// --------------------------------------------------
// Start server
// --------------------------------------------------

app.listen(PORT, () => {
  console.log("");
  console.log("==============================================");
  console.log(" Telegram Stock Manager API");
  console.log("==============================================");
  console.log(` Server: http://localhost:${PORT}`);
  console.log(" SQLite: connected");
  console.log(" Supabase: configured");
  console.log("==============================================");
  console.log("");
});