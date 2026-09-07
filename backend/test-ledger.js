async function runLedgerTest() {
  const companyId = "d7d6d1a9-f4db-4214-874d-d8267b3dfde5"; // SORALI DISTRIBUTION
  const warehouseId = "f465ed15-ffe9-4e75-ac8c-7fb4ad0e6672"; // Main Warehouse
  const customerId = "2f93d38a-e849-4684-898b-beff19508e81"; // Supermarket El-Amine
  const userId = "1e495e0a-e468-4bba-a989-576321ae74a1"; // Admin User
  const productId = "75ceef90-05b0-4c5e-b086-34f00019e5df"; // Vatika Jasmine Shampoo

  console.log("--- 1. Resolving Automatic Customer Discount ---");
  const discRes = await fetch(`http://localhost:3001/api/cloud/pos/discount?company_id=${companyId}&customer_id=${customerId}&product_id=${productId}`);
  const discData = await discRes.json();
  console.log("Resolved Discount:", discData); // Should correctly return 8% custom discount

  const appliedDiscount = discData.discount_percent || 0;
  const unitPrice = 450;
  const quantity = 48; // 2 cartons (48 units) -> Total line value = 48 * 450 = 21,600 DA minus 8% = 19,872 DA

  console.log(`\n--- 2. Executing POS Checkout with Partial Payment ---`);
  const checkoutRes = await fetch("http://localhost:3001/api/cloud/pos/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company_id: companyId,
      warehouse_id: warehouseId,
      customer_id: customerId,
      user_id: userId,
      items: [
        {
          product_id: productId,
          quantity_units: quantity,
          unit_price: unitPrice,
          discount_percent: appliedDiscount
        }
      ],
      payments: [
        {
          method: "cash",
          amount: 5000 // Paying only 5,000 DA cash, leaving the remaining balance as store credit debt
        }
      ],
      notes: "Wholesale order with partial payment"
    })
  });

  const checkoutData = await checkoutRes.json();
  console.log("Checkout Result:", checkoutData);

  console.log("\n--- 3. Fetching Customer Ledger Statement & Balance ---");
  const ledgerRes = await fetch(`http://localhost:3001/api/cloud/customers/${customerId}/ledger`);
  const ledgerData = await ledgerRes.json();
  console.log("Customer Ledger Statement:", JSON.stringify(ledgerData, null, 2));

  if (ledgerData.success && ledgerData.invoices.length > 0) {
    const latestInvoiceId = ledgerData.invoices[0].id;
    
    console.log("\n--- 4. Recording a Subsequent Payment Against the Debt ---");
    const payRes = await fetch("http://localhost:3001/api/cloud/customers/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_id: companyId,
        customer_id: customerId,
        sale_id: latestInvoiceId,
        user_id: userId,
        payment_method: "bank_transfer",
        amount: 5000, // Paying another 5,000 DA via bank transfer
        notes: "Second installment payment"
      })
    });
    console.log("Payment Result:", await payRes.json());

    console.log("\n--- 5. Fetching Updated Ledger Balance ---");
    const updatedLedgerRes = await fetch(`http://localhost:3001/api/cloud/customers/${customerId}/ledger`);
    const updatedLedgerData = await updatedLedgerRes.json();
    console.log("Updated Balance:", updatedLedgerData.customer.balance);
  }
}

runLedgerTest();