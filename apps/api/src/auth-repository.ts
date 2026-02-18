import { Pool } from "pg";

import { type PortfolioStatus } from "./portfolio-state-machine.js";

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
  createdAt: string;
};

export type OpportunityListOptions = {
  status?: string;
  limit?: number;
};

export type ValuationCompInput = {
  priceUsd: number;
  source?: string;
};

export type RecordValuationInput = {
  itemId?: number;
  title: string;
  category: string;
  condition?: string;
  estimatedValueUsd: number;
  confidenceScore: number;
  modelVersion: string;
  comps: ValuationCompInput[];
};

export type ValuationRecord = {
  valuationId: number;
  itemId: number;
  estimatedValueUsd: number;
  confidenceScore: number;
  modelVersion: string;
};

export type ScoringCandidateRecord = {
  opportunityId: number;
  targetValueUsd: number;
  source: string;
  category: string;
  sellerRepScore?: number;
  expiresAt?: string;
};

export type PolicyRuleRecord = {
  platform: string;
  action: string;
  allowed: boolean;
  reason: string;
};

export type PolicyRuleListOptions = {
  platform?: string;
  limit?: number;
};

export type OpportunitySummary = {
  id: number;
  status: string;
};

export type OfferStatus = "draft" | "approved" | "rejected" | "sent";

export type OfferRecord = {
  id: number;
  opportunityId: number;
  status: OfferStatus;
  offerTerms: Record<string, unknown>;
  sentByHumanId?: string;
  updatedAt: string;
};

export type TaskStatus = "queued" | "in_progress" | "completed" | "failed";

export type TaskRecord = {
  id: number;
  type: "inspect" | "pickup" | "meet" | "ship";
  assignee?: string;
  status: TaskStatus;
  providerName: string;
  providerTaskId?: string;
  updatedAt: string;
};

export type EvidenceRecord = {
  id: number;
  taskId: number;
  mediaUrl: string;
  checksum: string;
  geotag?: string;
  capturedAt: string;
  createdAt: string;
};

export type PortfolioPositionRecord = {
  id: number;
  itemId: number;
  acquiredAt: string;
  acquisitionValueUsd?: number;
  currentStatus: PortfolioStatus;
  createdAt: string;
  updatedAt: string;
};

export type PortfolioVerificationChecklistRecord = {
  id: number;
  portfolioPositionId: number;
  checks: Record<string, boolean>;
  passed: boolean;
  outcomeStatus: "verified" | "failed" | "disputed";
  createdByUserId: string;
  notes?: string;
  createdAt: string;
};

export type DashboardMetrics = {
  valueMultiple: number;
  closeRate: number;
  medianCycleTimeDays: number;
  fraudLossPct: number;
  activeTasks: number;
};

export type KpiSnapshotRecord = DashboardMetrics & {
  id: number;
  createdAt: string;
};

