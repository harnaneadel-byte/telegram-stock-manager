async function runProductTest() {
  const companyId = "d7d6d1a9-f4db-4214-874d-d8267b3dfde5"; // SORALI DISTRIBUTION
  const warehouseId = "f465ed15-ffe9-4e75-ac8c-7fb4ad0e6672"; // Main Warehouse

  console.log("--- 1. Fetching Full Product & Stock Catalog ---");
  const catalogRes = await fetch(`http://localhost:3001/api/cloud/products?company_id=${companyId}&warehouse_id=${warehouseId}`);
  const catalog = await catalogRes.json();
  console.log("Catalog Products Found:", catalog.products ? catalog.products.length : 0);
  if (catalog.products && catalog.products.length > 0) {
    console.log("Sample Product:", catalog.products[0].product_name, `(${catalog.products[0].cartons} cartons, ${catalog.products[0].quantity_units} units)`);
  }

  console.log("\n--- 2. Adding a New Product (Vatika Jasmine 180ml) ---");
  const addRes = await fetch("http://localhost:3001/api/cloud/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company_id: companyId,
      warehouse_id: warehouseId,
      name: "Vatika Shampoo Jasmine 180ml",
      barcode: "6291100123456",
      units_per_carton: 24,
      purchase_price: 400,
      selling_price: 450,
      minimum_stock_units: 48, // 2 cartons
      initial_cartons: 10      // Starts with 10 cartons (240 units)
    })
  });
  const addData = await addRes.json();
  console.log("Add Product Response:", addData);

  console.log("\n--- 3. Testing Barcode Scanner Lookup ---");
  const barcodeRes = await fetch(`http://localhost:3001/api/cloud/products/barcode/6291100123456?company_id=${companyId}&warehouse_id=${warehouseId}`);
  const barcodeData = await barcodeRes.json();
  console.log("Barcode Lookup Result:", barcodeData);
}

runProductTest();