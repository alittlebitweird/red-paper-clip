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
  private readonly offersById = new Map<number, { id: number; opportunityId: number; status: "draft" | "approved" | "rejected" | "sent"; offerTerms: Record<string, unknown>; sentByHumanId?: string; updatedAt: string }>();
  public readonly events: AuditEvent[] = [];
  public readonly policyRules: PolicyRuleInput[] = [];
  private opportunityIdSequence = 1;
  private itemIdSequence = 1;
  private valuationIdSequence = 1;
  private offerIdSequence = 1;

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

  async getPolicyRule(platform: string, action: string) {
    return this.policyRules.find((rule) => rule.platform === platform && rule.action === action) ?? null;
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
      dedupeKey: input.dedupeKey,
      createdAt: new Date().toISOString()
    };
    this.opportunityIdSequence += 1;
    this.opportunitiesByDedupeKey.set(input.dedupeKey, record);
    return record;
  }

  async listOpportunities(options: { status?: string; limit?: number }): Promise<OpportunityRecord[]> {
    const limit = options.limit ?? 50;
    return Array.from(this.opportunitiesByDedupeKey.values()).slice(0, limit);
  }

  async recordValuation(input: {
    itemId?: number;
    title: string;
    category: string;
    condition?: string;
    estimatedValueUsd: number;
    confidenceScore: number;
    modelVersion: string;
    comps: Array<{ priceUsd: number; source?: string }>;
  }) {
    const itemId = input.itemId ?? this.itemIdSequence++;
    return {
      valuationId: this.valuationIdSequence++,
      itemId,
      estimatedValueUsd: input.estimatedValueUsd,
      confidenceScore: input.confidenceScore,
      modelVersion: input.modelVersion
    };
  }

  async listScoringCandidates(limit: number) {
    return Array.from(this.opportunitiesByDedupeKey.values())
      .map((opportunity) => ({
        opportunityId: opportunity.id,
        targetValueUsd: opportunity.askValueUsd,
        source: opportunity.source,
        category: opportunity.category
      }))
      .slice(0, limit);
  }

  async getOpportunityById(id: number) {
    const opportunity = Array.from(this.opportunitiesByDedupeKey.values()).find((item) => item.id === id);
    if (!opportunity) {
      return null;
    }

    return {
      id: opportunity.id,
      status: opportunity.status
    };
  }

  async createOfferDraft(opportunityId: number, offerTerms: Record<string, unknown>) {
    const offer = {
      id: this.offerIdSequence++,
      opportunityId,
      status: "draft" as const,
      offerTerms,
      updatedAt: new Date().toISOString()
    };
    this.offersById.set(offer.id, offer);
    return offer;
  }

  async getOfferById(offerId: number) {
    return this.offersById.get(offerId) ?? null;
  }

  async updateOfferStatus(
    offerId: number,
    status: "draft" | "approved" | "rejected" | "sent",
    sentByHumanId?: string
  ) {
    const offer = this.offersById.get(offerId);
    if (!offer) {
      throw new Error("Offer not found");
    }

    const updated = {
      ...offer,
      status,
      sentByHumanId: sentByHumanId ?? offer.sentByHumanId,
      updatedAt: new Date().toISOString()
    };
    this.offersById.set(offerId, updated);
    return updated;
  }
}

