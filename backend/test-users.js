async function runUserTest() {
  const companyId = "d7d6d1a9-f4db-4214-874d-d8267b3dfde5"; // SORALI DISTRIBUTION
  const adminTelegramId = "1046422785"; // Your Telegram ID

  console.log("--- 1. Authenticating Admin User ---");
  const meRes = await fetch("http://localhost:3001/api/cloud/auth/me", {
    headers: { "x-telegram-id": adminTelegramId }
  });
  console.log("Me Response:", await meRes.json());

  console.log("\n--- 2. Adding a Test Cashier Account ---");
  const addUserRes = await fetch("http://localhost:3001/api/cloud/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company_id: companyId,
      telegram_id: "987654321",
      username: "test_cashier",
      full_name: "Ahmed Cashier",
      role: "cashier"
    })
  });
  console.log("Add User Response:", await addUserRes.json());

  console.log("\n--- 3. Fetching All Team Users ---");
  const usersRes = await fetch(`http://localhost:3001/api/cloud/users?company_id=${companyId}`);
  console.log("Team Users:", await usersRes.json());
}

runUserTest();