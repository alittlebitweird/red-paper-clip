import { createHash } from "node:crypto";

import { Client } from "pg";

import { getDatabaseUrl } from "./config.js";

const hashApiKey = (apiKey: string) => createHash("sha256").update(apiKey).digest("hex");

const run = async () => {
  const client = new Client({ connectionString: getDatabaseUrl() });
  await client.connect();

  try {
    await client.query(`
      INSERT INTO policy_rules (platform, action, allowed, reason, last_reviewed_at)
      VALUES
        ('etsy', 'off_platform_transaction', false, 'Etsy policy disallows off-platform transaction completion for Etsy-originated sales.', CURRENT_DATE),
        ('ebay', 'autonomous_checkout', false, 'Autonomous end-to-end checkout should remain human-approved unless explicitly permitted.', CURRENT_DATE),
        ('craigslist', 'automated_posting', false, 'Automated posting or scraping-style activity is disallowed.', CURRENT_DATE),
        ('offerup', 'automated_messaging', false, 'Automated messaging and transaction automation is disallowed.', CURRENT_DATE)
      ON CONFLICT (platform, action)
      DO UPDATE SET
        allowed = EXCLUDED.allowed,
        reason = EXCLUDED.reason,
        last_reviewed_at = EXCLUDED.last_reviewed_at
    `);

    const adminApiKey = process.env.ADMIN_API_KEY ?? "dev-admin-key";
    const operatorApiKey = process.env.OPERATOR_API_KEY ?? "dev-operator-key";
    const reviewerApiKey = process.env.REVIEWER_API_KEY ?? "dev-reviewer-key";

    await client.query(
      `
      INSERT INTO users (email, role, api_key_hash)
      VALUES
        ('admin@openclaw.local', 'admin', $1),
        ('operator@openclaw.local', 'operator', $2),
        ('reviewer@openclaw.local', 'reviewer', $3)
      ON CONFLICT (email)
      DO UPDATE SET
        role = EXCLUDED.role,
        api_key_hash = EXCLUDED.api_key_hash
      `,
      [hashApiKey(adminApiKey), hashApiKey(operatorApiKey), hashApiKey(reviewerApiKey)]
    );

    console.log("[db] seeded policy_rules");
    console.log("[db] seeded users");
  } finally {
    await client.end();
  }
};

await run();
