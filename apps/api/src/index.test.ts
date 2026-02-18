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
import { type PortfolioStatus } from "./portfolio-state-machine.js";
import { type TaskProvider } from "./task-provider.js";

class DeterministicTaskProvider implements TaskProvider {
  private sequence = 1;

  async createTask(input: { type: "inspect" | "pickup" | "meet" | "ship" }) {
    const providerTaskId = `${input.type}-${this.sequence}`;
    this.sequence += 1;
    return {
      providerName: "rentahuman_stub",
      providerTaskId
    };
  }
}

class InMemoryAuthRepository implements AuthRepository {
  private readonly usersByHash = new Map<string, AuthUser>();
  private readonly opportunitiesByDedupeKey = new Map<string, OpportunityRecord>();
  private readonly offersById = new Map<number, { id: number; opportunityId: number; status: "draft" | "approved" | "rejected" | "sent"; offerTerms: Record<string, unknown>; sentByHumanId?: string; updatedAt: string }>();
  private readonly tasksById = new Map<number, { id: number; type: "inspect" | "pickup" | "meet" | "ship"; assignee?: string; status: "queued" | "in_progress" | "completed" | "failed"; providerName: string; providerTaskId?: string; updatedAt: string }>();
  private readonly tasksByProviderTaskId = new Map<string, { id: number; type: "inspect" | "pickup" | "meet" | "ship"; assignee?: string; status: "queued" | "in_progress" | "completed" | "failed"; providerName: string; providerTaskId?: string; updatedAt: string }>();
  private readonly evidenceByTaskId = new Map<number, Array<{ id: number; taskId: number; mediaUrl: string; checksum: string; geotag?: string; capturedAt: string; createdAt: string }>>();
  private readonly portfolioPositionsById = new Map<number, { id: number; itemId: number; acquiredAt: string; acquisitionValueUsd?: number; currentStatus: PortfolioStatus; createdAt: string; updatedAt: string }>();
  private readonly portfolioChecklistsByPositionId = new Map<number, Array<{ id: number; portfolioPositionId: number; checks: Record<string, boolean>; passed: boolean; outcomeStatus: "verified" | "failed" | "disputed"; createdByUserId: string; notes?: string; createdAt: string }>>();
  private readonly kpiSnapshots: Array<{ id: number; valueMultiple: number; closeRate: number; medianCycleTimeDays: number; fraudLossPct: number; activeTasks: number; createdAt: string }> = [];
  public readonly events: AuditEvent[] = [];
  public readonly policyRules: PolicyRuleInput[] = [];
  private opportunityIdSequence = 1;
  private itemIdSequence = 1;
  private valuationIdSequence = 1;
  private offerIdSequence = 1;
  private taskIdSequence = 1;
  private evidenceIdSequence = 1;
  private portfolioPositionSequence = 1;
  private portfolioChecklistSequence = 1;
  private kpiSnapshotSequence = 1;

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

  async createTaskRecord(input: {
    type: "inspect" | "pickup" | "meet" | "ship";
    assignee?: string;
    providerName: string;
    providerTaskId: string;
  }) {
    const task = {
      id: this.taskIdSequence++,
      type: input.type,
      assignee: input.assignee,
      status: "queued" as const,
      providerName: input.providerName,
      providerTaskId: input.providerTaskId,
      updatedAt: new Date().toISOString()
    };
    this.tasksById.set(task.id, task);
    this.tasksByProviderTaskId.set(input.providerTaskId, task);
    return task;
  }

  async getTaskById(taskId: number) {
    return this.tasksById.get(taskId) ?? null;
  }

  async updateTaskStatusByProviderTaskId(
    providerTaskId: string,
    status: "queued" | "in_progress" | "completed" | "failed"
  ) {
    const existing = this.tasksByProviderTaskId.get(providerTaskId);

    if (!existing) {
      return null;
    }

    const updated = {
      ...existing,
      status,
      updatedAt: new Date().toISOString()
    };
    this.tasksById.set(updated.id, updated);
    this.tasksByProviderTaskId.set(providerTaskId, updated);
    return updated;
  }

