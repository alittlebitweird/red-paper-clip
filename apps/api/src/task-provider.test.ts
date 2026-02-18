import { describe, expect, it, vi } from "vitest";

import { createTaskProviderFromEnv, RentAHumanApiProvider } from "./task-provider.js";

describe("task provider configuration", () => {
  it("defaults to stub provider when TASK_PROVIDER is not set", async () => {
    const provider = createTaskProviderFromEnv({});
    const task = await provider.createTask({ type: "inspect" });

    expect(task.providerName).toBe("rentahuman_stub");
    expect(task.providerTaskId).toMatch(/^inspect-/);
  });

  it("throws for missing credentials when TASK_PROVIDER=rentahuman_api", () => {
    expect(() =>
      createTaskProviderFromEnv({
        TASK_PROVIDER: "rentahuman_api"
      })
    ).toThrow("RENTAHUMAN_BASE_URL and RENTAHUMAN_API_KEY are required");
  });
});

describe("RentAHumanApiProvider", () => {
  it("posts bounty payload and returns provider task id", async () => {
    let capturedUrl: URL | RequestInfo = "";
    let capturedInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      capturedUrl = input;
      capturedInit = init;
      return new Response(JSON.stringify({ id: "bounty-123" }), {
        status: 201,
        headers: { "content-type": "application/json" }
      });
    });

    const provider = new RentAHumanApiProvider({
      baseUrl: "https://api.rentahuman.ai/",
      apiKey: "test-key",
      timeoutMs: 5_000,
      fetchImpl: fetchMock as typeof fetch
    });

    const result = await provider.createTask({
      type: "pickup",
      assignee: "runner-1",
      metadata: {
        title: "Pickup package",
        description: "Inspect and pick up item",
        budgetUsd: 42,
        location: "Austin, TX",
        deadlineIso: "2026-02-19T10:00:00.000Z"
      }
    });

    expect(result).toEqual({
      providerName: "rentahuman_api",
      providerTaskId: "bounty-123"
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(capturedUrl)).toBe("https://api.rentahuman.ai/api/bounties");
    expect(capturedInit?.method).toBe("POST");

    const payload = JSON.parse(String(capturedInit?.body));
    expect(payload.title).toBe("Pickup package");
    expect(payload.budget).toBe(42);
    expect(payload.location).toBe("Austin, TX");
    expect(payload.metadata.taskType).toBe("pickup");
    expect(payload.metadata.assignee).toBe("runner-1");
  });

  it("accepts nested provider id fields", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: { taskId: 987 } }), {
        status: 201,
        headers: { "content-type": "application/json" }
      })
    );

    const provider = new RentAHumanApiProvider({
      baseUrl: "https://api.rentahuman.ai",
      apiKey: "test-key",
      fetchImpl: fetchMock as typeof fetch
    });

    const result = await provider.createTask({ type: "meet" });
    expect(result.providerTaskId).toBe("987");
  });
});
