import { describe, expect, it } from "vitest";

import { renderHomePage } from "./index.js";

describe("web home page", () => {
  it("renders ops console title", () => {
    const html = renderHomePage("http://localhost:3001");

    expect(html).toContain("Open Claw Bot Operations");
    expect(html).toContain("Opportunity Intake");
  });
});
