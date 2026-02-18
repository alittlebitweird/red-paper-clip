import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type AuditEvent, type AuthRepository, type AuthUser, type PolicyRuleInput } from "./auth-repository.js";
import { hashApiKey } from "./hash-api-key.js";
import { buildServer } from "./index.js";

class InMemoryAuthRepository implements AuthRepository {
  private readonly usersByHash = new Map<string, AuthUser>();
  public readonly events: AuditEvent[] = [];
  public readonly policyRules: PolicyRuleInput[] = [];

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
});
