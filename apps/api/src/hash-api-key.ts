import { createHash } from "node:crypto";

export const hashApiKey = (apiKey: string) => {
  return createHash("sha256").update(apiKey).digest("hex");
};
