async function runStockOpsTest() {
  const companyId = "d7d6d1a9-f4db-4214-874d-d8267b3dfde5"; // SORALI DISTRIBUTION
  const warehouseId = "f465ed15-ffe9-4e75-ac8c-7fb4ad0e6672"; // Main Warehouse
  const userId = "1e495e0a-e468-4bba-a989-576321ae74a1"; // Admin User ID
  const productId = "75ceef90-05b0-4c5e-b086-34f00019e5df"; // Vatika Jasmine ID from previous step

  console.log("--- 1. Testing Stock Entry (Adding 2 cartons / 48 units) ---");
  const entryRes = await fetch("http://localhost:3001/api/cloud/stock/entry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company_id: companyId,
      warehouse_id: warehouseId,
      product_id: productId,
      quantity_units: 48,
      user_id: userId,
      note: "Supplier delivery - Jasmine batch #2"
    })
  });
  console.log("Stock Entry Response:", await entryRes.json());

  console.log("\n--- 2. Testing Damaged Stock Removal (Removing 12 units) ---");
  const damageRes = await fetch("http://localhost:3001/api/cloud/stock/damage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company_id: companyId,
      warehouse_id: warehouseId,
      product_id: productId,
      quantity_units: 12,
      user_id: userId,
      note: "Leaking bottles discovered in storage"
    })
  });
  console.log("Damage Removal Response:", await damageRes.json());

  console.log("\n--- 3. Fetching Movement Audit Trail ---");
  const movementsRes = await fetch(`http://localhost:3001/api/cloud/stock/movements?company_id=${companyId}&product_id=${productId}`);
  const movementsData = await movementsRes.json();
  console.log("Recent Movements for Jasmine Shampoo:", movementsData.movements);
}

runStockOpsTest();