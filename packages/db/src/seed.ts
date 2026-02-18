import { Client } from "pg";

import { getDatabaseUrl } from "./config.js";

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

    console.log("[db] seeded policy_rules");
  } finally {
    await client.end();
  }
};

await run();
