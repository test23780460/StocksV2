module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    mode: "Demo Mode",
    protected: true,
    note: "Add Supabase Auth role checks before exposing production admin job controls.",
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
