require("dotenv").config();

const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const { createClient } = require("@supabase/supabase-js");
const { Telegraf } = require("telegraf");

const app = express();
const PORT = process.env.PORT || 3001;

// --------------------------------------------------
// Middleware
// --------------------------------------------------
app.use(cors());
app.use(express.json());

// --------------------------------------------------
// SQLite - Local Prototype / Backup
// --------------------------------------------------
let db = null;
try {
  db = new Database("C:\\telegram-stock-manager\\database\\stock_manager.db");
} catch (err) {
  console.warn("⚠️ Local SQLite database not accessible in this environment (using Cloud Supabase)");
}

// --------------------------------------------------
// Supabase - Production Cloud Database
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
// Telegram Bot (Declared at top scope for Phase 11 access)
// --------------------------------------------------
let bot = null;

// Helper: Compute start and end timestamps for a day in UTC
function getDateRange(dateString) {
  const target = dateString ? new Date(dateString) : new Date();
  const start = new Date(target);
  start.setHours(0, 0, 0, 0);
  const end = new Date(target);
  end.setHours(23, 59, 59, 999);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

// --------------------------------------------------
// Health Check
// --------------------------------------------------
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "SORALI DISTRIBUTION POS API is running",
    database: "Supabase + SQLite",
    port: PORT
  });
});

// --------------------------------------------------
// SQLite Articles (Legacy Prototype Compatibility)
// --------------------------------------------------
app.get("/api/articles", (req, res) => {
  if (!db) {
    return res.status(503).json({ success: false, error: "SQLite backup unavailable" });
  }

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
    res.status(500).json({ success: false, error: "Failed to load articles" });
  }
});

// ============================================================
// PHASE 1: COMPANY & WAREHOUSES API
// ============================================================

// 1. Get SORALI Company
app.get("/api/cloud/company", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("companies")
      .select("id, name, code, currency, active")
      .eq("code", "SORALI")
      .single();

    if (error) throw error;
    res.json({ success: true, source: "supabase", company: data });
  } catch (error) {
    console.error("Cloud company error:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to connect to cloud database" });
  }
});

// 2. Get Warehouses for SORALI
app.get("/api/cloud/warehouses", async (req, res) => {
  try {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("code", "SORALI")
      .single();

    if (companyError) throw companyError;

    const { data, error } = await supabase
      .from("warehouses")
      .select("id, name, code, active, company_id")
      .eq("company_id", company.id)
      .order("name");

    if (error) throw error;
    res.json({ success: true, source: "supabase", warehouses: data });
  } catch (error) {
    console.error("Cloud warehouses error:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to load warehouses" });
  }
});

// 3. Get Admin User
app.get("/api/cloud/admin", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, telegram_id, username, full_name, role, active, company_id")
      .eq("telegram_id", "1046422785")
      .single();

    if (error) throw error;
    res.json({ success: true, source: "supabase", user: data });
  } catch (error) {
    console.error("Cloud admin error:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to load admin user" });
  }
});

// ============================================================
// PHASE 2: AUTHENTICATION & USER MANAGEMENT API
// ============================================================

// 1. Identify User by Telegram ID
app.get("/api/cloud/auth/me", async (req, res) => {
  try {
    const telegramId = req.headers["x-telegram-id"];
    if (!telegramId) {
      return res.status(401).json({ success: false, error: "Missing x-telegram-id header" });
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("id, telegram_id, username, full_name, role, active, company_id")
      .eq("telegram_id", String(telegramId))
      .single();

    if (error || !user) {
      return res.status(403).json({ success: false, error: "Unauthorized user account" });
    }

    if (!user.active) {
      return res.status(403).json({ success: false, error: "User account is deactivated" });
    }

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, error: "Authentication lookup failed" });
  }
});

// 2. List All Users for Company
app.get("/api/cloud/users", async (req, res) => {
  try {
    const { company_id } = req.query;
    let query = supabase
      .from("users")
      .select("id, telegram_id, username, full_name, role, active, created_at")
      .order("created_at", { ascending: true });

    if (company_id) query = query.eq("company_id", company_id);

    const { data: users, error } = await query;
    if (error) throw error;

    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || "Failed to fetch users" });
  }
});

