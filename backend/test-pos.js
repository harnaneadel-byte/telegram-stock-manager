async function runPOSTest() {
  const companyId = "d7d6d1a9-f4db-4214-874d-d8267b3dfde5"; // SORALI DISTRIBUTION
  const warehouseId = "f465ed15-ffe9-4e75-ac8c-7fb4ad0e6672"; // Main Warehouse
  const customerId = "2f93d38a-e849-4684-898b-beff19508e81"; // Supermarket El-Amine
  const userId = "1e495e0a-e468-4bba-a989-576321ae74a1"; // Admin User
  const productId = "75ceef90-05b0-4c5e-b086-34f00019e5df"; // Vatika Jasmine Shampoo

  console.log("--- 1. Resolving Automatic Customer Discount ---");
  const discRes = await fetch(`http://localhost:3001/api/cloud/pos/discount?company_id=${companyId}&customer_id=${customerId}&product_id=${productId}`);
  const discData = await discRes.json();
  console.log("Resolved Discount:", discData); // Should pick up the 8% product-specific custom discount!

  const appliedDiscount = discData.discount_percent || 0;
  const unitPrice = 450; // Selling price
  const quantity = 48; // 2 cartons (48 units)

  console.log(`\n--- 2. Executing POS Checkout (Buying ${quantity} units with ${appliedDiscount}% discount) ---`);
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
          amount: 10000 // Partial cash payment out of the total, leaving the remainder on credit
        }
      ],
      notes: "Wholesale POS order for Supermarket El-Amine"
    })
  });

  const checkoutData = await checkoutRes.json();
  console.log("Checkout Result:", checkoutData);
}

runPOSTest();