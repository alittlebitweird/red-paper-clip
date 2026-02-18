import { Pool } from "pg";

export type UserRole = "admin" | "operator" | "reviewer";

export type AuthUser = {
  id: number;
  email: string;
  role: UserRole;
};

export type AuditEvent = {
  eventType: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
};

export type PolicyRuleInput = {
  platform: string;
  action: string;
  allowed: boolean;
  reason: string;
};

export type OpportunityCreateInput = {
  source: string;
  category: string;
  location: string;
  title: string;
  askValueUsd: number;
  normalizedPayload: Record<string, unknown>;
  dedupeKey: string;
};

export type OpportunityRecord = {
  id: number;
  status: string;
  source: string;
  category: string;
  location: string;
  askValueUsd: number;
  dedupeKey: string;
};

export interface AuthRepository {
  findUserByApiKeyHash(apiKeyHash: string): Promise<AuthUser | null>;
  writeEvent(event: AuditEvent): Promise<void>;
  upsertPolicyRule(rule: PolicyRuleInput): Promise<void>;
  findOpportunityByDedupeKey(dedupeKey: string): Promise<OpportunityRecord | null>;
  createOpportunity(input: OpportunityCreateInput): Promise<OpportunityRecord>;
  close?: () => Promise<void>;
}

export class PgAuthRepository implements AuthRepository {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async findUserByApiKeyHash(apiKeyHash: string): Promise<AuthUser | null> {
    const result = await this.pool.query<AuthUser>(
      "SELECT id, email, role FROM users WHERE api_key_hash = $1 LIMIT 1",
      [apiKeyHash]
    );

    if (!result.rowCount || result.rowCount < 1) {
      return null;
    }

    return result.rows[0];
  }

  async writeEvent(event: AuditEvent): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO events (event_type, entity_type, entity_id, payload)
      VALUES ($1, $2, $3, $4::jsonb)
      `,
      [event.eventType, event.entityType, event.entityId, JSON.stringify(event.payload)]
    );
  }

  async upsertPolicyRule(rule: PolicyRuleInput): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO policy_rules (platform, action, allowed, reason, last_reviewed_at)
      VALUES ($1, $2, $3, $4, CURRENT_DATE)
      ON CONFLICT (platform, action)
      DO UPDATE SET
        allowed = EXCLUDED.allowed,
        reason = EXCLUDED.reason,
        last_reviewed_at = EXCLUDED.last_reviewed_at
      `,
      [rule.platform, rule.action, rule.allowed, rule.reason]
    );
  }

  async findOpportunityByDedupeKey(dedupeKey: string): Promise<OpportunityRecord | null> {
    const result = await this.pool.query<{
      id: number;
      status: string;
      source: string;
      category: string;
      location: string;
      ask_value_usd: string;
      dedupe_key: string;
    }>(
      `
      SELECT id, status, source, category, location, ask_value_usd, dedupe_key
      FROM opportunities
      WHERE dedupe_key = $1
      LIMIT 1
      `,
      [dedupeKey]
    );

    if (!result.rowCount || result.rowCount < 1) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      status: row.status,
      source: row.source,
      category: row.category,
      location: row.location,
      askValueUsd: Number(row.ask_value_usd),
      dedupeKey: row.dedupe_key
    };
  }

  async createOpportunity(input: OpportunityCreateInput): Promise<OpportunityRecord> {
    const result = await this.pool.query<{
      id: number;
      status: string;
      source: string;
      category: string;
      location: string;
      ask_value_usd: string;
      dedupe_key: string;
    }>(
      `
      INSERT INTO opportunities (
        source,
        category,
        location,
        title,
        ask_value_usd,
        normalized_payload,
        dedupe_key
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
      RETURNING id, status, source, category, location, ask_value_usd, dedupe_key
      `,
      [
        input.source,
        input.category,
        input.location,
        input.title,
        input.askValueUsd,
        JSON.stringify(input.normalizedPayload),
        input.dedupeKey
      ]
    );

    const row = result.rows[0];

    return {
      id: row.id,
      status: row.status,
      source: row.source,
      category: row.category,
      location: row.location,
      askValueUsd: Number(row.ask_value_usd),
      dedupeKey: row.dedupe_key
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