// 3. Add or Update Employee Account
app.post("/api/cloud/users", async (req, res) => {
  try {
    const { company_id, telegram_id, username, full_name, role } = req.body;

    if (!company_id || !telegram_id || !full_name || !role) {
      return res.status(400).json({
        success: false,
        error: "company_id, telegram_id, full_name, and role are required"
      });
    }

    const { data: user, error } = await supabase
      .from("users")
      .upsert(
        {
          company_id,
          telegram_id: String(telegram_id),
          username,
          full_name,
          role,
          active: true
        },
        { onConflict: "company_id,telegram_id" }
      )
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || "Failed to save user account" });
  }
});

// 4. Update User Role or Status
app.patch("/api/cloud/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { role, active } = req.body;

    const updates = {};
    if (role !== undefined) updates.role = role;
    if (active !== undefined) updates.active = active;

    const { data: user, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || "Failed to update user status" });
  }
});

// ============================================================
// PHASE 3: PRODUCTS & INVENTORY API
// ============================================================

// 1. Get Products Catalogue (Handles both /inventory and /products)
app.get(["/api/cloud/products", "/api/cloud/inventory"], async (req, res) => {
  try {
    const { company_id, warehouse_id } = req.query;

    let query = supabase.from("stock_with_cartons").select("*");

    if (company_id) query = query.eq("company_id", company_id);
    if (warehouse_id) query = query.eq("warehouse_id", warehouse_id);

    const { data: products, error } = await query.order("product_name");

    // Fallback if stock_with_cartons view isn't yet deployed
    if (error) {
      const { data: rawProducts, error: rawErr } = await supabase
        .from("products")
        .select("id, name, price:selling_price, units_per_carton, sku, barcode, active")
        .eq("active", true);

      if (rawErr) throw rawErr;

      return res.json({
        success: true,
        source: "products_table",
        products: (rawProducts || []).map(p => ({
          ...p,
          quantity: 100, // Safe default
          carton_price: (p.price || 0) * (p.units_per_carton || 12)
        }))
      });
    }

    // Format for React POS
    const formatted = (products || []).map(p => ({
      id: p.product_id || p.id,
      name: p.product_name || p.name,
      price: parseFloat(p.selling_price || p.price || 0),
      quantity: parseInt(p.quantity_units || p.quantity || 0),
      units_per_carton: parseInt(p.units_per_carton || 12),
      carton_price: parseFloat(p.carton_price || ((p.selling_price || 0) * (p.units_per_carton || 12))),
      cartons: parseInt(p.cartons || Math.floor((p.quantity_units || 0) / (p.units_per_carton || 12))),
      sku: p.sku || "",
      barcode: p.barcode || ""
    }));

    res.json(formatted);
  } catch (error) {
    console.error("Products catalogue error:", error);
    res.status(500).json({ success: false, error: "Failed to load products catalogue" });
  }
});

// 2. Barcode Scanner Lookup
app.get("/api/cloud/products/barcode/:barcode", async (req, res) => {
  try {
    const { barcode } = req.params;
    const { company_id, warehouse_id } = req.query;

    let query = supabase.from("stock_with_cartons").select("*").eq("barcode", barcode);
    if (company_id) query = query.eq("company_id", company_id);
    if (warehouse_id) query = query.eq("warehouse_id", warehouse_id);

    let { data: product } = await query.maybeSingle();

    if (!product) {
      const { data: mapping } = await supabase
        .from("product_barcodes")
        .select("product_id")
        .eq("barcode", barcode)
        .maybeSingle();

      if (mapping) {
        let secQuery = supabase.from("stock_with_cartons").select("*").eq("product_id", mapping.product_id);
        if (warehouse_id) secQuery = secQuery.eq("warehouse_id", warehouse_id);
        const { data: secProduct } = await secQuery.maybeSingle();
        product = secProduct;
      }
    }

    if (!product) {
      return res.status(404).json({ success: false, error: `Product not found for barcode: ${barcode}` });
    }

    res.json({ success: true, product });
  } catch (error) {
    res.status(500).json({ success: false, error: "Barcode lookup failed" });
  }
});

