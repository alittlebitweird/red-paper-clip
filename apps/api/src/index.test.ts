import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  type AuditEvent,
  type AuthRepository,
  type AuthUser,
  type OpportunityCreateInput,
  type OpportunityRecord,
  type PolicyRuleInput
} from "./auth-repository.js";
import { hashApiKey } from "./hash-api-key.js";
import { buildServer } from "./index.js";

class InMemoryAuthRepository implements AuthRepository {
  private readonly usersByHash = new Map<string, AuthUser>();
  private readonly opportunitiesByDedupeKey = new Map<string, OpportunityRecord>();
  public readonly events: AuditEvent[] = [];
  public readonly policyRules: PolicyRuleInput[] = [];
  private opportunityIdSequence = 1;

  addUser(apiKey: string, user: AuthUser) {
    this.usersByHash.set(hashApiKey(apiKey), user);
  }

  async findUserByApiKeyHash(apiKeyHash: string): Promise<AuthUser | null> {
    return this.usersByHash.get(apiKeyHash) ?? null;
  }

  async writeEvent(event: AuditEvent): Promise<void> {
    this.events.push(event);
  }

  async upsertPolicyRule(rule: PolicyRuleInput): Promise<void> {
    this.policyRules.push(rule);
  }

  async findOpportunityByDedupeKey(dedupeKey: string): Promise<OpportunityRecord | null> {
    return this.opportunitiesByDedupeKey.get(dedupeKey) ?? null;
  }

  async createOpportunity(input: OpportunityCreateInput): Promise<OpportunityRecord> {
    const record: OpportunityRecord = {
      id: this.opportunityIdSequence,
      status: "sourcing",
      source: input.source,
      category: input.category,
      location: input.location,
      askValueUsd: input.askValueUsd,
      dedupeKey: input.dedupeKey
    };
    this.opportunityIdSequence += 1;
    this.opportunitiesByDedupeKey.set(input.dedupeKey, record);
    return record;
  }
}

describe("api auth and authorization", () => {
  let repository: InMemoryAuthRepository;
  let app: ReturnType<typeof buildServer>;

  beforeEach(() => {
    repository = new InMemoryAuthRepository();
    repository.addUser("admin-key", { id: 1, email: "admin@openclaw.local", role: "admin" });
    repository.addUser("operator-key", { id: 2, email: "operator@openclaw.local", role: "operator" });
    app = buildServer({ authRepository: repository });
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns health status", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("ok");
  });

  it("logs an audit event on successful login", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { apiKey: "admin-key" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().role).toBe("admin");
    expect(repository.events).toContainEqual(
      expect.objectContaining({
        eventType: "auth.login",
        entityType: "user",
        entityId: "1"
      })
    );
  });

  it("rejects protected route access without key", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/auth/me"
    });

    expect(response.statusCode).toBe(401);
  });

  it("prevents non-admin users from critical policy updates", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/admin/policy-rules",
      headers: { "x-api-key": "operator-key" },
      payload: {
        platform: "etsy",
        action: "off_platform_transaction",
        allowed: false,
        reason: "forbidden"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(repository.policyRules).toHaveLength(0);
  });

  it("allows admin users and logs critical action events", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/admin/policy-rules",
      headers: { "x-api-key": "admin-key" },
      payload: {
        platform: "etsy",
        action: "off_platform_transaction",
        allowed: false,
        reason: "forbidden"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(repository.policyRules).toHaveLength(1);
    expect(repository.events).toContainEqual(
      expect.objectContaining({
        eventType: "critical.policy_rule_upsert",
        entityType: "policy_rule",
        entityId: "etsy:off_platform_transaction"
      })
    );
  });

  it("creates normalized opportunities for operator users", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/opportunities",
      headers: { "x-api-key": "operator-key" },
      payload: {
        source: "  Craigslist ",
        category: " Electronics ",
        location: " San Francisco, CA ",
        title: " Nintendo Switch ",
        priceUsd: 250
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      source: "craigslist",
      category: "electronics",
      location: "san francisco, ca",
      askValueUsd: 250
    });
    expect(repository.events).toContainEqual(
      expect.objectContaining({
        eventType: "opportunity.created",
        entityType: "opportunity"
      })
    );
  });

  it("rejects duplicate opportunities using dedupe key", async () => {
    const payload = {
      source: "Craigslist",
      category: "Electronics",
      location: "San Francisco, CA",
      title: "Nintendo Switch",
      priceUsd: 250
    };

    const first = await app.inject({
      method: "POST",
      url: "/opportunities",
      headers: { "x-api-key": "operator-key" },
      payload
    });
    const second = await app.inject({
      method: "POST",
      url: "/opportunities",
      headers: { "x-api-key": "operator-key" },
      payload
    });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toBe("Duplicate opportunity");
  });

  it("validates required opportunity fields", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/opportunities",
      headers: { "x-api-key": "operator-key" },
      payload: {
        source: "Craigslist",
        priceUsd: 0
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("source, category, location");
  });
});
