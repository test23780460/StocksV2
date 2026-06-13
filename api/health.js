const { serverConfigStatus } = require("../lib/env");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    status: "ok",
    generatedAt: new Date().toISOString(),
    checks: {
      app: "ok",
      environment: serverConfigStatus().map(({ key, configured }) => ({ key, configured }))
    },
    disclaimer: "Health endpoints do not expose secret values."
  });
};
