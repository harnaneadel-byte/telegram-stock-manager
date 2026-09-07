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
// --------------------------------------------------
// CLOUD: Create Sale (Atomic POS Transaction)
// --------------------------------------------------
app.post("/api/cloud/sales", async (req, res) => {
  try {
    const {
      company_id,
      warehouse_id,
      customer_id,
      user_id,
      invoice_number,
      items,
      payments,
      notes
    } = req.body;

    const { data, error } = await supabase.rpc("create_sale", {
      p_company_id: company_id,
      p_warehouse_id: warehouse_id,
      p_customer_id: customer_id,
      p_user_id: user_id,
      p_invoice_number: invoice_number,
      p_items: items,
      p_payments: payments,
      p_notes: notes
    });

    if (error) {
      console.error("Supabase create_sale error:", error);
      return res.status(400).json({ success: false, error: error.message });
    }

    res.json({ success: true, sale_id: data });
  } catch (error) {
    console.error("Cloud sales error:", error);
    res.status(500).json({ success: false, error: "Failed to process sale transaction" });
  }
});
// ============================================================
// PHASE 2: AUTHENTICATION & USER MANAGEMENT API
// ============================================================

// 1. Identify current user permissions by Telegram ID
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

// 2. List all users for the company
app.get("/api/cloud/users", async (req, res) => {
  try {
    const { company_id } = req.query;
    if (!company_id) {
      return res.status(400).json({ success: false, error: "company_id parameter is required" });
    }

    const { data: users, error } = await supabase
      .from("users")
      .select("id, telegram_id, username, full_name, role, active, created_at")
      .eq("company_id", company_id)
      .order("created_at", { ascending: true });

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch users" });
  }
});

// 3. Add or update employee account
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

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to save user account" });
  }
});

// 4. Update user role or status (Activate / Deactivate)
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

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to update user status" });
  }
});
// ============================================================
// PHASE 3: PRODUCTS & BARCODES API
// ============================================================

// 1. Get all products with stock and carton calculation view
app.get("/api/cloud/products", async (req, res) => {
  try {
    const { company_id, warehouse_id } = req.query;
    if (!company_id) {
      return res.status(400).json({ success: false, error: "company_id is required" });
    }

    // Query the database view we created in Migration 001 that calculates cartons automatically
    let query = supabase
      .from("stock_with_cartons")
      .select("*")
      .eq("company_id", company_id);

    if (warehouse_id) {
      query = query.eq("warehouse_id", warehouse_id);
    }

    const { data: products, error } = await query.order("product_name");

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to load products catalogue" });
  }
});

// 2. Find product by barcode (Primary or Multi-barcode lookup for POS scanning)
app.get("/api/cloud/products/barcode/:barcode", async (req, res) => {
  try {
    const { barcode } = req.params;
    const { company_id, warehouse_id } = req.query;

    if (!company_id || !warehouse_id) {
      return res.status(400).json({ success: false, error: "company_id and warehouse_id are required" });
    }

    // Check primary product barcode first
    let { data: product, error } = await supabase
      .from("stock_with_cartons")
      .select("*")
      .eq("company_id", company_id)
      .eq("warehouse_id", warehouse_id)
      .eq("barcode", barcode)
      .maybeSingle();

    // If not found in primary barcodes, check secondary product_barcodes table
    if (!product) {
      const { data: barcodeMapping } = await supabase
        .from("product_barcodes")
        .select("product_id")
        .eq("barcode", barcode)
        .maybeSingle();

      if (barcodeMapping) {
        const { data: secondaryProduct } = await supabase
          .from("stock_with_cartons")
          .select("*")
          .eq("product_id", barcodeMapping.product_id)
          .eq("warehouse_id", warehouse_id)
          .maybeSingle();
        product = secondaryProduct;
      }
    }

    if (!product) {
      return res.status(404).json({ success: false, error: "Product not found for barcode: " + barcode });
    }

    res.json({ success: true, product });
  } catch (error) {
    res.status(500).json({ success: false, error: "Barcode lookup failed" });
  }
});

