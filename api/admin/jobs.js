const { hasSupabaseServerConfig, select } = require("../../lib/supabaseRest");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (hasSupabaseServerConfig()) {
    try {
      const runs = await select("data_ingestion_runs", "select=job_name,provider,started_at,completed_at,status,requested_symbols,successful_symbols,failed_symbols,rows_inserted,api_requests,error_message,metadata&order=started_at.desc&limit=25");
      res.status(200).json({
        mode: "Connected Data",
        protectedActions: true,
        actionsEndpoint: "/api/admin/actions",
        jobs: runs,
        adminActions: ["refresh-quotes", "backfill-history", "recalculate-indicators", "generate-predictions", "evaluate-predictions"]
      });
      return;
    } catch (error) {
      res.status(503).json({ mode: "Temporarily unavailable", error: error.message });
      return;
    }
  }
  res.status(200).json({
    mode: "Demo Mode",
    protected: true,
    note: "Supabase is not configured. Protected admin actions are available at /api/admin/actions after Auth, RLS, and service-role variables are configured.",
    adminActions: ["refresh-quotes", "backfill-history", "recalculate-indicators", "generate-predictions", "evaluate-predictions"],
    jobs: [
      {
        jobName: "stock-quotes",
        jobType: "collector",
        status: "paused",
        provider: "not configured",
        assetsProcessed: 0,
        recordsReceived: 0,
        recordsCreated: 0,
        recordsUpdated: 0,
        duplicateRecordsSkipped: 0,
        invalidRecordsRejected: 0,
        apiRequestsMade: 0,
        retryCount: 0,
        lastSuccessfulCheckpoint: null,
        nextScheduledRun: null,
        warningCount: 1,
        errorCount: 0,
        warning: "Waiting for provider credentials."
      },
      {
        jobName: "indicator-calculation",
        jobType: "worker",
        status: "ready",
        provider: "internal",
        assetsProcessed: 0,
        recordsReceived: 0,
        recordsCreated: 0,
        recordsUpdated: 0,
        duplicateRecordsSkipped: 0,
        invalidRecordsRejected: 0,
        apiRequestsMade: 0,
        retryCount: 0,
        lastSuccessfulCheckpoint: null,
        nextScheduledRun: "after quote snapshots",
        warningCount: 0,
        errorCount: 0
      }
    ]
  });
};
