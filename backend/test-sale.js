async function runTest() {
  const payload = {
    company_id: "d7d6d1a9-f4db-4214-874d-d8267b3dfde5",
    warehouse_id: "f465ed15-ffe9-4e75-ac8c-7fb4ad0e6672",
    customer_id: null, // Walk-in customer
    user_id: "1e495e0a-e468-4bba-a989-576321ae74a1",
    invoice_number: `INV-2026-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
    items: [
      {
        product_id: "a4531a23-c60d-4555-bc55-4564a7f6dba7", // Black Seed Shampoo
        quantity_units: 3,
        unit_price: 450,
        discount_percent: 0
      }
    ],
    payments: [
      {
        method: "cash",
        amount: 1350 // 3 units * 450 DA
      }
    ],
    notes: "System test - POS Sale"
  };

  try {
    console.log("Submitting transaction...");
    const res = await fetch("http://localhost:3001/api/cloud/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    console.log("Response:", data);
  } catch (err) {
    console.error("Request failed:", err);
  }
}

runTest();