const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function listJsFiles(directory) {
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...listJsFiles(fullPath));
    else if (entry.name.endsWith(".js")) output.push(fullPath);
  }
  return output;
}

test("Vercel Hobby config does not include cron jobs", () => {
  const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  assert.equal(Object.prototype.hasOwnProperty.call(vercel, "crons"), false);
});

test("Vercel Hobby API stays under serverless function limit", () => {
  const apiFiles = listJsFiles("api");
  assert.deepEqual(apiFiles, [path.join("api", "[...path].js")]);
  assert.ok(apiFiles.length <= 12);
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