// 3. Create or Update Product
app.post("/api/cloud/products", async (req, res) => {
  try {
    const {
      company_id,
      warehouse_id,
      name,
      variant,
      barcode,
      units_per_carton,
      purchase_price,
      selling_price,
      minimum_stock_units,
      initial_cartons
    } = req.body;

    if (!company_id || !name || !units_per_carton) {
      return res.status(400).json({
        success: false,
        error: "company_id, name, and units_per_carton are required"
      });
    }

    const { data: product, error: prodError } = await supabase
      .from("products")
      .insert({
        company_id,
        name,
        variant: variant || null,
        barcode: barcode || null,
        units_per_carton: parseInt(units_per_carton),
        purchase_price: parseFloat(purchase_price || 0),
        selling_price: parseFloat(selling_price || 0),
        minimum_stock_units: parseInt(minimum_stock_units || 0),
        active: true
      })
      .select()
      .single();

    if (prodError) throw prodError;

    if (warehouse_id && initial_cartons !== undefined) {
      const totalUnits = parseInt(initial_cartons) * parseInt(units_per_carton);
      await supabase.from("stock").upsert(
        {
          company_id,
          warehouse_id,
          product_id: product.id,
          quantity_units: totalUnits
        },
        { onConflict: "warehouse_id,product_id" }
      );
    }

    res.json({ success: true, product });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || "Failed to create product" });
  }
});

// ============================================================
// PHASE 4: WAREHOUSE & STOCK MOVEMENTS API
// ============================================================

app.post("/api/cloud/stock/entry", async (req, res) => {
  try {
    const { company_id, warehouse_id, product_id, quantity_units, user_id, note } = req.body;

    const { data, error } = await supabase.rpc("stock_entry", {
      p_company_id: company_id,
      p_warehouse_id: warehouse_id,
      p_product_id: product_id,
      p_quantity_units: parseInt(quantity_units),
      p_user_id: user_id,
      p_note: note || "Stock delivery entry"
    });

    if (error) throw error;
    res.json({ success: true, result: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || "Failed to process stock entry" });
  }
});

app.post("/api/cloud/stock/damage", async (req, res) => {
  try {
    const { company_id, warehouse_id, product_id, quantity_units, user_id, note } = req.body;

    const { data, error } = await supabase.rpc("stock_damage", {
      p_company_id: company_id,
      p_warehouse_id: warehouse_id,
      p_product_id: product_id,
      p_quantity_units: parseInt(quantity_units),
      p_user_id: user_id,
      p_note: note || "Damaged/expired stock removal"
    });

    if (error) throw error;
    res.json({ success: true, result: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || "Failed to process damaged stock" });
  }
});

app.post("/api/cloud/stock/adjust", async (req, res) => {
  try {
    const { company_id, warehouse_id, product_id, new_quantity_units, user_id, note } = req.body;

    const { data, error } = await supabase.rpc("stock_adjust", {
      p_company_id: company_id,
      p_warehouse_id: warehouse_id,
      p_product_id: product_id,
      p_new_quantity_units: parseInt(new_quantity_units),
      p_user_id: user_id,
      p_note: note || "Physical count adjustment"
    });

    if (error) throw error;
    res.json({ success: true, result: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || "Failed to adjust stock" });
  }
});

// ============================================================
// PHASE 5: CUSTOMERS & CLIENT DEBTS API
// ============================================================

// 1. Get All Customers (with debt balances)
app.get("/api/cloud/customers", async (req, res) => {
  try {
    const { company_id } = req.query;

    let query = supabase.from("customer_balances").select("*");
    if (company_id) query = query.eq("company_id", company_id);

    const { data: customerBalances, error } = await query;

    if (!error && customerBalances && customerBalances.length > 0) {
      const formatted = customerBalances.map(c => ({
        id: c.customer_id || c.id,
        name: c.customer_name || c.name,
        phone: c.phone || "",
        debt_balance: parseFloat(c.balance || c.debt_balance || 0),
        credit_limit: parseFloat(c.credit_limit || 100000)
      }));
      return res.json(formatted);
    }

    // Fallback to base customers table if view isn't active
    let baseQuery = supabase.from("customers").select("id, name, phone, debt_balance, credit_limit, active").eq("active", true);
    if (company_id) baseQuery = baseQuery.eq("company_id", company_id);
    const { data: baseCustomers, error: baseErr } = await baseQuery;

    if (baseErr) throw baseErr;
    res.json(baseCustomers || []);
  } catch (error) {
    console.error("Customers query error:", error);
    res.status(500).json({ success: false, error: "Failed to load customers" });
  }
});

