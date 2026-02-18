import { describe, expect, it } from "vitest";

import { renderHomePage } from "./index.js";

describe("web home page", () => {
  it("renders ops console title", () => {
    const html = renderHomePage();

    expect(html).toContain("Open Claw Bot Ops Console");
  });
});
