async function runReportsTest() {
  const companyId = "d7d6d1a9-f4db-4214-874d-d8267b3dfde5"; // SORALI DISTRIBUTION
  const warehouseId = "f465ed15-ffe9-4e75-ac8c-7fb4ad0e6672"; // Main Warehouse

  console.log("--- 1. Fetching Executive Dashboard Summary ---");
  const summaryRes = await fetch(`http://localhost:3001/api/cloud/reports/summary?company_id=${companyId}&warehouse_id=${warehouseId}`);
  const summaryData = await summaryRes.json();
  console.log("Dashboard Summary:", JSON.stringify(summaryData, null, 2));

  console.log("\n--- 2. Fetching Low Stock Alerts ---");
  const lowStockRes = await fetch(`http://localhost:3001/api/cloud/reports/low-stock?company_id=${companyId}&warehouse_id=${warehouseId}`);
  const lowStockData = await lowStockRes.json();
  console.log("Low Stock Products:", lowStockData.low_stock_products);

  console.log("\n--- 3. Fetching Outstanding Customer Debtors Report ---");
  const debtorRes = await fetch(`http://localhost:3001/api/cloud/reports/customer-debts?company_id=${companyId}`);
  const debtorData = await debtorRes.json();
  console.log("Debtors Summary:", debtorData.debtors);
}

runReportsTest();