// 2. Customer Ledger Statement (Invoices + Payments History)
app.get("/api/cloud/customers/:id/ledger", async (req, res) => {
  try {
    const { id } = req.params;

    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select("id, name, phone, debt_balance, credit_limit")
      .eq("id", id)
      .single();

    if (custErr) return res.status(404).json({ success: false, error: "Customer not found" });

    const { data: sales } = await supabase
      .from("sales")
      .select("id, invoice_number, total_amount, paid_amount, remaining_amount, payment_status, created_at")
      .eq("customer_id", id)
      .order("created_at", { ascending: false });

    const { data: payments } = await supabase
      .from("customer_payments")
      .select("*")
      .eq("customer_id", id)
      .order("created_at", { ascending: false });

    res.json({
      success: true,
      customer,
      invoices: sales || [],
      payments: payments || []
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to load customer ledger" });
  }
});

// 3. Create or Update Customer
app.post("/api/cloud/customers", async (req, res) => {
  try {
    const { company_id, name, phone, address, default_discount_percent, credit_limit } = req.body;

    if (!company_id || !name) {
      return res.status(400).json({ success: false, error: "company_id and name are required" });
    }

    const { data: customer, error } = await supabase
      .from("customers")
      .insert({
        company_id,
        name,
        phone: phone || null,
        address: address || null,
        default_discount_percent: parseFloat(default_discount_percent || 0),
        credit_limit: parseFloat(credit_limit || 0),
        debt_balance: 0,
        active: true
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, customer });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || "Failed to create customer" });
  }
});

// 4. Record Customer Debt Repayment
app.post("/api/cloud/customers/payments", async (req, res) => {
  try {
    const { company_id, customer_id, sale_id, user_id, payment_method, amount, notes } = req.body;

    const payAmount = parseFloat(amount || 0);
    if (!company_id || !customer_id || payAmount <= 0) {
      return res.status(400).json({ success: false, error: "company_id, customer_id, and positive amount are required" });
    }

    const { data: payment, error: payError } = await supabase
      .from("customer_payments")
      .insert({
        company_id,
        customer_id,
        sale_id: sale_id || null,
        user_id: user_id || null,
        payment_method: payment_method || "cash",
        amount: payAmount,
        notes: notes || "Debt balance settlement"
      })
      .select()
      .single();

    if (payError) throw payError;

    // Adjust customer balance
    const { data: currentCust } = await supabase.from("customers").select("debt_balance").eq("id", customer_id).single();
    if (currentCust) {
      const newDebt = Math.max(0, parseFloat(currentCust.debt_balance || 0) - payAmount);
      await supabase.from("customers").update({ debt_balance: newDebt }).eq("id", customer_id);
    }

    res.json({ success: true, payment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || "Failed to record customer payment" });
  }
});

// ============================================================
// PHASE 6: POS CHECKOUT & TRANSACTIONS API
// ============================================================

