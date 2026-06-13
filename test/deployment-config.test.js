const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("Vercel Hobby config does not include cron jobs", () => {
  const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  assert.equal(Object.prototype.hasOwnProperty.call(vercel, "crons"), false);
});

test("Supabase scheduled collection targets collect-market-data", () => {
  assert.equal(fs.existsSync("supabase/functions/collect-market-data/index.ts"), true);
  const config = fs.readFileSync("supabase/config.toml", "utf8");
  assert.match(config, /\[functions\.collect-market-data\]/);
  assert.match(config, /verify_jwt\s*=\s*false/);
  const cronSql = fs.readFileSync("supabase/migrations/20260613154000_cron_setup.sql", "utf8");
  assert.match(cronSql, /stocks-v2-collect-market-data/);
  assert.match(cronSql, /pxhkotgxqxggukiswzxk\.functions\.supabase\.co\/collect-market-data/);
  assert.match(cronSql, /supabase_vault/);
  assert.match(cronSql, /\*\/5 \* \* \* \*/);
});