// 3. Create or Update a Product Catalogue Item
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

    // Insert product record
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

    if (prodError) {
      return res.status(400).json({ success: false, error: prodError.message });
    }

    // If a warehouse ID and opening stock were provided, initialize the stock record
    if (warehouse_id && initial_cartons !== undefined) {
      const totalUnits = parseInt(initial_cartons) * parseInt(units_per_carton);
      await supabase.from("stock").upsert({
        company_id,
        warehouse_id,
        product_id: product.id,
        quantity_units: totalUnits
      }, { onConflict: "warehouse_id,product_id" });
    }

    res.json({ success: true, product });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to create product" });
  }
});

// 4. Attach secondary/alternative barcode to a product
app.post("/api/cloud/products/:id/barcodes", async (req, res) => {
  try {
    const { id } = req.params;
    const { barcode, is_primary } = req.body;

    if (!barcode) {
      return res.status(400).json({ success: false, error: "barcode is required" });
    }

    const { data, error } = await supabase
      .from("product_barcodes")
      .insert({
        product_id: id,
        barcode,
        is_primary: is_primary || false
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    res.json({ success: true, barcode: data });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to attach barcode" });
  }
});
// ============================================================
// PHASE 4: WAREHOUSES & STOCK OPERATIONS API
// ============================================================

// 1. Record Stock Entry (Purchases / Deliveries)
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

    if (error) return res.status(400).json({ success: false, error: error.message });
    res.json({ success: true, result: data[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to process stock entry" });
  }
});

// 2. Record Damaged or Expired Stock Removal
app.post("/api/cloud/stock/damage", async (req, res) => {
  try {
    const { company_id, warehouse_id, product_id, quantity_units, user_id, note } = req.body;
    
    const { data, error } = await supabase.rpc("stock_damage", {
      p_company_id: company_id,
      p_warehouse_id: warehouse_id,
      p_product_id: product_id,
      p_quantity_units: parseInt(quantity_units),
      p_user_id: user_id,
      p_note: note || "Damaged/expired goods removal"
    });

    if (error) return res.status(400).json({ success: false, error: error.message });
    res.json({ success: true, result: data[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to process damaged stock" });
  }
});

// 3. Record Physical Stocktake Adjustment
app.post("/api/cloud/stock/adjust", async (req, res) => {
  try {
    const { company_id, warehouse_id, product_id, new_quantity_units, user_id, note } = req.body;
    
    const { data, error } = await supabase.rpc("stock_adjust", {
      p_company_id: company_id,
      p_warehouse_id: warehouse_id,
      p_product_id: product_id,
      p_new_quantity_units: parseInt(new_quantity_units),
      p_user_id: user_id,
      p_note: note || "Physical inventory count adjustment"
    });

    if (error) return res.status(400).json({ success: false, error: error.message });
    res.json({ success: true, result: data[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to adjust physical stock" });
  }
});

// 4. View Immutable Stock Movement Audit Trail
app.get("/api/cloud/stock/movements", async (req, res) => {
  try {
    const { company_id, product_id, limit } = req.query;
    if (!company_id) {
      return res.status(400).json({ success: false, error: "company_id is required" });
    }

    let query = supabase
      .from("stock_movements")
      .select(`
        id,
        movement_type,
        quantity_units,
        quantity_before,
        quantity_after,
        note,
        created_at,
        products (name),
        users (full_name)
      `)
      .eq("company_id", company_id)
      .order("created_at", { ascending: false })
      .limit(parseInt(limit || 20));

    if (product_id) {
      query = query.eq("product_id", product_id);
    }

    const { data: movements, error } = await query;

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, movements });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch stock movement audit history" });
  }
});
// ============================================================
// PHASE 5: CUSTOMERS & DISCOUNTS API
// ============================================================

// 1. Get all customers with their current account balance
// 1. Get complete invoice and payment statement for a specific customer
app.get("/api/cloud/customers/:id/ledger", async (req, res) => {
  try {
    const { id } = req.params;

    // Get customer profile and balance
    const { data: customer, error: custErr } = await supabase
      .from("customer_balances")
      .select("*")
      .eq("customer_id", id)
      .single();

    if (custErr) return res.status(404).json({ success: false, error: "Customer not found" });

    // Get all sales invoices for this customer matching your exact table columns
    const { data: sales, error: salesErr } = await supabase
      .from("sales")
      .select("id, invoice_number, subtotal, discount_amount, total_amount, paid_amount, remaining_amount, created_at")
      .eq("customer_id", id)
      .order("created_at", { ascending: false });

    if (salesErr) return res.status(500).json({ success: false, error: salesErr.message });

    // Get all subsequent customer cash/bank payments made against credit
    const { data: payments, error: payErr } = await supabase
      .from("customer_payments")
      .select("*")
      .eq("customer_id", id)
      .order("created_at", { ascending: false });

    if (payErr) return res.status(500).json({ success: false, error: payErr.message });

    res.json({ 
      success: true, 
      customer, 
      invoices: sales, 
      payments 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to load customer ledger statement" });
  }
});

// 2. Create or Update a Customer Profile
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
        active: true
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    res.json({ success: true, customer });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to create customer" });
  }
});

// 3. Set a Product-Specific Custom Discount for a Customer
app.post("/api/cloud/customers/discounts", async (req, res) => {
  try {
    const { company_id, customer_id, product_id, discount_percent } = req.body;

    if (!company_id || !customer_id || !product_id || discount_percent === undefined) {
      return res.status(400).json({ 
        success: false, 
        error: "company_id, customer_id, product_id, and discount_percent are required" 
      });
    }

    const { data, error } = await supabase
      .from("customer_discounts")
      .upsert({
        company_id,
        customer_id,
        product_id,
        discount_percent: parseFloat(discount_percent)
      }, { onConflict: "customer_id,product_id" })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    res.json({ success: true, discount: data });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to set custom customer discount" });
  }
});
// ============================================================
// PHASE 6: POS & CHECKOUT API
// ============================================================

// 1. Resolve Best Applicable Discount for a Customer on a Product
// 1. Resolve Best Applicable Discount for a Customer on a Product
app.get("/api/cloud/pos/discount", async (req, res) => {
  try {
    const { company_id, customer_id, product_id } = req.query;
    if (!company_id || !customer_id || !product_id) {
      return res.status(400).json({ success: false, error: "company_id, customer_id, and product_id are required" });
    }

    // Check if there is a custom product-specific discount first
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

    // Otherwise, fall back to customer's default discount
    const { data: customer, error: custError } = await supabase
      .from("customers")
      .select("default_discount_percent")
      .eq("id", customer_id)
      .maybeSingle();

    if (custError) {
      return res.status(500).json({ success: false, error: custError.message });
    }

    res.json({ 
      success: true, 
      discount_percent: customer ? customer.default_discount_percent : 0, 
      source: "customer_default" 
    });
  } catch (error) {
    console.error("Discount lookup crash error:", error);
    res.status(500).json({ success: false, error: "Failed to resolve discount" });
  }
});

// 2. Complete POS Checkout Transaction (Wraps our atomic create_sale function)
app.post("/api/cloud/pos/checkout", async (req, res) => {
  try {
    const {
      company_id,
      warehouse_id,
      customer_id,
      user_id,
      items,      // Array of items: [{ product_id, quantity_units, unit_price, discount_percent }]
      payments,   // Array of payments: [{ method: 'cash'|'bank_transfer'|'other', amount }]
      notes
    } = req.body;

    if (!company_id || !warehouse_id || !user_id || !items || items.length === 0) {
      return res.status(400).json({ success: false, error: "Missing required checkout parameters or empty cart" });
    }

    // Generate unique sequential-style invoice number
    const invoiceNumber = `INV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

    // Call our robust atomic PostgreSQL transaction function created earlier
    const { data: saleId, error } = await supabase.rpc("create_sale", {
      p_company_id: company_id,
      p_warehouse_id: warehouse_id,
      p_customer_id: customer_id || null,
      p_user_id: user_id,
      p_invoice_number: invoiceNumber,
      p_items: items,
      p_payments: payments || [],
      p_notes: notes || "POS Checkout Transaction"
    });

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    // Fetch the generated sale invoice summary to return to the POS screen/Telegram
    const { data: invoice } = await supabase
      .from("sales")
      .select("id, invoice_number, subtotal, discount_total, total_amount, paid_amount, remaining_amount, payment_status, created_at")
      .eq("id", saleId)
      .single();

    res.json({ success: true, message: "Checkout completed successfully", invoice });
  } catch (error) {
    res.status(500).json({ success: false, error: "POS checkout failed due to server error" });
  }
});
// ============================================================
// PHASE 7: CREDIT & CUSTOMER LEDGER API
// ============================================================

// 1. Get complete invoice and payment statement for a specific customer
app.get("/api/cloud/customers/:id/ledger", async (req, res) => {
  try {
    const { id } = req.params;

    // Get customer profile and balance
    const { data: customer, error: custErr } = await supabase
      .from("customer_balances")
      .select("*")
      .eq("customer_id", id)
      .single();

    if (custErr) return res.status(404).json({ success: false, error: "Customer not found" });

    // Get all sales invoices for this customer
    const { data: sales, error: salesErr } = await supabase
      .from("sales")
      .select("id, invoice_number, total_amount, paid_amount, remaining_amount, payment_status, created_at")
      .eq("customer_id", id)
      .order("created_at", { ascending: false });

    if (salesErr) return res.status(500).json({ success: false, error: salesErr.message });

    // Get all subsequent customer cash/bank payments made against credit
    const { data: payments, error: payErr } = await supabase
      .from("customer_payments")
      .select("*")
      .eq("customer_id", id)
      .order("created_at", { ascending: false });

    if (payErr) return res.status(500).json({ success: false, error: payErr.message });

    res.json({ 
      success: true, 
      customer, 
      invoices: sales, 
      payments 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to load customer ledger statement" });
  }
});

// 2. Record a payment made later by a customer against their debt balance
app.post("/api/cloud/customers/payments", async (req, res) => {
  try {
    const { company_id, customer_id, sale_id, user_id, payment_method, amount, notes } = req.body;

    if (!company_id || !customer_id || !user_id || !amount) {
      return res.status(400).json({ success: false, error: "company_id, customer_id, user_id, and amount are required" });
    }

    const payAmount = parseFloat(amount);
    if (payAmount <= 0) {
      return res.status(400).json({ success: false, error: "Payment amount must be greater than zero" });
    }

    // Insert into customer_payments record
    const { data: payment, error: payError } = await supabase
      .from("customer_payments")
      .insert({
        company_id,
        customer_id,
        sale_id: sale_id || null,
        user_id,
        payment_method: payment_method || "cash",
        amount: payAmount,
        notes: notes || "Customer account payment"
      })
      .select()
      .single();

    if (payError) return res.status(400).json({ success: false, error: payError.message });

    // If a specific sale_id was targeted, update that sale's paid and remaining amounts
    if (sale_id) {
      const { data: sale } = await supabase
        .from("sales")
        .select("total_amount, paid_amount")
        .eq("id", sale_id)
        .single();

      if (sale) {
        const newPaid = parseFloat(sale.paid_amount) + payAmount;
        const newRemaining = Math.max(0, parseFloat(sale.total_amount) - newPaid);
        const newStatus = newRemaining === 0 ? "paid" : "partial";

        await supabase
          .from("sales")
          .update({
            paid_amount: newPaid,
            remaining_amount: newRemaining,
            payment_status: newStatus
          })
          .eq("id", sale_id);
      }
    }

    res.json({ success: true, payment });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to process customer payment" });
  }
});
// ============================================================
// PHASE 8: RETURNS ENGINE API
// ============================================================

// 1. Process a Customer Return (Partial or Full Line Item Return)
app.post("/api/cloud/returns/customer", async (req, res) => {
  try {
    const { company_id, warehouse_id, customer_id, sale_id, user_id, items, notes } = req.body;

    if (!company_id || !warehouse_id || !sale_id || !user_id || !items || items.length === 0) {
      return res.status(400).json({ success: false, error: "Missing required return parameters or items" });
    }

    const returnNumber = `RET-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    let totalRefundAmount = 0;

    // Create the main return record including the required return_type constraint
    const { data: retRecord, error: retError } = await supabase
      .from("returns")
      .insert({
        company_id,
        warehouse_id,
        customer_id: customer_id || null,
        sale_id,
        user_id,
        return_number: returnNumber,
        return_type: "customer",
        notes: notes || "Customer return processing"
      })
      .select()
      .single();

    if (retError) return res.status(400).json({ success: false, error: retError.message });

    // Process each returned item and restore stock based on condition
    for (const item of items) {
      const { sale_item_id, product_id, quantity_units, unit_price, condition } = item;
      const qty = parseInt(quantity_units);
      const itemCondition = condition || "good"; // 'good', 'damaged', or 'expired'
      const refundVal = qty * parseFloat(unit_price);
      totalRefundAmount += refundVal;

      // Insert return item record
      await supabase.from("return_items").insert({
        return_id: retRecord.id,
        sale_item_id: sale_item_id || null,
        product_id,
        quantity_units: qty,
        refund_amount: refundVal,
        condition: itemCondition
      });

      // If condition is 'good', put it back into sellable inventory using our stock_customer_return function
      if (itemCondition === "good") {
        await supabase.rpc("stock_customer_return", {
          p_company_id: company_id,
          p_warehouse_id: warehouse_id,
          p_product_id: product_id,
          p_quantity_units: qty,
          p_user_id: user_id,
          p_note: `Return for invoice reference ${returnNumber}`
        });
      } else {
        // If damaged or expired, route it directly to damage logs
        await supabase.rpc("stock_damage", {
          p_company_id: company_id,
          p_warehouse_id: warehouse_id,
          p_product_id: product_id,
          p_quantity_units: qty,
          p_user_id: user_id,
          p_note: `Returned defective/expired goods (${itemCondition})`
        });
      }
    }

    // Update the return record with total refund value
    await supabase
      .from("returns")
      .update({ total_refund_amount: totalRefundAmount })
      .eq("id", retRecord.id);

    // Reduce the customer's outstanding remaining debt
    const { data: sale } = await supabase
      .from("sales")
      .select("remaining_amount, total_amount")
      .eq("id", sale_id)
      .single();

    if (sale) {
      const newRemaining = Math.max(0, parseFloat(sale.remaining_amount) - totalRefundAmount);
      await supabase
        .from("sales")
        .update({ 
          remaining_amount: newRemaining
        })
        .eq("id", sale_id);
    }

    res.json({ 
      success: true, 
      message: "Customer return processed successfully", 
      return_id: retRecord.id, 
      return_number: returnNumber, 
      total_refund_amount: totalRefundAmount 
    });
  } catch (error) {
    console.error("Customer return error:", error);
    res.status(500).json({ success: false, error: "Failed to process customer return" });
  }
});
// ============================================================
// PHASE 9: REPORTS & ANALYTICS API
// ============================================================

// 1. Executive Summary / Dashboard Metrics
app.get("/api/cloud/reports/summary", async (req, res) => {
  try {
    const { company_id, warehouse_id } = req.query;
    if (!company_id) {
      return res.status(400).json({ success: false, error: "company_id is required" });
    }

    // Total Products & Low Stock Items
    let stockQuery = supabase.from("stock_with_cartons").select("*").eq("company_id", company_id);
    if (warehouse_id) stockQuery = stockQuery.eq("warehouse_id", warehouse_id);
    const { data: stockItems } = await stockQuery;

    const totalProducts = stockItems ? stockItems.length : 0;
    const lowStockItems = stockItems ? stockItems.filter(i => i.low_stock).length : 0;
    const totalUnitsInStock = stockItems ? stockItems.reduce((acc, item) => acc + item.quantity_units, 0) : 0;

    // Total Sales & Revenue Metrics
    const { data: sales } = await supabase
      .from("sales")
      .select("total_amount, paid_amount, remaining_amount, created_at")
      .eq("company_id", company_id);

    const totalInvoices = sales ? sales.length : 0;
    const totalRevenue = sales ? sales.reduce((acc, s) => acc + parseFloat(s.total_amount), 0) : 0;
    const totalOutstandingDebt = sales ? sales.reduce((acc, s) => acc + parseFloat(s.remaining_amount), 0) : 0;

    // Total Gross Profit Calculation using line items
    const { data: saleItems } = await supabase
      .from("sale_items")
      .select("quantity_units, final_unit_price, purchase_price, sales!inner(company_id)")
      .eq("sales.company_id", company_id);

    let grossProfit = 0;
    if (saleItems) {
      saleItems.forEach(item => {
        const revenue = item.quantity_units * parseFloat(item.final_unit_price);
        const cost = item.quantity_units * parseFloat(item.purchase_price || 0);
        grossProfit += (revenue - cost);
      });
    }

    res.json({
      success: true,
      summary: {
        total_products: totalProducts,
        total_units_in_stock: totalUnitsInStock,
        low_stock_alerts: lowStockItems,
        total_invoices: totalInvoices,
        total_revenue: totalRevenue,
        total_outstanding_debt: totalOutstandingDebt,
        gross_profit: grossProfit
      }
    });
  } catch (error) {
    console.error("Reports summary error:", error);
    res.status(500).json({ success: false, error: "Failed to generate reports summary" });
  }
});

// 2. Low Stock Alerts Report
app.get("/api/cloud/reports/low-stock", async (req, res) => {
  try {
    const { company_id, warehouse_id } = req.query;
    if (!company_id) {
      return res.status(400).json({ success: false, error: "company_id is required" });
    }

    let query = supabase
      .from("stock_with_cartons")
      .select("*")
      .eq("company_id", company_id)
      .eq("low_stock", true);

    if (warehouse_id) query = query.eq("warehouse_id", warehouse_id);

    const { data: lowStockProducts, error } = await query;

    if (error) return res.status(500).json({ success: false, error: error.message });

    res.json({ success: true, low_stock_products: lowStockProducts });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch low stock report" });
  }
});

// 3. Customer Debt Summary Report
app.get("/api/cloud/reports/customer-debts", async (req, res) => {
  try {
    const { company_id } = req.query;
    if (!company_id) {
      return res.status(400).json({ success: false, error: "company_id is required" });
    }

    const { data: debtors, error } = await supabase
      .from("customer_balances")
      .select("*")
      .eq("company_id", company_id)
      .gt("balance", 0)
      .order("balance", { ascending: false });

    if (error) return res.status(500).json({ success: false, error: error.message });

    res.json({ success: true, debtors });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch customer debt report" });
  }
});
// ============================================================
// PHASE 10: TELEGRAM BOT & MINI APP INTEGRATION
// ============================================================
const { Telegraf } = require("telegraf");

if (process.env.TELEGRAM_BOT_TOKEN) {
  const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

  // When user sends /start
  bot.start(async (ctx) => {
    const telegramId = ctx.from.id;
    const fullName = `${ctx.from.first_name || ""} ${ctx.from.last_name || ""}`.trim();

    // Check if user exists in our database
    const { data: user } = await supabase
      .from("users")
      .select("role, active")
      .eq("telegram_id", String(telegramId))
      .maybeSingle();

    if (!user || !user.active) {
      return ctx.reply(
        `Welcome ${fullName} to SORALI DISTRIBUTION POS.\n\n` +
        `❌ Your Telegram account (${telegramId}) is not registered or is inactive. Please contact your administrator.`
      );
    }

    // Send welcome message with a Web App button linking to your Mini App interface
    // (For local testing, this can point to your local React Vite dev server or a deployed public URL)
    await ctx.reply(
      `📦 Welcome to **SORALI DISTRIBUTION POS**\n\n` +
      `Logged in as: *${user.role.toUpperCase()}*\n` +
      `Tap the button below to open the mobile stock & POS management dashboard:`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🚀 Open POS Dashboard",
                web_app: { url: "https://telegram-stock-manager.vercel.app/" } // // Updated to Vercel URL
              }
            ]
          ]
        }
      }
    );
  });

  // Launch the bot safely
  bot.launch().then(() => {
    console.log("🤖 Telegram Bot is active and listening for commands!");
  }).catch(err => {
    console.error("Telegram bot launch error:", err);
  });

  // Enable graceful stop
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}
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