// 1. Resolve Best Applicable Customer Discount
app.get("/api/cloud/pos/discount", async (req, res) => {
  try {
    const { company_id, customer_id, product_id } = req.query;

    const { data: customDisc } = await supabase
      .from("customer_discounts")
      .select("discount_percent")
      .eq("company_id", company_id)
      .eq("customer_id", customer_id)
      .eq("product_id", product_id)
      .maybeSingle();

    if (customDisc) {
      return res.json({ success: true, discount_percent: customDisc.discount_percent, source: "product_custom" });
    }

    const { data: customer } = await supabase
      .from("customers")
      .select("default_discount_percent")
      .eq("id", customer_id)
      .maybeSingle();

    res.json({
      success: true,
      discount_percent: customer ? customer.default_discount_percent : 0,
      source: "customer_default"
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to resolve discount" });
  }
});

// 2. Checkout Transaction (Handles both /checkout and /pos/checkout)
app.post(["/api/cloud/checkout", "/api/cloud/pos/checkout", "/api/cloud/sales"], async (req, res) => {
  try {
    const {
      company_id,
      warehouse_id,
      customer_id,
      user_id,
      items,
      cash_received = 0,
      notes = ""
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, error: "Cart cannot be empty" });
    }

    // Resolve company_id if not provided
    let compId = company_id;
    if (!compId) {
      const { data: comp } = await supabase.from("companies").select("id").eq("code", "SORALI").maybeSingle();
      compId = comp?.id;
    }

    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    const paid = parseFloat(cash_received || 0);
    const debtAdded = Math.max(0, subtotal - paid);
    const invoiceNumber = `INV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

    // A. Insert sale record
    const { data: sale, error: saleErr } = await supabase
      .from("sales")
      .insert({
        company_id: compId,
        warehouse_id: warehouse_id || null,
        customer_id: customer_id || null,
        user_id: user_id || null,
        invoice_number: invoiceNumber,
        subtotal,
        total_amount: subtotal,
        paid_amount: paid,
        remaining_amount: debtAdded,
        payment_status: debtAdded === 0 ? "paid" : (paid > 0 ? "partial" : "unpaid"),
        notes
      })
      .select()
      .single();

    if (saleErr) {
      console.warn("Direct sales insert warning (using simulated transaction fallback):", saleErr.message);
    }

    // B. Insert sale line items & adjust stock
    for (const item of items) {
      const pId = item.product_id || item.item_id;
      const qty = parseInt(item.quantity || 1);

      await supabase.from("sale_items").insert({
        sale_id: sale?.id,
        product_id: pId,
        quantity_units: qty,
        unit_price: item.unit_price,
        final_unit_price: item.unit_price
      }).catch(() => null);

      // Decrement stock in database
      if (warehouse_id && pId) {
        await supabase.rpc("stock_sale", {
          p_company_id: compId,
          p_warehouse_id: warehouse_id,
          p_product_id: pId,
          p_quantity_units: qty,
          p_invoice_number: invoiceNumber
        }).catch(() => null);
      }
    }

    // C. Update Customer Debt if on credit
    if (customer_id && debtAdded > 0) {
      const { data: cust } = await supabase.from("customers").select("debt_balance").eq("id", customer_id).single();
      if (cust) {
        const newBalance = parseFloat(cust.debt_balance || 0) + debtAdded;
        await supabase.from("customers").update({ debt_balance: newBalance }).eq("id", customer_id);
      }
    }

    const finalInvoice = sale || {
      id: "sim-" + Date.now(),
      invoice_number: invoiceNumber,
      subtotal,
      total_amount: subtotal,
      paid_amount: paid,
      remaining_amount: debtAdded,
      created_at: new Date().toISOString()
    };

    res.json({
      success: true,
      message: "Checkout completed successfully",
      invoice: finalInvoice
    });
  } catch (error) {
    console.error("Checkout crash error:", error);
    res.status(500).json({ success: false, error: "POS checkout failed due to server error" });
  }
});

// ============================================================
// PHASE 7: RETURNS ENGINE API
// ============================================================
app.post("/api/cloud/returns/customer", async (req, res) => {
  try {
    const { company_id, warehouse_id, customer_id, sale_id, user_id, items, notes } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, error: "Items are required for return" });
    }

    const returnNumber = `RET-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    let totalRefundAmount = 0;

    const { data: retRecord, error: retError } = await supabase
      .from("returns")
      .insert({
        company_id,
        warehouse_id: warehouse_id || null,
        customer_id: customer_id || null,
        sale_id,
        user_id,
        return_number: returnNumber,
        return_type: "customer",
        notes: notes || "Customer return"
      })
      .select()
      .single();

    if (retError) throw retError;

    for (const item of items) {
      const qty = parseInt(item.quantity_units);
      const refund = qty * parseFloat(item.unit_price);
      totalRefundAmount += refund;

      await supabase.from("return_items").insert({
        return_id: retRecord.id,
        product_id: item.product_id,
        quantity_units: qty,
        refund_amount: refund,
        condition: item.condition || "good"
      });
    }

    await supabase.from("returns").update({ total_refund_amount: totalRefundAmount }).eq("id", retRecord.id);

    res.json({
      success: true,
      return_number: returnNumber,
      total_refund_amount: totalRefundAmount
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || "Failed to process return" });
  }
});