  async createEvidenceRecord(input: {
    taskId: number;
    mediaUrl: string;
    checksum: string;
    geotag?: string;
    capturedAt: string;
  }) {
    const record = {
      id: this.evidenceIdSequence++,
      taskId: input.taskId,
      mediaUrl: input.mediaUrl,
      checksum: input.checksum,
      geotag: input.geotag,
      capturedAt: input.capturedAt,
      createdAt: new Date().toISOString()
    };
    const existing = this.evidenceByTaskId.get(input.taskId) ?? [];
    existing.unshift(record);
    this.evidenceByTaskId.set(input.taskId, existing);
    return record;
  }

  async listEvidenceByTaskId(taskId: number) {
    return this.evidenceByTaskId.get(taskId) ?? [];
  }

  async createPortfolioPosition(input: {
    title: string;
    category?: string;
    condition?: string;
    location?: string;
    acquisitionValueUsd?: number;
  }) {
    const record = {
      id: this.portfolioPositionSequence++,
      itemId: this.itemIdSequence++,
      acquiredAt: new Date().toISOString(),
      acquisitionValueUsd: input.acquisitionValueUsd,
      currentStatus: "seeded" as PortfolioStatus,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.portfolioPositionsById.set(record.id, record);
    return record;
  }

  async getPortfolioPositionById(positionId: number) {
    return this.portfolioPositionsById.get(positionId) ?? null;
  }

  async updatePortfolioPositionStatus(positionId: number, status: PortfolioStatus) {
    const existing = this.portfolioPositionsById.get(positionId);

    if (!existing) {
      return null;
    }

    const updated = {
      ...existing,
      currentStatus: status,
      updatedAt: new Date().toISOString()
    };
    this.portfolioPositionsById.set(positionId, updated);
    return updated;
  }

  async createPortfolioVerificationChecklist(input: {
    portfolioPositionId: number;
    checks: Record<string, boolean>;
    passed: boolean;
    outcomeStatus: "verified" | "failed" | "disputed";
    createdByUserId: string;
    notes?: string;
  }) {
    const record = {
      id: this.portfolioChecklistSequence++,
      portfolioPositionId: input.portfolioPositionId,
      checks: input.checks,
      passed: input.passed,
      outcomeStatus: input.outcomeStatus,
      createdByUserId: input.createdByUserId,
      notes: input.notes,
      createdAt: new Date().toISOString()
    };
    const existing = this.portfolioChecklistsByPositionId.get(input.portfolioPositionId) ?? [];
    existing.unshift(record);
    this.portfolioChecklistsByPositionId.set(input.portfolioPositionId, existing);
    return record;
  }

  async listPortfolioVerificationChecklists(portfolioPositionId: number) {
    return this.portfolioChecklistsByPositionId.get(portfolioPositionId) ?? [];
  }

  async computeDashboardMetrics(seedCostUsd: number) {
    const activePositions = Array.from(this.portfolioPositionsById.values()).filter((position) =>
      [
        "seeded",
        "sourcing",
        "screened",
        "negotiating",
        "accepted_pending_verification",
        "verified",
        "completed"
      ].includes(position.currentStatus)
    );
    const totalValue = activePositions.reduce((sum, position) => sum + (position.acquisitionValueUsd ?? 0), 0);
    const totalOffers = this.offersById.size;
    const sentOffers = Array.from(this.offersById.values()).filter((offer) => offer.status === "sent").length;
    const disputedValue = Array.from(this.portfolioPositionsById.values())
      .filter((position) => position.currentStatus === "disputed")
      .reduce((sum, position) => sum + (position.acquisitionValueUsd ?? 0), 0);
    const totalAcquisition = Array.from(this.portfolioPositionsById.values()).reduce(
      (sum, position) => sum + (position.acquisitionValueUsd ?? 0),
      0
    );
    const activeTasks = Array.from(this.tasksById.values()).filter((task) =>
      ["queued", "in_progress"].includes(task.status)
    ).length;

    return {
      valueMultiple: Number((totalValue / (seedCostUsd > 0 ? seedCostUsd : 1)).toFixed(4)),
      closeRate: Number((totalOffers > 0 ? sentOffers / totalOffers : 0).toFixed(4)),
      medianCycleTimeDays: 0,
      fraudLossPct: Number((totalAcquisition > 0 ? (disputedValue / totalAcquisition) * 100 : 0).toFixed(4)),
      activeTasks
    };
  }

  async createKpiSnapshot(metrics: {
    valueMultiple: number;
    closeRate: number;
    medianCycleTimeDays: number;
    fraudLossPct: number;
    activeTasks: number;
  }) {
    const record = {
      id: this.kpiSnapshotSequence++,
      ...metrics,
      createdAt: new Date().toISOString()
    };
    this.kpiSnapshots.unshift(record);
    return record;
  }

  async listKpiSnapshots(limit: number) {
    return this.kpiSnapshots.slice(0, limit);
  }

  async getLatestKpiSnapshot() {
    return this.kpiSnapshots.length > 0 ? this.kpiSnapshots[0] : null;
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
    app = buildServer({ authRepository: repository, taskProvider: new DeterministicTaskProvider() });
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

  it("creates tasks through provider adapter and updates via webhook", async () => {
    const createdTask = await app.inject({
      method: "POST",
      url: "/tasks",
      headers: { "x-api-key": "operator-key" },
      payload: {
        type: "inspect",
        assignee: "runner-1"
      }
    });

    const providerTaskId = createdTask.json().providerTaskId;

    const webhook = await app.inject({
      method: "POST",
      url: "/tasks/webhook/provider",
      headers: { "x-webhook-token": "dev-webhook-token" },
      payload: {
        providerTaskId,
        status: "completed"
      }
    });

    expect(createdTask.statusCode).toBe(201);
    expect(createdTask.json().providerName).toBe("rentahuman_stub");
    expect(webhook.statusCode).toBe(200);
    expect(webhook.json().status).toBe("completed");
  });

  it("captures and lists evidence linked to task ids", async () => {
    const taskResponse = await app.inject({
      method: "POST",
      url: "/tasks",
      headers: { "x-api-key": "operator-key" },
      payload: {
        type: "pickup",
        assignee: "runner-2"
      }
    });

    const taskId = taskResponse.json().id;

    const evidenceResponse = await app.inject({
      method: "POST",
      url: `/tasks/${taskId}/evidence`,
      headers: { "x-api-key": "operator-key" },
      payload: {
        mediaUrl: "https://example.com/proof/pickup.jpg",
        geotag: "37.7749,-122.4194"
      }
    });

    const listResponse = await app.inject({
      method: "GET",
      url: `/tasks/${taskId}/evidence`,
      headers: { "x-api-key": "reviewer-key" }
    });

    expect(evidenceResponse.statusCode).toBe(201);
    expect(evidenceResponse.json().checksum).toHaveLength(64);
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().evidence).toHaveLength(1);
  });

  it("validates required evidence fields", async () => {
    const taskResponse = await app.inject({
      method: "POST",
      url: "/tasks",
      headers: { "x-api-key": "operator-key" },
      payload: {
        type: "inspect"
      }
    });

    const response = await app.inject({
      method: "POST",
      url: `/tasks/${taskResponse.json().id}/evidence`,
      headers: { "x-api-key": "operator-key" },
      payload: {}
    });

    expect(response.statusCode).toBe(400);
  });

  it("enforces portfolio position state transitions", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/portfolio/positions",
      headers: { "x-api-key": "operator-key" },
      payload: {
        title: "Red paper clip",
        category: "collectibles",
        acquisitionValueUsd: 0.9
      }
    });

