require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
  console.log("Connecting to Supabase...");

  const { data, error } = await supabase
    .from("companies")
    .select("id, name, code, currency, active")
    .eq("code", "SORALI")
    .single();

  if (error) {
    console.error("❌ Supabase connection/query failed:");
    console.error(error);
    process.exit(1);
  }

  console.log("✅ Supabase connection successful!");
  console.log("Company found:");
  console.log(data);
}

test();