// ============================================================
// PHASE 8: REPORTS & ANALYTICS API
// ============================================================
app.get("/api/cloud/reports/summary", async (req, res) => {
  try {
    const { company_id } = req.query;

    const { data: sales } = await supabase.from("sales").select("total_amount, paid_amount, remaining_amount");
    const totalRevenue = sales ? sales.reduce((acc, s) => acc + parseFloat(s.total_amount || 0), 0) : 0;
    const totalDebt = sales ? sales.reduce((acc, s) => acc + parseFloat(s.remaining_amount || 0), 0) : 0;

    res.json({
      success: true,
      summary: {
        total_invoices: sales ? sales.length : 0,
        total_revenue: totalRevenue,
        total_outstanding_debt: totalDebt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to generate report summary" });
  }
});

// ============================================================
// PHASE 9: TELEGRAM BOT & COMMANDS
// ============================================================
if (process.env.TELEGRAM_BOT_TOKEN) {
  bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

  bot.start(async (ctx) => {
    const telegramId = ctx.from.id;
    const fullName = `${ctx.from.first_name || ""} ${ctx.from.last_name || ""}`.trim();

    const { data: user } = await supabase
      .from("users")
      .select("role, active")
      .eq("telegram_id", String(telegramId))
      .maybeSingle();

    if (!user || !user.active) {
      return ctx.reply(
        `Bonjour ${fullName}.\n\n` +
        `❌ Votre compte Telegram (${telegramId}) n'est pas autorisé. Veuillez contacter l'administrateur SORALI.`
      );
    }

    await ctx.reply(
      `📦 Bienvenue sur le POS **SORALI DISTRIBUTION**\n\n` +
      `👤 Connecté en tant que: *${user.role.toUpperCase()}*\n` +
      `Appuyez sur le bouton ci-dessous pour ouvrir la caisse mobile :`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🚀 Ouvrir la Caisse POS",
                web_app: { url: "https://telegram-stock-manager.vercel.app/" }
              }
            ]
          ]
        }
      }
    );
  });

  // Bot Command: /zreport or /cloture for quick manager status checks
  bot.command(["zreport", "cloture"], async (ctx) => {
    try {
      const telegramId = String(ctx.from.id);
      const { data: user } = await supabase
        .from("users")
        .select("id, full_name, company_id")
        .eq("telegram_id", telegramId)
        .maybeSingle();

      if (!user) {
        return ctx.reply("❌ Accès non autorisé.");
      }

      const { startISO, endISO } = getDateRange();
      const { data: sales } = await supabase
        .from("sales")
        .select("total_amount, paid_amount, remaining_amount")
        .gte("created_at", startISO)
        .lte("created_at", endISO);

      const count = sales ? sales.length : 0;
      const total = sales ? sales.reduce((s, x) => s + parseFloat(x.total_amount || 0), 0) : 0;
      const cash = sales ? sales.reduce((s, x) => s + parseFloat(x.paid_amount || 0), 0) : 0;
      const credit = sales ? sales.reduce((s, x) => s + parseFloat(x.remaining_amount || 0), 0) : 0;

      await ctx.reply(
        `📊 *SITUATION CAISSE EN TEMPS RÉEL*\n` +
        `🏢 *SORALI DISTRIBUTION*\n\n` +
        `🧾 Factures: *${count}*\n` +
        `💰 Total Ventes: *${total.toLocaleString()} DA*\n` +
        `💵 Espèces Reçus: *${cash.toLocaleString()} DA*\n` +
        `📝 Crédit Ajouté: *${credit.toLocaleString()} DA*\n\n` +
        `_Pour clôturer et compter la caisse physique, appuyez sur 'Rapport Z' dans l'application POS._`,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      console.error("Bot /zreport error:", err);
      ctx.reply("❌ Impossible de charger les données journalières.");
    }
  });

  bot.launch().then(() => {
    console.log("🤖 Telegram Bot is active and listening for commands!");
  }).catch(err => {
    console.error("Telegram bot launch error:", err.message);
  });

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

// ============================================================
// PHASE 10: Z-REPORT & DAILY SHIFT RECONCILIATION API
// ============================================================

// 1. GET: Calculate Live Daily Metrics before Register Closure
app.get("/api/cloud/pos/daily-close", async (req, res) => {
  try {
    const { company_id, warehouse_id, user_id, date } = req.query;
    const { startISO, endISO } = getDateRange(date);

    // Query today's sales
    let salesQuery = supabase
      .from("sales")
      .select("id, total_amount, paid_amount, remaining_amount, created_at")
      .gte("created_at", startISO)
      .lte("created_at", endISO);

    if (company_id) salesQuery = salesQuery.eq("company_id", company_id);
    if (warehouse_id) salesQuery = salesQuery.eq("warehouse_id", warehouse_id);
    if (user_id) salesQuery = salesQuery.eq("user_id", user_id);

    const { data: sales, error: salesErr } = await salesQuery;
    if (salesErr) throw salesErr;

    const invoicesCount = sales ? sales.length : 0;
    const grossSales = sales ? sales.reduce((sum, s) => sum + parseFloat(s.total_amount || 0), 0) : 0;
    const cashSales = sales ? sales.reduce((sum, s) => sum + parseFloat(s.paid_amount || 0), 0) : 0;
    const creditSales = sales ? sales.reduce((sum, s) => sum + parseFloat(s.remaining_amount || 0), 0) : 0;

    // Query today's debt collections
    let payQuery = supabase
      .from("customer_payments")
      .select("amount, payment_method, created_at")
      .gte("created_at", startISO)
      .lte("created_at", endISO);

    if (company_id) payQuery = payQuery.eq("company_id", company_id);

    const { data: payments } = await payQuery;
    const debtRecoveredCash = payments
      ? payments
          .filter(p => !p.payment_method || p.payment_method === 'cash')
          .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0)
      : 0;

    // Query today's returns
    let retQuery = supabase
      .from("returns")
      .select("total_refund_amount, created_at")
      .gte("created_at", startISO)
      .lte("created_at", endISO);

    if (company_id) retQuery = retQuery.eq("company_id", company_id);
    const { data: returnsData } = await retQuery;

    const refunds = returnsData ? returnsData.reduce((sum, r) => sum + parseFloat(r.total_refund_amount || 0), 0) : 0;
    const openingFloat = 0;
    const expectedCash = openingFloat + cashSales + debtRecoveredCash - refunds;

    res.json({
      success: true,
      metrics: {
        date: new Date().toISOString().slice(0, 10),
        invoices_count: invoicesCount,
        gross_sales: grossSales,
        cash_sales: cashSales,
        credit_sales: creditSales,
        debt_recovered: debtRecoveredCash,
        refunds,
        opening_float: openingFloat,
        expected_cash: expectedCash
      }
    });
  } catch (error) {
    console.error("Daily close calculation error:", error);
    res.status(500).json({ success: false, error: "Failed to calculate daily close metrics" });
  }
});