describe("api auth and authorization", () => {
  let repository: InMemoryAuthRepository;
  let app: ReturnType<typeof buildServer>;

  beforeEach(() => {
    repository = new InMemoryAuthRepository();
    repository.addUser("admin-key", { id: 1, email: "admin@openclaw.local", role: "admin" });
    repository.addUser("operator-key", { id: 2, email: "operator@openclaw.local", role: "operator" });
    repository.addUser("reviewer-key", { id: 3, email: "reviewer@openclaw.local", role: "reviewer" });
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

  it("returns opportunities list for reviewer role", async () => {
    await app.inject({
      method: "POST",
      url: "/opportunities",
      headers: { "x-api-key": "operator-key" },
      payload: {
        source: "Craigslist",
        category: "Electronics",
        location: "San Francisco, CA",
        title: "Nintendo Switch",
        priceUsd: 250
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/opportunities",
      headers: { "x-api-key": "reviewer-key" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().opportunities).toHaveLength(1);
  });

  it("records a valuation and returns versioned output", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/valuations",
      headers: { "x-api-key": "operator-key" },
      payload: {
        title: "Nintendo Switch",
        category: "Electronics",
        baseValueUsd: 220,
        comps: [{ priceUsd: 210 }, { priceUsd: 230 }, { priceUsd: 225 }]
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().modelVersion).toBe("rules-v1");
    expect(repository.events).toContainEqual(
      expect.objectContaining({
        eventType: "valuation.recorded",
        entityType: "item"
      })
    );
  });

  it("validates valuation payload requirements", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/valuations",
      headers: { "x-api-key": "operator-key" },
      payload: {
        title: "",
        category: "",
        comps: []
      }
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns ranked trade candidates", async () => {
    await app.inject({
      method: "POST",
      url: "/opportunities",
      headers: { "x-api-key": "operator-key" },
      payload: {
        source: "Craigslist",
        category: "Electronics",
        location: "San Francisco, CA",
        title: "Nintendo Switch",
        priceUsd: 250
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/scoring/rank",
      headers: { "x-api-key": "operator-key" },
      payload: {
        currentItemValueUsd: 100,
        limit: 5
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().ranked).toHaveLength(1);
    expect(response.json().ranked[0]).toHaveProperty("tradeScore");
  });

  it("blocks outbound actions when policy denies them", async () => {
    await app.inject({
      method: "POST",
      url: "/admin/policy-rules",
      headers: { "x-api-key": "admin-key" },
      payload: {
        platform: "etsy",
        action: "off_platform_transaction",
        allowed: false,
        reason: "blocked by marketplace terms"
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/outbound/actions",
      headers: { "x-api-key": "operator-key" },
      payload: {
        platform: "etsy",
        action: "off_platform_transaction"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().allowed).toBe(false);
    expect(response.json().policyCode).toContain("POLICY_ETSY_OFF_PLATFORM_TRANSACTION");
    expect(repository.events).toContainEqual(
      expect.objectContaining({
        eventType: "policy.decision"
      })
    );
  });

  it("allows outbound actions when no deny rule exists", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/outbound/actions",
      headers: { "x-api-key": "operator-key" },
      payload: {
        platform: "craigslist",
        action: "schedule_meetup"
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().allowed).toBe(true);
  });

  it("tracks offer workflow from draft to sent", async () => {
    const opportunity = await app.inject({
      method: "POST",
      url: "/opportunities",
      headers: { "x-api-key": "operator-key" },
      payload: {
        source: "Craigslist",
        category: "Electronics",
        location: "San Francisco, CA",
        title: "Nintendo Switch",
        priceUsd: 250
      }
    });

    const draft = await app.inject({
      method: "POST",
      url: "/offers/draft",
      headers: { "x-api-key": "operator-key" },
      payload: {
        opportunityId: opportunity.json().id,
        offerTerms: { requestedItem: "MacBook Air", cashDeltaUsd: 0 }
      }
    });

    const approved = await app.inject({
      method: "POST",
      url: `/offers/${draft.json().id}/approve`,
      headers: { "x-api-key": "reviewer-key" }
    });

    const sent = await app.inject({
      method: "POST",
      url: `/offers/${draft.json().id}/send`,
      headers: { "x-api-key": "operator-key" }
    });

    expect(draft.statusCode).toBe(201);
    expect(approved.statusCode).toBe(200);
    expect(sent.statusCode).toBe(200);
    expect(sent.json().status).toBe("sent");
  });

  it("rejects invalid offer transitions", async () => {
    const opportunity = await app.inject({
      method: "POST",
      url: "/opportunities",
      headers: { "x-api-key": "operator-key" },
      payload: {
        source: "Craigslist",
        category: "Electronics",
        location: "San Francisco, CA",
        title: "Nintendo Switch",
        priceUsd: 250
      }
    });

    const draft = await app.inject({
      method: "POST",
      url: "/offers/draft",
      headers: { "x-api-key": "operator-key" },
      payload: {
        opportunityId: opportunity.json().id,
        offerTerms: { requestedItem: "MacBook Air", cashDeltaUsd: 0 }
      }
    });

    await app.inject({
      method: "POST",
      url: `/offers/${draft.json().id}/reject`,
      headers: { "x-api-key": "reviewer-key" }
    });

    const invalid = await app.inject({
      method: "POST",
      url: `/offers/${draft.json().id}/approve`,
      headers: { "x-api-key": "reviewer-key" }
    });

    expect(invalid.statusCode).toBe(409);
    expect(invalid.json().error).toContain("Invalid transition");
  });
});
