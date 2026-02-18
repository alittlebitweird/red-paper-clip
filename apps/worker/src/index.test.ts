import { describe, expect, it, vi } from "vitest";

import {
  buildHeartbeatMessage,
  buildSnapshotRequest,
  getSnapshotJobConfig,
  triggerKpiSnapshot
} from "./index.js";

describe("worker heartbeat", () => {
  it("emits a running status payload", () => {
    const heartbeat = buildHeartbeatMessage();

    expect(heartbeat.service).toBe("worker");
    expect(heartbeat.status).toBe("running");
    expect(new Date(heartbeat.timestamp).toString()).not.toBe("Invalid Date");
  });
});

describe("snapshot job", () => {
  it("builds snapshot config from env", () => {
    const config = getSnapshotJobConfig({
      AUTO_SNAPSHOT_ENABLED: "true",
      API_BASE_URL: "http://localhost:3001",
      SNAPSHOT_API_KEY: "admin-key",
      SEED_COST_USD: "0.9",
      SNAPSHOT_INTERVAL_MS: "1000"
    });

    expect(config.enabled).toBe(true);
    expect(config.apiKey).toBe("admin-key");
    expect(config.seedCostUsd).toBe(0.9);
    expect(config.intervalMs).toBe(1000);
  });

  it("builds request payload for snapshot endpoint", () => {
    const request = buildSnapshotRequest({
      enabled: true,
      apiBaseUrl: "http://localhost:3001",
      apiKey: "admin-key",
      seedCostUsd: 0.9,
      intervalMs: 1000
    });

    expect(request.url).toContain("/dashboard/kpi/snapshot");
    expect(request.options.method).toBe("POST");
  });

  it("triggers snapshot when enabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201 });

    const result = await triggerKpiSnapshot(
      {
        enabled: true,
        apiBaseUrl: "http://localhost:3001",
        apiKey: "admin-key",
        seedCostUsd: 0.9,
        intervalMs: 1000
      },
      fetchMock
    );

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