    const invalid = await app.inject({
      method: "POST",
      url: `/portfolio/positions/${created.json().id}/transition`,
      headers: { "x-api-key": "operator-key" },
      payload: {
        targetStatus: "verified"
      }
    });

    const valid = await app.inject({
      method: "POST",
      url: `/portfolio/positions/${created.json().id}/transition`,
      headers: { "x-api-key": "operator-key" },
      payload: {
        targetStatus: "sourcing"
      }
    });

    expect(created.statusCode).toBe(201);
    expect(invalid.statusCode).toBe(409);
    expect(valid.statusCode).toBe(200);
    expect(valid.json().currentStatus).toBe("sourcing");
  });

  it("runs verification checklist and transitions to verified when checks pass", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/portfolio/positions",
      headers: { "x-api-key": "operator-key" },
      payload: {
        title: "Red paper clip",
        category: "collectibles"
      }
    });

    const positionId = created.json().id;
    const transitions = ["sourcing", "screened", "negotiating", "accepted_pending_verification"];

    for (const targetStatus of transitions) {
      const response = await app.inject({
        method: "POST",
        url: `/portfolio/positions/${positionId}/transition`,
        headers: { "x-api-key": "operator-key" },
        payload: { targetStatus }
      });
      expect(response.statusCode).toBe(200);
    }

    const verify = await app.inject({
      method: "POST",
      url: `/portfolio/positions/${positionId}/verification-checklist`,
      headers: { "x-api-key": "reviewer-key" },
      payload: {
        identityConfirmed: true,
        conditionConfirmed: true,
        receiptProvided: true,
        ownershipProofProvided: true
      }
    });

    expect(verify.statusCode).toBe(200);
    expect(verify.json().position.currentStatus).toBe("verified");
    expect(verify.json().checklist.passed).toBe(true);
  });

  it("moves verification failures to disputed when requested", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/portfolio/positions",
      headers: { "x-api-key": "operator-key" },
      payload: {
        title: "Trade candidate"
      }
    });

    const positionId = created.json().id;
    const transitions = ["sourcing", "screened", "negotiating", "accepted_pending_verification"];

    for (const targetStatus of transitions) {
      await app.inject({
        method: "POST",
        url: `/portfolio/positions/${positionId}/transition`,
        headers: { "x-api-key": "operator-key" },
        payload: { targetStatus }
      });
    }

    const verify = await app.inject({
      method: "POST",
      url: `/portfolio/positions/${positionId}/verification-checklist`,
      headers: { "x-api-key": "reviewer-key" },
      payload: {
        identityConfirmed: false,
        conditionConfirmed: true,
        receiptProvided: false,
        ownershipProofProvided: true,
        disputed: true
      }
    });

    expect(verify.statusCode).toBe(200);
    expect(verify.json().position.currentStatus).toBe("disputed");
    expect(verify.json().checklist.outcomeStatus).toBe("disputed");
  });

  it("creates and lists KPI dashboard snapshots", async () => {
    await app.inject({
      method: "POST",
      url: "/portfolio/positions",
      headers: { "x-api-key": "operator-key" },
      payload: {
        title: "Current asset",
        acquisitionValueUsd: 9
      }
    });

    const snapshot = await app.inject({
      method: "POST",
      url: "/dashboard/kpi/snapshot",
      headers: { "x-api-key": "operator-key" },
      payload: { seedCostUsd: 0.9 }
    });

    const dashboard = await app.inject({
      method: "GET",
      url: "/dashboard/kpi",
      headers: { "x-api-key": "reviewer-key" }
    });

    const snapshots = await app.inject({
      method: "GET",
      url: "/dashboard/kpi/snapshots?limit=10",
      headers: { "x-api-key": "reviewer-key" }
    });

    expect(snapshot.statusCode).toBe(201);
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.json().metrics.valueMultiple).toBeGreaterThan(0);
    expect(snapshots.statusCode).toBe(200);
    expect(snapshots.json().snapshots.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects provider webhook with invalid token", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/tasks/webhook/provider",
      headers: { "x-webhook-token": "wrong" },
      payload: {
        providerTaskId: "inspect-1",
        status: "completed"
      }
    });

    expect(response.statusCode).toBe(401);
  });
});
