require("dotenv").config();

const Database = require("better-sqlite3");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DB_PATH = path.join(__dirname, "..", "database", "stock_manager.db");

const COMPANY_CODE = "SORALI";
const WAREHOUSE_CODE = "MAIN";

async function main() {
  console.log("");
  console.log("==============================================");
  console.log(" SQLite → Supabase Migration");
  console.log("==============================================");

  const db = new Database(DB_PATH, { readonly: true });

  try {
    // --------------------------------------------------
    // 1. Find company
    // --------------------------------------------------

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, name, code")
      .eq("code", COMPANY_CODE)
      .single();

    if (companyError) {
      throw new Error(`Company lookup failed: ${companyError.message}`);
    }

    console.log(`Company: ${company.name}`);

    // --------------------------------------------------
    // 2. Find warehouse
    // --------------------------------------------------

    const { data: warehouse, error: warehouseError } = await supabase
      .from("warehouses")
      .select("id, name, code")
      .eq("company_id", company.id)
      .eq("code", WAREHOUSE_CODE)
      .single();

    if (warehouseError) {
      throw new Error(`Warehouse lookup failed: ${warehouseError.message}`);
    }

    console.log(`Warehouse: ${warehouse.name}`);

    // --------------------------------------------------
    // 3. Read SQLite products
    // --------------------------------------------------

    const articles = db
      .prepare(`
        SELECT
          id,
          name,
          units_per_carton,
          cartons,
          unit_price,
          carton_price,
          minimum_stock
        FROM articles
        ORDER BY id
      `)
      .all();

    console.log(`SQLite products found: ${articles.length}`);
    console.log("");

    if (articles.length === 0) {
      console.log("Nothing to migrate.");
      return;
    }

    let productsCreated = 0;
    let productsExisting = 0;
    let stockCreated = 0;
    let stockExisting = 0;

    // --------------------------------------------------
    // 4. Migrate products
    // --------------------------------------------------

    for (const article of articles) {
      console.log(`Migrating: ${article.name}`);

      // Look for an existing product with the same name
      // inside this company.
      const { data: existingProduct, error: existingError } =
        await supabase
          .from("products")
          .select(`
            id,
            name,
            units_per_carton,
            purchase_price,
            selling_price,
            minimum_stock_units,
            active
          `)
          .eq("company_id", company.id)
          .eq("name", article.name)
          .maybeSingle();

      if (existingError) {
        throw new Error(
          `Product lookup failed for "${article.name}": ${existingError.message}`
        );
      }

      let product;

      if (existingProduct) {
        console.log(`  ↳ Product already exists: ${existingProduct.id}`);
        product = existingProduct;
        productsExisting++;
      } else {
        const productPayload = {
          company_id: company.id,
          name: article.name,
          units_per_carton: article.units_per_carton,
          purchase_price: 0,
          selling_price: article.unit_price,
          minimum_stock_units:
            article.minimum_stock * article.units_per_carton,
          active: true
        };

        const { data: insertedProduct, error: productError } =
          await supabase
            .from("products")
            .insert(productPayload)
            .select()
            .single();

        if (productError) {
          throw new Error(
            `Product insert failed for "${article.name}": ${productError.message}`
          );
        }

        product = insertedProduct;
        productsCreated++;

        console.log(`  ✓ Product created: ${product.id}`);
      }

      // ------------------------------------------------
      // 5. Calculate stock in individual units
      // ------------------------------------------------

      const quantityUnits =
        article.cartons * article.units_per_carton;

      console.log(
        `  Stock: ${article.cartons} cartons × ${article.units_per_carton} units = ${quantityUnits} units`
      );

      // ------------------------------------------------
      // 6. Check existing stock record
      // ------------------------------------------------

      const { data: existingStock, error: stockLookupError } =
        await supabase
          .from("stock")
          .select("id, quantity_units")
          .eq("company_id", company.id)
          .eq("warehouse_id", warehouse.id)
          .eq("product_id", product.id)
          .maybeSingle();

      if (stockLookupError) {
        throw new Error(
          `Stock lookup failed for "${article.name}": ${stockLookupError.message}`
        );
      }

      if (existingStock) {
        console.log(
          `  ↳ Stock already exists: ${existingStock.quantity_units} units`
        );

        stockExisting++;
      } else {
        const stockPayload = {
          company_id: company.id,
          warehouse_id: warehouse.id,
          product_id: product.id,
          quantity_units: quantityUnits
        };

        const { error: stockError } = await supabase
          .from("stock")
          .insert(stockPayload);

        if (stockError) {
          throw new Error(
            `Stock insert failed for "${article.name}": ${stockError.message}`
          );
        }

        stockCreated++;

        console.log(`  ✓ Stock created: ${quantityUnits} units`);
      }

      console.log("");
    }

    // --------------------------------------------------
    // 7. Summary
    // --------------------------------------------------

    console.log("==============================================");
    console.log(" Migration completed successfully");
    console.log("==============================================");

    console.log(`Products created:  ${productsCreated}`);
    console.log(`Products existing: ${productsExisting}`);
    console.log(`Stock created:     ${stockCreated}`);
    console.log(`Stock existing:    ${stockExisting}`);

    console.log("");
    console.log("SQLite database was NOT modified.");
    console.log("==============================================");
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error("");
  console.error("❌ MIGRATION FAILED");
  console.error(error.message);
  process.exit(1);
});