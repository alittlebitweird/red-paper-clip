import { describe, expect, it } from "vitest";

import { buildHeartbeatMessage } from "./index.js";

describe("worker heartbeat", () => {
  it("emits a running status payload", () => {
    const heartbeat = buildHeartbeatMessage();

    expect(heartbeat.service).toBe("worker");
    expect(heartbeat.status).toBe("running");
    expect(new Date(heartbeat.timestamp).toString()).not.toBe("Invalid Date");
  });
});