export interface AuthRepository {
  findUserByApiKeyHash(apiKeyHash: string): Promise<AuthUser | null>;
  writeEvent(event: AuditEvent): Promise<void>;
  upsertPolicyRule(rule: PolicyRuleInput): Promise<void>;
  findOpportunityByDedupeKey(dedupeKey: string): Promise<OpportunityRecord | null>;
  createOpportunity(input: OpportunityCreateInput): Promise<OpportunityRecord>;
  listOpportunities(options: OpportunityListOptions): Promise<OpportunityRecord[]>;
  recordValuation(input: RecordValuationInput): Promise<ValuationRecord>;
  listScoringCandidates(limit: number): Promise<ScoringCandidateRecord[]>;
  getPolicyRule(platform: string, action: string): Promise<PolicyRuleRecord | null>;
  listPolicyRules(options: PolicyRuleListOptions): Promise<PolicyRuleRecord[]>;
  getOpportunityById(id: number): Promise<OpportunitySummary | null>;
  createOfferDraft(opportunityId: number, offerTerms: Record<string, unknown>): Promise<OfferRecord>;
  getOfferById(offerId: number): Promise<OfferRecord | null>;
  updateOfferStatus(offerId: number, status: OfferStatus, sentByHumanId?: string): Promise<OfferRecord>;
  createTaskRecord(input: {
    type: "inspect" | "pickup" | "meet" | "ship";
    assignee?: string;
    providerName: string;
    providerTaskId: string;
  }): Promise<TaskRecord>;
  getTaskById(taskId: number): Promise<TaskRecord | null>;
  updateTaskStatusByProviderTaskId(providerTaskId: string, status: TaskStatus): Promise<TaskRecord | null>;
  createEvidenceRecord(input: {
    taskId: number;
    mediaUrl: string;
    checksum: string;
    geotag?: string;
    capturedAt: string;
  }): Promise<EvidenceRecord>;
  listEvidenceByTaskId(taskId: number): Promise<EvidenceRecord[]>;
  createPortfolioPosition(input: {
    title: string;
    category?: string;
    condition?: string;
    location?: string;
    acquisitionValueUsd?: number;
  }): Promise<PortfolioPositionRecord>;
  getPortfolioPositionById(positionId: number): Promise<PortfolioPositionRecord | null>;
  updatePortfolioPositionStatus(
    positionId: number,
    status: PortfolioStatus
  ): Promise<PortfolioPositionRecord | null>;
  createPortfolioVerificationChecklist(input: {
    portfolioPositionId: number;
    checks: Record<string, boolean>;
    passed: boolean;
    outcomeStatus: "verified" | "failed" | "disputed";
    createdByUserId: string;
    notes?: string;
  }): Promise<PortfolioVerificationChecklistRecord>;
  listPortfolioVerificationChecklists(
    portfolioPositionId: number
  ): Promise<PortfolioVerificationChecklistRecord[]>;
  computeDashboardMetrics(seedCostUsd: number): Promise<DashboardMetrics>;
  createKpiSnapshot(metrics: DashboardMetrics): Promise<KpiSnapshotRecord>;
  listKpiSnapshots(limit: number): Promise<KpiSnapshotRecord[]>;
  getLatestKpiSnapshot(): Promise<KpiSnapshotRecord | null>;
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
      created_at: string;
    }>(
      `
      SELECT id, status, source, category, location, ask_value_usd, dedupe_key, created_at
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
      dedupeKey: row.dedupe_key,
      createdAt: row.created_at
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
      created_at: string;
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
      RETURNING id, status, source, category, location, ask_value_usd, dedupe_key, created_at
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
      dedupeKey: row.dedupe_key,
      createdAt: row.created_at
    };
  }

  async listOpportunities(options: OpportunityListOptions): Promise<OpportunityRecord[]> {
    const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
    const values: Array<string | number> = [limit];

    const whereStatus = options.status
      ? (() => {
          values.push(options.status);
          return "WHERE status = $2";
        })()
      : "";

    const result = await this.pool.query<{
      id: number;
      status: string;
      source: string;
      category: string;
      location: string;
      ask_value_usd: string;
      dedupe_key: string;
      created_at: string;
    }>(
      `
      SELECT id, status, source, category, location, ask_value_usd, dedupe_key, created_at
      FROM opportunities
      ${whereStatus}
      ORDER BY created_at DESC
      LIMIT $1
      `,
      values
    );

    return result.rows.map((row) => ({
      id: row.id,
      status: row.status,
      source: row.source,
      category: row.category,
      location: row.location,
      askValueUsd: Number(row.ask_value_usd),
      dedupeKey: row.dedupe_key,
      createdAt: row.created_at
    }));
  }

  async recordValuation(input: RecordValuationInput): Promise<ValuationRecord> {
    await this.pool.query("BEGIN");

    try {
      let itemId = input.itemId;

      if (!itemId) {
        const itemInsert = await this.pool.query<{ id: number }>(
          `
          INSERT INTO items (title, category, condition, est_value_usd)
          VALUES ($1, $2, $3, $4)
          RETURNING id
          `,
          [input.title, input.category, input.condition ?? null, input.estimatedValueUsd]
        );
        itemId = itemInsert.rows[0].id;
      } else {
        await this.pool.query(
          `
          UPDATE items
          SET est_value_usd = $1, updated_at = NOW()
          WHERE id = $2
          `,
          [input.estimatedValueUsd, itemId]
        );
      }

      const valuationInsert = await this.pool.query<{
        id: number;
        item_id: number;
        estimated_value_usd: string;
        confidence_score: string;
        model_version: string;
      }>(
        `
        INSERT INTO item_valuations (
          item_id,
          model_version,
          estimated_value_usd,
          confidence_score,
          input_comps
        )
        VALUES ($1, $2, $3, $4, $5::jsonb)
        RETURNING id, item_id, estimated_value_usd, confidence_score, model_version
        `,
        [
          itemId,
          input.modelVersion,
          input.estimatedValueUsd,
          input.confidenceScore,
          JSON.stringify(input.comps)
        ]
      );

      await this.pool.query("COMMIT");

      const row = valuationInsert.rows[0];

      return {
        valuationId: row.id,
        itemId: row.item_id,
        estimatedValueUsd: Number(row.estimated_value_usd),
        confidenceScore: Number(row.confidence_score),
        modelVersion: row.model_version
      };
    } catch (error) {
      await this.pool.query("ROLLBACK");
      throw error;
    }
  }

  async listScoringCandidates(limit: number): Promise<ScoringCandidateRecord[]> {
    const boundedLimit = Math.max(1, Math.min(limit, 200));
    const result = await this.pool.query<{
      id: number;
      ask_value_usd: string;
      source: string;
      category: string;
      seller_rep_score: string | null;
      expires_at: string | null;
    }>(
      `
      SELECT id, ask_value_usd, source, category, seller_rep_score, expires_at
      FROM opportunities
      WHERE status IN ('sourcing', 'screened')
      ORDER BY created_at DESC
      LIMIT $1
      `,
      [boundedLimit]
    );

    return result.rows.map((row) => ({
      opportunityId: row.id,
      targetValueUsd: Number(row.ask_value_usd),
      source: row.source,
      category: row.category,
      sellerRepScore: row.seller_rep_score ? Number(row.seller_rep_score) : undefined,
      expiresAt: row.expires_at ?? undefined
    }));
  }

  async getPolicyRule(platform: string, action: string): Promise<PolicyRuleRecord | null> {
    const result = await this.pool.query<{
      platform: string;
      action: string;
      allowed: boolean;
      reason: string;
    }>(
      `
      SELECT platform, action, allowed, reason
      FROM policy_rules
      WHERE platform = $1 AND action = $2
      LIMIT 1
      `,
      [platform, action]
    );

    if (!result.rowCount || result.rowCount < 1) {
      return null;
    }

    return result.rows[0];
  }

  async listPolicyRules(options: PolicyRuleListOptions): Promise<PolicyRuleRecord[]> {
    const platform = options.platform?.trim().toLowerCase();
    const limit = Math.max(1, Math.min(options.limit ?? 200, 500));

    const result = platform
      ? await this.pool.query<PolicyRuleRecord>(
          `
          SELECT platform, action, allowed, reason
          FROM policy_rules
          WHERE platform = $1
          ORDER BY platform ASC, action ASC
          LIMIT $2
          `,
          [platform, limit]
        )
      : await this.pool.query<PolicyRuleRecord>(
          `
          SELECT platform, action, allowed, reason
          FROM policy_rules
          ORDER BY platform ASC, action ASC
          LIMIT $1
          `,
          [limit]
        );

    return result.rows;
  }

  async getOpportunityById(id: number): Promise<OpportunitySummary | null> {
    const result = await this.pool.query<{ id: number; status: string }>(
      `
      SELECT id, status
      FROM opportunities
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );

    if (!result.rowCount || result.rowCount < 1) {
      return null;
    }

    return result.rows[0];
  }

  async createOfferDraft(opportunityId: number, offerTerms: Record<string, unknown>): Promise<OfferRecord> {
    const result = await this.pool.query<{
      id: number;
      opportunity_id: number;
      status: OfferStatus;
      offer_terms: Record<string, unknown>;
      sent_by_human_id: string | null;
      updated_at: string;
    }>(
      `
      INSERT INTO offers (opportunity_id, offer_terms, status)
      VALUES ($1, $2::jsonb, 'draft')
      RETURNING id, opportunity_id, status, offer_terms, sent_by_human_id, updated_at
      `,
      [opportunityId, JSON.stringify(offerTerms)]
    );

    const row = result.rows[0];

    return {
      id: row.id,
      opportunityId: row.opportunity_id,
      status: row.status,
      offerTerms: row.offer_terms,
      sentByHumanId: row.sent_by_human_id ?? undefined,
      updatedAt: row.updated_at
    };
  }

  async getOfferById(offerId: number): Promise<OfferRecord | null> {
    const result = await this.pool.query<{
      id: number;
      opportunity_id: number;
      status: OfferStatus;
      offer_terms: Record<string, unknown>;
      sent_by_human_id: string | null;
      updated_at: string;
    }>(
      `
      SELECT id, opportunity_id, status, offer_terms, sent_by_human_id, updated_at
      FROM offers
      WHERE id = $1
      LIMIT 1
      `,
      [offerId]
    );

    if (!result.rowCount || result.rowCount < 1) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      opportunityId: row.opportunity_id,
      status: row.status,
      offerTerms: row.offer_terms,
      sentByHumanId: row.sent_by_human_id ?? undefined,
      updatedAt: row.updated_at
    };
  }

  async updateOfferStatus(offerId: number, status: OfferStatus, sentByHumanId?: string): Promise<OfferRecord> {
    const result = await this.pool.query<{
      id: number;
      opportunity_id: number;
      status: OfferStatus;
      offer_terms: Record<string, unknown>;
      sent_by_human_id: string | null;
      updated_at: string;
    }>(
      `
      UPDATE offers
      SET
        status = $2,
        sent_by_human_id = COALESCE($3, sent_by_human_id),
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, opportunity_id, status, offer_terms, sent_by_human_id, updated_at
      `,
      [offerId, status, sentByHumanId ?? null]
    );

    if (!result.rowCount || result.rowCount < 1) {
      throw new Error(`Offer ${offerId} not found`);
    }

    const row = result.rows[0];
    return {
      id: row.id,
      opportunityId: row.opportunity_id,
      status: row.status,
      offerTerms: row.offer_terms,
      sentByHumanId: row.sent_by_human_id ?? undefined,
      updatedAt: row.updated_at
    };
  }

  async createTaskRecord(input: {
    type: "inspect" | "pickup" | "meet" | "ship";
    assignee?: string;
    providerName: string;
    providerTaskId: string;
  }): Promise<TaskRecord> {
    const result = await this.pool.query<{
      id: number;
      type: "inspect" | "pickup" | "meet" | "ship";
      assignee: string | null;
      status: TaskStatus;
      provider_name: string;
      provider_task_id: string | null;
      updated_at: string;
    }>(
      `
      INSERT INTO tasks (type, assignee, status, provider_name, provider_task_id)
      VALUES ($1, $2, 'queued', $3, $4)
      RETURNING id, type, assignee, status, provider_name, provider_task_id, updated_at
      `,
      [input.type, input.assignee ?? null, input.providerName, input.providerTaskId]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      type: row.type,
      assignee: row.assignee ?? undefined,
      status: row.status,
      providerName: row.provider_name,
      providerTaskId: row.provider_task_id ?? undefined,
      updatedAt: row.updated_at
    };
  }

  async getTaskById(taskId: number): Promise<TaskRecord | null> {
    const result = await this.pool.query<{
      id: number;
      type: "inspect" | "pickup" | "meet" | "ship";
      assignee: string | null;
      status: TaskStatus;
      provider_name: string;
      provider_task_id: string | null;
      updated_at: string;
    }>(
      `
      SELECT id, type, assignee, status, provider_name, provider_task_id, updated_at
      FROM tasks
      WHERE id = $1
      LIMIT 1
      `,
      [taskId]
    );

    if (!result.rowCount || result.rowCount < 1) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      type: row.type,
      assignee: row.assignee ?? undefined,
      status: row.status,
      providerName: row.provider_name,
      providerTaskId: row.provider_task_id ?? undefined,
      updatedAt: row.updated_at
    };
  }

  async updateTaskStatusByProviderTaskId(providerTaskId: string, status: TaskStatus): Promise<TaskRecord | null> {
    const result = await this.pool.query<{
      id: number;
      type: "inspect" | "pickup" | "meet" | "ship";
      assignee: string | null;
      status: TaskStatus;
      provider_name: string;
      provider_task_id: string | null;
      updated_at: string;
    }>(
      `
      UPDATE tasks
      SET status = $2, updated_at = NOW()
      WHERE provider_task_id = $1
      RETURNING id, type, assignee, status, provider_name, provider_task_id, updated_at
      `,
      [providerTaskId, status]
    );

    if (!result.rowCount || result.rowCount < 1) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      type: row.type,
      assignee: row.assignee ?? undefined,
      status: row.status,
      providerName: row.provider_name,
      providerTaskId: row.provider_task_id ?? undefined,
      updatedAt: row.updated_at
    };
  }

  async createEvidenceRecord(input: {
    taskId: number;
    mediaUrl: string;
    checksum: string;
    geotag?: string;
    capturedAt: string;
  }): Promise<EvidenceRecord> {
    const result = await this.pool.query<{
      id: number;
      task_id: number;
      media_url: string;
      checksum: string;
      geotag: string | null;
      captured_at: string;
      created_at: string;
    }>(
      `
      INSERT INTO evidence (task_id, media_url, checksum, geotag, captured_at)
      VALUES ($1, $2, $3, $4, $5::timestamptz)
      RETURNING id, task_id, media_url, checksum, geotag, captured_at, created_at
      `,
      [input.taskId, input.mediaUrl, input.checksum, input.geotag ?? null, input.capturedAt]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      taskId: row.task_id,
      mediaUrl: row.media_url,
      checksum: row.checksum,
      geotag: row.geotag ?? undefined,
      capturedAt: row.captured_at,
      createdAt: row.created_at
    };
  }

  async listEvidenceByTaskId(taskId: number): Promise<EvidenceRecord[]> {
    const result = await this.pool.query<{
      id: number;
      task_id: number;
      media_url: string;
      checksum: string;
      geotag: string | null;
      captured_at: string;
      created_at: string;
    }>(
      `
      SELECT id, task_id, media_url, checksum, geotag, captured_at, created_at
      FROM evidence
      WHERE task_id = $1
      ORDER BY created_at DESC
      `,
      [taskId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      mediaUrl: row.media_url,
      checksum: row.checksum,
      geotag: row.geotag ?? undefined,
      capturedAt: row.captured_at,
      createdAt: row.created_at
    }));
  }

  async createPortfolioPosition(input: {
    title: string;
    category?: string;
    condition?: string;
    location?: string;
    acquisitionValueUsd?: number;
  }): Promise<PortfolioPositionRecord> {
    await this.pool.query("BEGIN");

    try {
      const itemResult = await this.pool.query<{ id: number }>(
        `
        INSERT INTO items (title, category, condition, location, est_value_usd)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
        `,
        [
          input.title,
          input.category ?? "uncategorized",
          input.condition ?? null,
          input.location ?? null,
          input.acquisitionValueUsd ?? null
        ]
      );

      const positionResult = await this.pool.query<{
        id: number;
        item_id: number;
        acquired_at: string;
        acquisition_value_usd: string | null;
        current_status: PortfolioStatus;
        created_at: string;
        updated_at: string;
      }>(
        `
        INSERT INTO portfolio_positions (item_id, acquisition_value_usd, current_status)
        VALUES ($1, $2, 'seeded')
        RETURNING id, item_id, acquired_at, acquisition_value_usd, current_status, created_at, updated_at
        `,
        [itemResult.rows[0].id, input.acquisitionValueUsd ?? null]
      );

      await this.pool.query("COMMIT");
      const row = positionResult.rows[0];

      return {
        id: row.id,
        itemId: row.item_id,
        acquiredAt: row.acquired_at,
        acquisitionValueUsd: row.acquisition_value_usd ? Number(row.acquisition_value_usd) : undefined,
        currentStatus: row.current_status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      await this.pool.query("ROLLBACK");
      throw error;
    }
  }

  async getPortfolioPositionById(positionId: number): Promise<PortfolioPositionRecord | null> {
    const result = await this.pool.query<{
      id: number;
      item_id: number;
      acquired_at: string;
      acquisition_value_usd: string | null;
      current_status: PortfolioStatus;
      created_at: string;
      updated_at: string;
    }>(
      `
      SELECT id, item_id, acquired_at, acquisition_value_usd, current_status, created_at, updated_at
      FROM portfolio_positions
      WHERE id = $1
      LIMIT 1
      `,
      [positionId]
    );

    if (!result.rowCount || result.rowCount < 1) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      itemId: row.item_id,
      acquiredAt: row.acquired_at,
      acquisitionValueUsd: row.acquisition_value_usd ? Number(row.acquisition_value_usd) : undefined,
      currentStatus: row.current_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async updatePortfolioPositionStatus(
    positionId: number,
    status: PortfolioStatus
  ): Promise<PortfolioPositionRecord | null> {
    const result = await this.pool.query<{
      id: number;
      item_id: number;
      acquired_at: string;
      acquisition_value_usd: string | null;
      current_status: PortfolioStatus;
      created_at: string;
      updated_at: string;
    }>(
      `
      UPDATE portfolio_positions
      SET current_status = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING id, item_id, acquired_at, acquisition_value_usd, current_status, created_at, updated_at
      `,
      [positionId, status]
    );

    if (!result.rowCount || result.rowCount < 1) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      itemId: row.item_id,
      acquiredAt: row.acquired_at,
      acquisitionValueUsd: row.acquisition_value_usd ? Number(row.acquisition_value_usd) : undefined,
      currentStatus: row.current_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async createPortfolioVerificationChecklist(input: {
    portfolioPositionId: number;
    checks: Record<string, boolean>;
    passed: boolean;
    outcomeStatus: "verified" | "failed" | "disputed";
    createdByUserId: string;
    notes?: string;
  }): Promise<PortfolioVerificationChecklistRecord> {
    const result = await this.pool.query<{
      id: number;
      portfolio_position_id: number;
      checks: Record<string, boolean>;
      passed: boolean;
      outcome_status: "verified" | "failed" | "disputed";
      created_by_user_id: string;
      notes: string | null;
      created_at: string;
    }>(
      `
      INSERT INTO portfolio_verification_checklists (
        portfolio_position_id,
        checks,
        passed,
        outcome_status,
        created_by_user_id,
        notes
      )
      VALUES ($1, $2::jsonb, $3, $4, $5, $6)
      RETURNING
        id,
        portfolio_position_id,
        checks,
        passed,
        outcome_status,
        created_by_user_id,
        notes,
        created_at
      `,
      [
        input.portfolioPositionId,
        JSON.stringify(input.checks),
        input.passed,
        input.outcomeStatus,
        input.createdByUserId,
        input.notes ?? null
      ]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      portfolioPositionId: row.portfolio_position_id,
      checks: row.checks,
      passed: row.passed,
      outcomeStatus: row.outcome_status,
      createdByUserId: row.created_by_user_id,
      notes: row.notes ?? undefined,
      createdAt: row.created_at
    };
  }

  async listPortfolioVerificationChecklists(
    portfolioPositionId: number
  ): Promise<PortfolioVerificationChecklistRecord[]> {
    const result = await this.pool.query<{
      id: number;
      portfolio_position_id: number;
      checks: Record<string, boolean>;
      passed: boolean;
      outcome_status: "verified" | "failed" | "disputed";
      created_by_user_id: string;
      notes: string | null;
      created_at: string;
    }>(
      `
      SELECT
        id,
        portfolio_position_id,
        checks,
        passed,
        outcome_status,
        created_by_user_id,
        notes,
        created_at
      FROM portfolio_verification_checklists
      WHERE portfolio_position_id = $1
      ORDER BY created_at DESC
      `,
      [portfolioPositionId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      portfolioPositionId: row.portfolio_position_id,
      checks: row.checks,
      passed: row.passed,
      outcomeStatus: row.outcome_status,
      createdByUserId: row.created_by_user_id,
      notes: row.notes ?? undefined,
      createdAt: row.created_at
    }));
  }

  async computeDashboardMetrics(seedCostUsd: number): Promise<DashboardMetrics> {
    const normalizedSeedCost = seedCostUsd > 0 ? seedCostUsd : 1;

    const currentValueResult = await this.pool.query<{ total_value: string | null }>(
      `
      SELECT COALESCE(SUM(i.est_value_usd), 0)::text AS total_value
      FROM portfolio_positions pp
      JOIN items i ON i.id = pp.item_id
      WHERE pp.current_status IN (
        'seeded',
        'sourcing',
        'screened',
        'negotiating',
        'accepted_pending_verification',
        'verified',
        'completed'
      )
      `
    );

    const offerRateResult = await this.pool.query<{ sent_count: string; total_count: string }>(
      `
      SELECT
        COUNT(*) FILTER (WHERE status = 'sent')::text AS sent_count,
        COUNT(*)::text AS total_count
      FROM offers
      `
    );

    const cycleTimeResult = await this.pool.query<{ median_days: string | null }>(
      `
      SELECT
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400
        )::text AS median_days
      FROM portfolio_positions
      WHERE current_status = 'completed'
      `
    );

    const fraudLossResult = await this.pool.query<{ disputed_value: string | null; total_value: string | null }>(
      `
      SELECT
        COALESCE(SUM(CASE WHEN pp.current_status = 'disputed' THEN pp.acquisition_value_usd ELSE 0 END), 0)::text AS disputed_value,
        COALESCE(SUM(pp.acquisition_value_usd), 0)::text AS total_value
      FROM portfolio_positions pp
      `
    );

    const activeTasksResult = await this.pool.query<{ active_count: string }>(
      `
      SELECT COUNT(*)::text AS active_count
      FROM tasks
      WHERE status IN ('queued', 'in_progress')
      `
    );

    const totalValue = Number(currentValueResult.rows[0].total_value ?? 0);
    const sentCount = Number(offerRateResult.rows[0].sent_count ?? 0);
    const totalOfferCount = Number(offerRateResult.rows[0].total_count ?? 0);
    const medianCycleTimeDays = Number(cycleTimeResult.rows[0].median_days ?? 0);
    const disputedValue = Number(fraudLossResult.rows[0].disputed_value ?? 0);
    const totalAcquisitionValue = Number(fraudLossResult.rows[0].total_value ?? 0);
    const activeTasks = Number(activeTasksResult.rows[0].active_count ?? 0);

    return {
      valueMultiple: Number((totalValue / normalizedSeedCost).toFixed(4)),
      closeRate: Number((totalOfferCount > 0 ? sentCount / totalOfferCount : 0).toFixed(4)),
      medianCycleTimeDays: Number(medianCycleTimeDays.toFixed(4)),
      fraudLossPct: Number((totalAcquisitionValue > 0 ? (disputedValue / totalAcquisitionValue) * 100 : 0).toFixed(4)),
      activeTasks
    };
  }

  async createKpiSnapshot(metrics: DashboardMetrics): Promise<KpiSnapshotRecord> {
    const result = await this.pool.query<{
      id: number;
      value_multiple: string;
      close_rate: string;
      median_cycle_time_days: string;
      fraud_loss_pct: string;
      active_tasks: number;
      created_at: string;
    }>(
      `
      INSERT INTO kpi_snapshots (
        value_multiple,
        close_rate,
        median_cycle_time_days,
        fraud_loss_pct,
        active_tasks
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, value_multiple, close_rate, median_cycle_time_days, fraud_loss_pct, active_tasks, created_at
      `,
      [
        metrics.valueMultiple,
        metrics.closeRate,
        metrics.medianCycleTimeDays,
        metrics.fraudLossPct,
        metrics.activeTasks
      ]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      valueMultiple: Number(row.value_multiple),
      closeRate: Number(row.close_rate),
      medianCycleTimeDays: Number(row.median_cycle_time_days),
      fraudLossPct: Number(row.fraud_loss_pct),
      activeTasks: row.active_tasks,
      createdAt: row.created_at
    };
  }

  async listKpiSnapshots(limit: number): Promise<KpiSnapshotRecord[]> {
    const boundedLimit = Math.max(1, Math.min(limit, 200));
    const result = await this.pool.query<{
      id: number;
      value_multiple: string;
      close_rate: string;
      median_cycle_time_days: string;
      fraud_loss_pct: string;
      active_tasks: number;
      created_at: string;
    }>(
      `
      SELECT id, value_multiple, close_rate, median_cycle_time_days, fraud_loss_pct, active_tasks, created_at
      FROM kpi_snapshots
      ORDER BY created_at DESC
      LIMIT $1
      `,
      [boundedLimit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      valueMultiple: Number(row.value_multiple),
      closeRate: Number(row.close_rate),
      medianCycleTimeDays: Number(row.median_cycle_time_days),
      fraudLossPct: Number(row.fraud_loss_pct),
      activeTasks: row.active_tasks,
      createdAt: row.created_at
    }));
  }

  async getLatestKpiSnapshot(): Promise<KpiSnapshotRecord | null> {
    const snapshots = await this.listKpiSnapshots(1);
    return snapshots.length > 0 ? snapshots[0] : null;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
