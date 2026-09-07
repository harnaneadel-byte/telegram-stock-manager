async function runCustomerTest() {
  const companyId = "d7d6d1a9-f4db-4214-874d-d8267b3dfde5"; // SORALI DISTRIBUTION
  const productId = "75ceef90-05b0-4c5e-b086-34f00019e5df"; // Vatika Jasmine Shampoo ID

  console.log("--- 1. Creating a Wholesale Customer (Supermarket El-Amine) ---");
  const custRes = await fetch("http://localhost:3001/api/cloud/customers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company_id: companyId,
      name: "Supermarket El-Amine",
      phone: "+213 555 12 34 56",
      address: "Main Avenue, Oum El Bouaghi",
      default_discount_percent: 5.0, // Standard 5% general discount
      credit_limit: 250000.0         // 250,000 DA credit limit
    })
  });
  const custData = await custRes.json();
  console.log("Customer Creation Response:", custData);

  if (custData.success && custData.customer) {
    const customerId = custData.customer.id;

    console.log("\n--- 2. Setting Special Custom Discount (8% for Jasmine Shampoo) ---");
    const discRes = await fetch("http://localhost:3001/api/cloud/customers/discounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_id: companyId,
        customer_id: customerId,
        product_id: productId,
        discount_percent: 8.0 // 8% specifically on this shampoo item
      })
    });
    console.log("Custom Discount Response:", await discRes.json());
  }

  console.log("\n--- 3. Fetching Customer Ledger & Balances List ---");
  const listRes = await fetch(`http://localhost:3001/api/cloud/customers?company_id=${companyId}`);
  const listData = await listRes.json();
  console.log("Customers Catalog:", listData.customers);
}

runCustomerTest();