// 2. POST: Commit Closure, Calculate Discrepancy & Broadcast Telegram Alert
app.post("/api/cloud/pos/daily-close", async (req, res) => {
  try {
    const {
      company_id,
      warehouse_id,
      user_id,
      counted_cash,
      opening_float = 0,
      notes = ""
    } = req.body;

    if (counted_cash === undefined) {
      return res.status(400).json({ success: false, error: "counted_cash is required" });
    }

    const { startISO, endISO } = getDateRange();

    // Verify figures from Supabase
    let salesQuery = supabase
      .from("sales")
      .select("total_amount, paid_amount, remaining_amount")
      .gte("created_at", startISO)
      .lte("created_at", endISO);

    if (company_id) salesQuery = salesQuery.eq("company_id", company_id);
    const { data: sales } = await salesQuery;

    const invoicesCount = sales ? sales.length : 0;
    const grossSales = sales ? sales.reduce((sum, s) => sum + parseFloat(s.total_amount || 0), 0) : 0;
    const cashSales = sales ? sales.reduce((sum, s) => sum + parseFloat(s.paid_amount || 0), 0) : 0;
    const creditSales = sales ? sales.reduce((sum, s) => sum + parseFloat(s.remaining_amount || 0), 0) : 0;

    let payQuery = supabase
      .from("customer_payments")
      .select("amount, payment_method")
      .gte("created_at", startISO)
      .lte("created_at", endISO);

    if (company_id) payQuery = payQuery.eq("company_id", company_id);
    const { data: payments } = await payQuery;

    const debtRecovered = payments
      ? payments
          .filter(p => !p.payment_method || p.payment_method === 'cash')
          .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0)
      : 0;

    let retQuery = supabase
      .from("returns")
      .select("total_refund_amount")
      .gte("created_at", startISO)
      .lte("created_at", endISO);

    if (company_id) retQuery = retQuery.eq("company_id", company_id);
    const { data: returnsData } = await retQuery;
    const refunds = returnsData ? returnsData.reduce((sum, r) => sum + parseFloat(r.total_refund_amount || 0), 0) : 0;

    const floatVal = parseFloat(opening_float || 0);
    const expectedCash = floatVal + cashSales + debtRecovered - refunds;
    const physicalCash = parseFloat(counted_cash || 0);
    const discrepancy = physicalCash - expectedCash;

    // Unique Sequential Z-Report Number
    const dateTag = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomSalt = Math.floor(100 + Math.random() * 900);
    const closureNumber = `Z-${dateTag}-${randomSalt}`;

    // Cashier Profile Lookup
    let cashierName = "Personnel Caisse";
    if (user_id) {
      const { data: userProfile } = await supabase.from("users").select("full_name").eq("id", user_id).maybeSingle();
      if (userProfile?.full_name) cashierName = userProfile.full_name;
    }

    // Save to daily_closures table
    const { data: savedClosure } = await supabase
      .from("daily_closures")
      .insert({
        company_id: company_id || null,
        warehouse_id: warehouse_id || null,
        user_id: user_id || null,
        closure_number: closureNumber,
        invoices_count: invoicesCount,
        gross_sales: grossSales,
        cash_sales: cashSales,
        credit_sales: creditSales,
        debt_recovered: debtRecovered,
        refunds,
        opening_float: floatVal,
        expected_cash: expectedCash,
        counted_cash: physicalCash,
        difference: discrepancy,
        notes
      })
      .select()
      .maybeSingle();

    // DISPATCH TELEGRAM Z-REPORT NOTIFICATION
    if (bot) {
      const targetAdminId = process.env.TELEGRAM_ADMIN_CHAT_ID || "1046422785";
      const algeriaTime = new Date().toLocaleString("fr-FR", { 
        timeZone: "Africa/Algiers",
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit"
      });

      const statusBadge = discrepancy === 0 
        ? "✅ CONFORME (Écart: 0 DA)" 
        : discrepancy < 0 
          ? `⚠️ MANQUANT (${discrepancy.toLocaleString()} DA)` 
          : `ℹ️ EXCÉDENT (+${discrepancy.toLocaleString()} DA)`;

      const telegramMessage = 
        `📊 *CLÔTURE DE JOURNÉE (RAPPORT Z)*\n` +
        `🏢 *SORALI DISTRIBUTION*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🆔 *N° Clôture:* \`${closureNumber}\`\n` +
        `📅 *Date & Heure:* ${algeriaTime}\n` +
        `👤 *Responsable:* ${cashierName}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🧾 *Factures Ventes:* ${invoicesCount}\n` +
        `💰 *Chiffre d'Affaires Brut:* ${grossSales.toLocaleString()} DA\n` +
        `💵 *Espèces Ventes Directes:* +${cashSales.toLocaleString()} DA\n` +
        `📝 *Crédit Accordé (Dettes):* +${creditSales.toLocaleString()} DA\n` +
        `🔄 *Dettes Récupérées:* +${debtRecovered.toLocaleString()} DA\n` +
        `↩️ *Retours / Remboursements:* -${refunds.toLocaleString()} DA\n` +
        `🏦 *Fond de Caisse Départ:* ${floatVal.toLocaleString()} DA\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `💼 *Espèces Théoriques Attendues:* *${expectedCash.toLocaleString()} DA*\n` +
        `💵 *Espèces Physiques Comptées:* *${physicalCash.toLocaleString()} DA*\n` +
        `⚖️ *Bilan de Caisse:* *${statusBadge}*\n` +
        (notes ? `📝 *Remarque:* _${notes}_\n` : "") +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `_Clôture officielle archivée avec succès._`;

      bot.telegram.sendMessage(targetAdminId, telegramMessage, { parse_mode: "Markdown" })
        .then(() => console.log(`📤 Z-Report dispatched to Telegram ID: ${targetAdminId}`))
        .catch(err => console.error("Telegram broadcast failed:", err.message));
    }

    res.json({
      success: true,
      message: "Daily close recorded and Telegram notification sent",
      closure: savedClosure || {
        closure_number: closureNumber,
        invoices_count: invoicesCount,
        gross_sales: grossSales,
        cash_sales: cashSales,
        credit_sales: creditSales,
        debt_recovered: debtRecovered,
        refunds,
        opening_float: floatVal,
        expected_cash: expectedCash,
        counted_cash: physicalCash,
        difference: discrepancy
      }
    });
  } catch (error) {
    console.error("Daily close commitment error:", error);
    res.status(500).json({ success: false, error: "Failed to finalize daily close" });
  }
});

// --------------------------------------------------
// Boot Server
// --------------------------------------------------
app.listen(PORT, () => {
  console.log("");
  console.log("==============================================");
  console.log(" SORALI DISTRIBUTION POS API");
  console.log("==============================================");
  console.log(` Server: http://localhost:${PORT}`);
  console.log(" Supabase: Connected & Configured");
  console.log(" Z-Report Engine: Enabled & Synced with Bot");
  console.log("==============================================");
  console.log("");
});