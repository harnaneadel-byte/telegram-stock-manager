async function runReturnTest() {
  const companyId = "d7d6d1a9-f4db-4214-874d-d8267b3dfde5"; // SORALI DISTRIBUTION
  const warehouseId = "f465ed15-ffe9-4e75-ac8c-7fb4ad0e6672"; // Main Warehouse
  const customerId = "2f93d38a-e849-4684-898b-beff19508e81"; // Supermarket El-Amine
  const userId = "1e495e0a-e468-4bba-a989-576321ae74a1"; // Admin User
  const productId = "75ceef90-05b0-4c5e-b086-34f00019e5df"; // Vatika Jasmine Shampoo

  console.log("--- 1. Fetching Customer Ledger to Locate a Recent Sale Item ---");
  const ledgerRes = await fetch(`http://localhost:3001/api/cloud/customers/${customerId}/ledger`);
  const ledgerData = await ledgerRes.json();
  
  if (!ledgerData.success || ledgerData.invoices.length === 0) {
    console.error("No invoices found to return against!");
    return;
  }

  const latestInvoice = ledgerData.invoices[0];
  console.log(`Targeting Invoice: ${latestInvoice.invoice_number} (ID: ${latestInvoice.id})`);

  // We need a sale_item_id. Let's fetch the sale items from Supabase or via a quick query if needed, 
  // but for the test script we can fetch the sale details or pass a mock item structure.
  // Let's create a dedicated helper query or fetch sale items directly:
  const saleItemsRes = await fetch(`http://localhost:3001/api/cloud/products?company_id=${companyId}&warehouse_id=${warehouseId}`);
  // (Alternatively, let's process the return using the sale ID and product ID)
  
  console.log("\n--- 2. Processing Customer Return (Returning 4 units in 'good' condition) ---");
  const returnRes = await fetch("http://localhost:3001/api/cloud/returns/customer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company_id: companyId,
      warehouse_id: warehouseId,
      customer_id: customerId,
      sale_id: latestInvoice.id,
      user_id: userId,
      items: [
        {
          sale_item_id: "00000000-0000-0000-0000-000000000000", // Will map or process via product fallback if needed
          product_id: productId,
          quantity_units: 4, // Returning 4 units
          unit_price: 450,
          condition: "good"   // Should restore back to inventory stock!
        }
      ],
      notes: "Customer over-ordered, returning 4 units in pristine condition"
    })
  });

  const returnData = await returnRes.json();
  console.log("Customer Return Result:", returnData);

  console.log("\n--- 3. Fetching Updated Customer Ledger Balance ---");
  const updatedLedgerRes = await fetch(`http://localhost:3001/api/cloud/customers/${customerId}/ledger`);
  const updatedLedgerData = await updatedLedgerRes.json();
  console.log("Updated Customer Balance after Return:", updatedLedgerData.customer.balance);
}

runReturnTest();