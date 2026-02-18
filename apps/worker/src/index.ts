import "dotenv/config";

export const buildHeartbeatMessage = () => {
  return {
    service: "worker",
    status: "running",
    timestamp: new Date().toISOString()
  };
};

export type SnapshotJobConfig = {
  enabled: boolean;
  apiBaseUrl: string;
  apiKey: string;
  seedCostUsd: number;
  intervalMs: number;
};

export const getSnapshotJobConfig = (env: NodeJS.ProcessEnv): SnapshotJobConfig => {
  return {
    enabled: env.AUTO_SNAPSHOT_ENABLED === "true",
    apiBaseUrl: env.API_BASE_URL ?? "http://localhost:3001",
    apiKey: env.SNAPSHOT_API_KEY ?? "",
    seedCostUsd: Number(env.SEED_COST_USD ?? 0.9),
    intervalMs: Number(env.SNAPSHOT_INTERVAL_MS ?? 86_400_000)
  };
};

export const buildSnapshotRequest = (config: SnapshotJobConfig) => {
  return {
    url: `${config.apiBaseUrl}/dashboard/kpi/snapshot`,
    options: {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.apiKey
      },
      body: JSON.stringify({ seedCostUsd: config.seedCostUsd })
    }
  };
};

export const triggerKpiSnapshot = async (
  config: SnapshotJobConfig,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> => {
  if (!config.enabled || !config.apiKey) {
    return false;
  }

  const request = buildSnapshotRequest(config);
  const response = await fetchImpl(request.url, request.options);

  if (!response.ok) {
    console.error(`[worker] snapshot request failed: ${response.status}`);
    return false;
  }

  console.log("[worker] KPI snapshot created");
  return true;
};

const startWorker = () => {
  const heartbeatIntervalMs = Number(process.env.WORKER_HEARTBEAT_MS ?? 10000);
  const snapshotConfig = getSnapshotJobConfig(process.env);

  console.log("[worker] started");
  setInterval(() => {
    console.log(buildHeartbeatMessage());
  }, heartbeatIntervalMs);

  if (snapshotConfig.enabled) {
    void triggerKpiSnapshot(snapshotConfig);
    setInterval(() => {
      void triggerKpiSnapshot(snapshotConfig);
    }, snapshotConfig.intervalMs);
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  startWorker();
}
