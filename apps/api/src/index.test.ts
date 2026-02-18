import { describe, expect, it } from "vitest";

import { buildServer } from "./index.js";

describe("api health endpoint", () => {
  it("returns ok status", async () => {
    const app = buildServer();

    const response = await app.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.service).toBe("api");
    expect(payload.status).toBe("ok");

    await app.close();
  });
});
