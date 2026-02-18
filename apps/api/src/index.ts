import "dotenv/config";

import { createHash } from "node:crypto";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";

import {
  type AuthRepository,
  type AuthUser,
  type OfferStatus,
  type PortfolioPositionRecord,
  type PolicyRuleInput,
  type TaskStatus,
  type UserRole,
  type ValuationCompInput,
  PgAuthRepository
} from "./auth-repository.js";
import { hashApiKey } from "./hash-api-key.js";
import {
  canTransitionPortfolioStatus,
  isValidPortfolioStatus,
  type PortfolioStatus
} from "./portfolio-state-machine.js";
import { rankCandidates } from "./scoring.js";
import { createTaskProviderFromEnv, type TaskProvider } from "./task-provider.js";
import { computeValuation } from "./valuation.js";

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

type BuildServerOptions = {
  authRepository?: AuthRepository;
  taskProvider?: TaskProvider;
};

type OpportunityIntakeBody = {
  source?: string;
  category?: string;
  location?: string;
  title?: string;
  priceUsd?: number;
};

type OpportunityListQuery = {
  status?: string;
  limit?: number;
};

type ValuationRequestBody = {
  itemId?: number;
  title?: string;
  category?: string;
  condition?: string;
  baseValueUsd?: number;
  comps?: ValuationCompInput[];
};

type ScoringRequestBody = {
  currentItemValueUsd?: number;
  limit?: number;
};

type OutboundActionBody = {
  platform?: string;
  action?: string;
  payload?: Record<string, unknown>;
};

type OfferDraftBody = {
  opportunityId?: number;
  offerTerms?: Record<string, unknown>;
};

type OfferParams = {
  offerId: string;
};

type TaskCreateBody = {
  type?: "inspect" | "pickup" | "meet" | "ship";
  assignee?: string;
  metadata?: Record<string, unknown>;
};

type TaskWebhookBody = {
  providerTaskId?: string;
  status?: TaskStatus;
};

type TaskParams = {
  taskId: string;
};

type EvidenceCreateBody = {
  mediaUrl?: string;
  checksum?: string;
  geotag?: string;
  capturedAt?: string;
};

type PortfolioCreateBody = {
  title?: string;
  category?: string;
  condition?: string;
  location?: string;
  acquisitionValueUsd?: number;
};

type PortfolioTransitionBody = {
  targetStatus?: string;
};

type PortfolioVerificationBody = {
  identityConfirmed?: boolean;
  conditionConfirmed?: boolean;
  receiptProvided?: boolean;
  ownershipProofProvided?: boolean;
  notes?: string;
  disputed?: boolean;
};

type PortfolioParams = {
  positionId: string;
};

type DashboardQuery = {
  seedCostUsd?: number;
  limit?: number;
};

type DashboardSnapshotBody = {
  seedCostUsd?: number;
};

type ValidationResult<T> = { valid: true; value: T } | { valid: false; error: string };

const normalizeText = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

const parseOpportunityInput = (
  body: OpportunityIntakeBody
): ValidationResult<{
  source: string;
  category: string;
  location: string;
  title: string;
  askValueUsd: number;
  normalizedPayload: Record<string, unknown>;
  dedupeKey: string;
}> => {
  const source = typeof body.source === "string" ? normalizeText(body.source) : "";
  const category = typeof body.category === "string" ? normalizeText(body.category) : "";
  const location = typeof body.location === "string" ? normalizeText(body.location) : "";
  const title = typeof body.title === "string" && body.title.trim().length > 0 ? body.title.trim() : "untitled";
  const priceUsd = typeof body.priceUsd === "number" ? body.priceUsd : NaN;

  if (!source || !category || !location || !Number.isFinite(priceUsd) || priceUsd <= 0) {
    return {
      valid: false,
      error: "source, category, location, and positive priceUsd are required"
    };
  }

  const roundedPrice = Number(priceUsd.toFixed(2));
  const dedupeKey = hashApiKey(`${source}|${category}|${location}|${title.toLowerCase()}|${roundedPrice.toFixed(2)}`);

  return {
    valid: true,
    value: {
      source,
      category,
      location,
      title,
      askValueUsd: roundedPrice,
      dedupeKey,
      normalizedPayload: {
        source,
        category,
        location,
        title,
        priceUsd: roundedPrice,
        normalizationVersion: 1
      }
    }
  };
};

const parseValuationInput = (body: ValuationRequestBody) => {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const category = typeof body.category === "string" ? normalizeText(body.category) : "";
  const condition = typeof body.condition === "string" ? normalizeText(body.condition) : undefined;
  const baseValueUsd = typeof body.baseValueUsd === "number" ? body.baseValueUsd : undefined;
  const itemId = typeof body.itemId === "number" ? body.itemId : undefined;

  const comps = Array.isArray(body.comps)
    ? body.comps
        .filter((comp) => comp && typeof comp.priceUsd === "number" && comp.priceUsd > 0)
        .map((comp) => ({ priceUsd: Number(comp.priceUsd.toFixed(2)), source: comp.source }))
    : [];

  if (!title || !category) {
    return { valid: false as const, error: "title and category are required" };
  }

  if ((baseValueUsd === undefined || baseValueUsd <= 0) && comps.length === 0) {
    return {
      valid: false as const,
      error: "Provide at least one positive comp or a positive baseValueUsd"
    };
  }

  return {
    valid: true as const,
    value: {
      itemId,
      title,
      category,
      condition,
      baseValueUsd,
      comps
    }
  };
};

const getDefaultAuthRepository = () => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for auth-enabled API routes");
  }

  return new PgAuthRepository(databaseUrl);
};

export const buildServer = (options: BuildServerOptions = {}) => {
  const app = Fastify({ logger: true });
  const authRepository = options.authRepository ?? getDefaultAuthRepository();
  const taskProvider = options.taskProvider ?? createTaskProviderFromEnv();
  const allowedOfferTransitions: Record<OfferStatus, OfferStatus[]> = {
    draft: ["approved", "rejected"],
    approved: ["sent", "rejected"],
    rejected: [],
    sent: []
  };

  const evaluatePolicy = async (
    platform: string,
    action: string,
    actorUserId: number
  ): Promise<{ allowed: boolean; reason: string; policyCode: string }> => {
    const normalizedPlatform = normalizeText(platform);
    const normalizedAction = normalizeText(action);
    const rule = await authRepository.getPolicyRule(normalizedPlatform, normalizedAction);

    const allowed = rule ? rule.allowed : true;
    const reason = rule ? rule.reason : "No explicit deny rule found.";
    const policyCode = rule
      ? `POLICY_${normalizedPlatform.toUpperCase()}_${normalizedAction.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`
      : "POLICY_DEFAULT_ALLOW";

    await authRepository.writeEvent({
      eventType: "policy.decision",
      entityType: "policy_rule",
      entityId: `${normalizedPlatform}:${normalizedAction}`,
      payload: {
        actorUserId,
        allowed,
        reason,
        policyCode
      }
    });

    return { allowed, reason, policyCode };
  };

  const requireRole = (allowedRoles: UserRole[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const apiKey = request.headers["x-api-key"];

      if (typeof apiKey !== "string" || apiKey.length === 0) {
        await reply.status(401).send({ error: "Missing x-api-key header" });
        return;
      }

      const user = await authRepository.findUserByApiKeyHash(hashApiKey(apiKey));

      if (!user) {
        await reply.status(401).send({ error: "Invalid API key" });
        return;
      }

      if (!allowedRoles.includes(user.role)) {
        await reply.status(403).send({ error: "Insufficient role" });
        return;
      }

      request.authUser = user;
    };
  };

  const validTaskStatuses: TaskStatus[] = ["queued", "in_progress", "completed", "failed"];

  const parsePositiveId = (rawValue: string) => {
    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return null;
    }

    return parsed;
  };

  const resolveEvidenceChecksum = (mediaUrl: string, capturedAt: string, providedChecksum?: string) => {
    if (providedChecksum && providedChecksum.trim().length > 0) {
      return providedChecksum.trim().toLowerCase();
    }

    return createHash("sha256").update(`${mediaUrl}|${capturedAt}`).digest("hex");
  };

  const parseVerificationChecks = (body: PortfolioVerificationBody) => {
    const requiredChecks = {
      identityConfirmed: body.identityConfirmed,
      conditionConfirmed: body.conditionConfirmed,
      receiptProvided: body.receiptProvided,
      ownershipProofProvided: body.ownershipProofProvided
    };

    const hasMissing = Object.values(requiredChecks).some((value) => typeof value !== "boolean");

    if (hasMissing) {
      return {
        valid: false as const,
        error: "identityConfirmed, conditionConfirmed, receiptProvided, and ownershipProofProvided are required booleans"
      };
    }

    const checks = {
      identityConfirmed: requiredChecks.identityConfirmed as boolean,
      conditionConfirmed: requiredChecks.conditionConfirmed as boolean,
      receiptProvided: requiredChecks.receiptProvided as boolean,
      ownershipProofProvided: requiredChecks.ownershipProofProvided as boolean
    };

    const passed = Object.values(checks).every((value) => value);

    return { valid: true as const, checks, passed };
  };

  const transitionPortfolioPosition = async (
    position: PortfolioPositionRecord,
    targetStatus: PortfolioStatus,
    actorUserId: number
  ) => {
    if (!canTransitionPortfolioStatus(position.currentStatus, targetStatus)) {
      return {
        ok: false as const,
        statusCode: 409,
        error: `Invalid transition from ${position.currentStatus} to ${targetStatus}`
      };
    }

    const updated = await authRepository.updatePortfolioPositionStatus(position.id, targetStatus);

    if (!updated) {
      return { ok: false as const, statusCode: 404, error: "Portfolio position not found" };
    }

    await authRepository.writeEvent({
      eventType: "portfolio.status_changed",
      entityType: "portfolio_position",
      entityId: String(updated.id),
      payload: {
        actorUserId,
        from: position.currentStatus,
        to: updated.currentStatus
      }
    });

    return { ok: true as const, position: updated };
  };

  const changeOfferStatus = async (
    offerId: number,
    targetStatus: OfferStatus,
    actorUserId: number
  ) => {
    const existing = await authRepository.getOfferById(offerId);

    if (!existing) {
      return { ok: false as const, statusCode: 404, error: "Offer not found" };
    }

    if (!allowedOfferTransitions[existing.status].includes(targetStatus)) {
      return {
        ok: false as const,
        statusCode: 409,
        error: `Invalid transition from ${existing.status} to ${targetStatus}`
      };
    }

    const updated = await authRepository.updateOfferStatus(
      offerId,
      targetStatus,
      targetStatus === "sent" ? String(actorUserId) : undefined
    );

    await authRepository.writeEvent({
      eventType: "offer.status_changed",
      entityType: "offer",
      entityId: String(updated.id),
      payload: {
        from: existing.status,
        to: targetStatus,
        actorUserId
      }
    });

    return { ok: true as const, offer: updated };
  };

  app.get("/health", async () => {
    return {
      service: "api",
      status: "ok",
      timestamp: new Date().toISOString()
    };
  });

  app.post<{ Body: { apiKey?: string } }>("/auth/login", async (request, reply) => {
    const apiKey = request.body.apiKey;

    if (typeof apiKey !== "string" || apiKey.length === 0) {
      return reply.status(400).send({ error: "apiKey is required" });
    }

    const user = await authRepository.findUserByApiKeyHash(hashApiKey(apiKey));

    if (!user) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    await authRepository.writeEvent({
      eventType: "auth.login",
      entityType: "user",
      entityId: String(user.id),
      payload: {
        role: user.role
      }
    });

    return {
      id: user.id,
      email: user.email,
      role: user.role
    };
  });

  app.get("/auth/me", { preHandler: requireRole(["admin", "operator", "reviewer"]) }, async (request) => {
    return request.authUser;
  });

  app.post<{ Body: PolicyRuleInput }>(
    "/admin/policy-rules",
    { preHandler: requireRole(["admin"]) },
    async (request, reply) => {
      const user = request.authUser;

      if (!user) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const payload = request.body;

      await authRepository.upsertPolicyRule(payload);
      await authRepository.writeEvent({
        eventType: "critical.policy_rule_upsert",
        entityType: "policy_rule",
        entityId: `${payload.platform}:${payload.action}`,
        payload: {
          actorUserId: user.id,
          role: user.role,
          allowed: payload.allowed
        }
      });

      return reply.status(200).send({ status: "ok" });
    }
  );

  app.post<{ Body: OpportunityIntakeBody }>(
    "/opportunities",
    { preHandler: requireRole(["admin", "operator"]) },
    async (request, reply) => {
      const user = request.authUser;

      if (!user) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const parsed = parseOpportunityInput(request.body);

      if (!parsed.valid) {
        return reply.status(400).send({ error: parsed.error });
      }

      const existing = await authRepository.findOpportunityByDedupeKey(parsed.value.dedupeKey);

      if (existing) {
        return reply.status(409).send({
          error: "Duplicate opportunity",
          opportunityId: existing.id
        });
      }

      const created = await authRepository.createOpportunity(parsed.value);
      await authRepository.writeEvent({
        eventType: "opportunity.created",
        entityType: "opportunity",
        entityId: String(created.id),
        payload: {
          actorUserId: user.id,
          role: user.role,
          source: created.source,
          category: created.category
        }
      });

      return reply.status(201).send(created);
    }
  );

  app.get<{ Querystring: OpportunityListQuery }>(
    "/opportunities",
    { preHandler: requireRole(["admin", "operator", "reviewer"]) },
    async (request, reply) => {
      const user = request.authUser;

      if (!user) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const opportunities = await authRepository.listOpportunities({
        status: typeof request.query.status === "string" ? request.query.status : undefined,
        limit: typeof request.query.limit === "number" ? request.query.limit : undefined
      });

      return reply.status(200).send({ opportunities });
    }
  );

  app.post<{ Body: ValuationRequestBody }>(
    "/valuations",
    { preHandler: requireRole(["admin", "operator"]) },
    async (request, reply) => {
      const user = request.authUser;

      if (!user) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const parsed = parseValuationInput(request.body);

      if (!parsed.valid) {
        return reply.status(400).send({ error: parsed.error });
      }

      const valuation = computeValuation({
        baseValueUsd: parsed.value.baseValueUsd,
        comps: parsed.value.comps
      });

      const saved = await authRepository.recordValuation({
        itemId: parsed.value.itemId,
        title: parsed.value.title,
        category: parsed.value.category,
        condition: parsed.value.condition,
        estimatedValueUsd: valuation.estimatedValueUsd,
        confidenceScore: valuation.confidenceScore,
        modelVersion: valuation.modelVersion,
        comps: parsed.value.comps
      });

      await authRepository.writeEvent({
        eventType: "valuation.recorded",
        entityType: "item",
        entityId: String(saved.itemId),
        payload: {
          actorUserId: user.id,
          role: user.role,
          valuationId: saved.valuationId,
          modelVersion: saved.modelVersion
        }
      });

      return reply.status(201).send(saved);
    }
  );

  app.post<{ Body: ScoringRequestBody }>(
    "/scoring/rank",
    { preHandler: requireRole(["admin", "operator"]) },
    async (request, reply) => {
      const currentItemValueUsd = request.body.currentItemValueUsd;
      const limit = typeof request.body.limit === "number" ? request.body.limit : 10;

      if (typeof currentItemValueUsd !== "number" || currentItemValueUsd <= 0) {
        return reply.status(400).send({ error: "currentItemValueUsd must be a positive number" });
      }

      const candidates = await authRepository.listScoringCandidates(limit);
      const ranked = rankCandidates(candidates, currentItemValueUsd, Math.max(1, Math.min(limit, 50)));

      return reply.status(200).send({ ranked });
    }
  );

  app.post<{ Body: OutboundActionBody }>(
    "/outbound/actions",
    { preHandler: requireRole(["admin", "operator"]) },
    async (request, reply) => {
      const user = request.authUser;

      if (!user) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const platform = typeof request.body.platform === "string" ? request.body.platform : "";
      const action = typeof request.body.action === "string" ? request.body.action : "";

      if (!platform || !action) {
        return reply.status(400).send({ error: "platform and action are required" });
      }

      const decision = await evaluatePolicy(platform, action, user.id);

      if (!decision.allowed) {
        return reply.status(403).send({
          allowed: false,
          policyCode: decision.policyCode,
          reason: decision.reason
        });
      }

      return reply.status(202).send({
        allowed: true,
        policyCode: decision.policyCode,
        status: "queued"
      });
    }
  );

  app.post<{ Body: OfferDraftBody }>(
    "/offers/draft",
    { preHandler: requireRole(["admin", "operator"]) },
    async (request, reply) => {
      const user = request.authUser;

      if (!user) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const opportunityId = request.body.opportunityId;
      const offerTerms = request.body.offerTerms;

      if (typeof opportunityId !== "number" || opportunityId <= 0 || !offerTerms || typeof offerTerms !== "object") {
        return reply.status(400).send({ error: "opportunityId and offerTerms are required" });
      }

      const opportunity = await authRepository.getOpportunityById(opportunityId);

      if (!opportunity) {
        return reply.status(404).send({ error: "Opportunity not found" });
      }

      const offer = await authRepository.createOfferDraft(opportunityId, offerTerms);
      await authRepository.writeEvent({
        eventType: "offer.created",
        entityType: "offer",
        entityId: String(offer.id),
        payload: {
          actorUserId: user.id,
          status: offer.status
        }
      });

      return reply.status(201).send(offer);
    }
  );

  app.get<{ Params: OfferParams }>(
    "/offers/:offerId",
    { preHandler: requireRole(["admin", "operator", "reviewer"]) },
    async (request, reply) => {
      const offerId = parsePositiveId(request.params.offerId);

      if (!offerId) {
        return reply.status(400).send({ error: "Invalid offerId" });
      }

      const offer = await authRepository.getOfferById(offerId);

      if (!offer) {
        return reply.status(404).send({ error: "Offer not found" });
      }

      return reply.status(200).send(offer);
    }
  );

  app.post<{ Params: OfferParams }>(
    "/offers/:offerId/approve",
    { preHandler: requireRole(["admin", "reviewer"]) },
    async (request, reply) => {
      const user = request.authUser;
      const offerId = parsePositiveId(request.params.offerId);

      if (!user) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      if (!offerId) {
        return reply.status(400).send({ error: "Invalid offerId" });
      }

      const result = await changeOfferStatus(offerId, "approved", user.id);

      if (!result.ok) {
        return reply.status(result.statusCode).send({ error: result.error });
      }

      return reply.status(200).send(result.offer);
    }
  );

  app.post<{ Params: OfferParams }>(
    "/offers/:offerId/reject",
    { preHandler: requireRole(["admin", "reviewer"]) },
    async (request, reply) => {
      const user = request.authUser;
      const offerId = parsePositiveId(request.params.offerId);

      if (!user) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      if (!offerId) {
        return reply.status(400).send({ error: "Invalid offerId" });
      }

      const result = await changeOfferStatus(offerId, "rejected", user.id);

      if (!result.ok) {
        return reply.status(result.statusCode).send({ error: result.error });
      }

      return reply.status(200).send(result.offer);
    }
  );

  app.post<{ Params: OfferParams }>(
    "/offers/:offerId/send",
    { preHandler: requireRole(["admin", "operator"]) },
    async (request, reply) => {
      const user = request.authUser;
      const offerId = parsePositiveId(request.params.offerId);

      if (!user) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      if (!offerId) {
        return reply.status(400).send({ error: "Invalid offerId" });
      }

      const result = await changeOfferStatus(offerId, "sent", user.id);

      if (!result.ok) {
        return reply.status(result.statusCode).send({ error: result.error });
      }

      return reply.status(200).send(result.offer);
    }
  );

  app.post<{ Body: TaskCreateBody }>(
    "/tasks",
    { preHandler: requireRole(["admin", "operator"]) },
    async (request, reply) => {
      const user = request.authUser;

      if (!user) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const taskType = request.body.type;

      if (!taskType || !["inspect", "pickup", "meet", "ship"].includes(taskType)) {
        return reply.status(400).send({ error: "type must be one of inspect, pickup, meet, ship" });
      }

      const providerTask = await taskProvider.createTask({
        type: taskType,
        assignee: request.body.assignee,
        metadata: request.body.metadata
      });

      const task = await authRepository.createTaskRecord({
        type: taskType,
        assignee: request.body.assignee,
        providerName: providerTask.providerName,
        providerTaskId: providerTask.providerTaskId
      });

      await authRepository.writeEvent({
        eventType: "task.created",
        entityType: "task",
        entityId: String(task.id),
        payload: {
          actorUserId: user.id,
          providerName: task.providerName,
          providerTaskId: task.providerTaskId
        }
      });

      return reply.status(201).send(task);
    }
  );

  app.post<{ Params: TaskParams; Body: EvidenceCreateBody }>(
    "/tasks/:taskId/evidence",
    { preHandler: requireRole(["admin", "operator"]) },
    async (request, reply) => {
      const user = request.authUser;
      const taskId = parsePositiveId(request.params.taskId);

      if (!user) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      if (!taskId) {
        return reply.status(400).send({ error: "Invalid taskId" });
      }

      const task = await authRepository.getTaskById(taskId);

      if (!task) {
        return reply.status(404).send({ error: "Task not found" });
      }

      const mediaUrl = typeof request.body.mediaUrl === "string" ? request.body.mediaUrl.trim() : "";
      const geotag = typeof request.body.geotag === "string" ? request.body.geotag.trim() : undefined;
      const capturedAtRaw =
        typeof request.body.capturedAt === "string" ? request.body.capturedAt : new Date().toISOString();

      if (!mediaUrl) {
        return reply.status(400).send({ error: "mediaUrl is required" });
      }

      if (Number.isNaN(new Date(capturedAtRaw).getTime())) {
        return reply.status(400).send({ error: "capturedAt must be a valid ISO datetime" });
      }

      const checksum = resolveEvidenceChecksum(mediaUrl, capturedAtRaw, request.body.checksum);
      const evidence = await authRepository.createEvidenceRecord({
        taskId,
        mediaUrl,
        checksum,
        geotag,
        capturedAt: capturedAtRaw
      });

      await authRepository.writeEvent({
        eventType: "evidence.recorded",
        entityType: "task",
        entityId: String(taskId),
        payload: {
          actorUserId: user.id,
          evidenceId: evidence.id,
          checksum: evidence.checksum
        }
      });

      return reply.status(201).send(evidence);
    }
  );

  app.get<{ Params: TaskParams }>(
    "/tasks/:taskId/evidence",
    { preHandler: requireRole(["admin", "operator", "reviewer"]) },
    async (request, reply) => {
      const taskId = parsePositiveId(request.params.taskId);

      if (!taskId) {
        return reply.status(400).send({ error: "Invalid taskId" });
      }

      const task = await authRepository.getTaskById(taskId);

      if (!task) {
        return reply.status(404).send({ error: "Task not found" });
      }

      const evidence = await authRepository.listEvidenceByTaskId(taskId);
      return reply.status(200).send({ evidence });
    }
  );

  app.post<{ Body: TaskWebhookBody }>("/tasks/webhook/provider", async (request, reply) => {
    const expectedToken = process.env.PROVIDER_WEBHOOK_TOKEN ?? "dev-webhook-token";
    const webhookToken = request.headers["x-webhook-token"];

    if (webhookToken !== expectedToken) {
      return reply.status(401).send({ error: "Invalid webhook token" });
    }

    const providerTaskId = request.body.providerTaskId;
    const status = request.body.status;

    if (
      typeof providerTaskId !== "string" ||
      providerTaskId.length === 0 ||
      !status ||
      !validTaskStatuses.includes(status)
    ) {
      return reply.status(400).send({ error: "providerTaskId and valid status are required" });
    }

    const task = await authRepository.updateTaskStatusByProviderTaskId(providerTaskId, status);

    if (!task) {
      return reply.status(404).send({ error: "Task not found" });
    }

    await authRepository.writeEvent({
      eventType: "task.status_changed",
      entityType: "task",
      entityId: String(task.id),
      payload: {
        providerTaskId,
        status
      }
    });

    return reply.status(200).send(task);
  });

  app.post<{ Body: PortfolioCreateBody }>(
    "/portfolio/positions",
    { preHandler: requireRole(["admin", "operator"]) },
    async (request, reply) => {
      const user = request.authUser;

      if (!user) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const title = typeof request.body.title === "string" ? request.body.title.trim() : "";
      const acquisitionValueUsd = request.body.acquisitionValueUsd;

      if (!title) {
        return reply.status(400).send({ error: "title is required" });
      }

      if (
        acquisitionValueUsd !== undefined &&
        (typeof acquisitionValueUsd !== "number" || !Number.isFinite(acquisitionValueUsd) || acquisitionValueUsd <= 0)
      ) {
        return reply.status(400).send({ error: "acquisitionValueUsd must be a positive number when provided" });
      }

      const position = await authRepository.createPortfolioPosition({
        title,
        category: request.body.category,
        condition: request.body.condition,
        location: request.body.location,
        acquisitionValueUsd
      });

      await authRepository.writeEvent({
        eventType: "portfolio.position_created",
        entityType: "portfolio_position",
        entityId: String(position.id),
        payload: {
          actorUserId: user.id,
          status: position.currentStatus
        }
      });

      return reply.status(201).send(position);
    }
  );

  app.get<{ Params: PortfolioParams }>(
    "/portfolio/positions/:positionId",
    { preHandler: requireRole(["admin", "operator", "reviewer"]) },
    async (request, reply) => {
      const positionId = parsePositiveId(request.params.positionId);

      if (!positionId) {
        return reply.status(400).send({ error: "Invalid positionId" });
      }

      const position = await authRepository.getPortfolioPositionById(positionId);

      if (!position) {
        return reply.status(404).send({ error: "Portfolio position not found" });
      }

      return reply.status(200).send(position);
    }
  );

  app.post<{ Params: PortfolioParams; Body: PortfolioTransitionBody }>(
    "/portfolio/positions/:positionId/transition",
    { preHandler: requireRole(["admin", "operator"]) },
    async (request, reply) => {
      const user = request.authUser;
      const positionId = parsePositiveId(request.params.positionId);
      const targetStatusRaw = request.body.targetStatus;

      if (!user) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      if (!positionId) {
        return reply.status(400).send({ error: "Invalid positionId" });
      }

      if (typeof targetStatusRaw !== "string" || !isValidPortfolioStatus(targetStatusRaw)) {
        return reply.status(400).send({ error: "targetStatus must be a valid portfolio status" });
      }

      const position = await authRepository.getPortfolioPositionById(positionId);

      if (!position) {
        return reply.status(404).send({ error: "Portfolio position not found" });
      }

      const result = await transitionPortfolioPosition(position, targetStatusRaw, user.id);

      if (!result.ok) {
        return reply.status(result.statusCode).send({ error: result.error });
      }

      return reply.status(200).send(result.position);
    }
  );

  app.post<{ Params: PortfolioParams; Body: PortfolioVerificationBody }>(
    "/portfolio/positions/:positionId/verification-checklist",
    { preHandler: requireRole(["admin", "reviewer"]) },
    async (request, reply) => {
      const user = request.authUser;
      const positionId = parsePositiveId(request.params.positionId);

      if (!user) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      if (!positionId) {
        return reply.status(400).send({ error: "Invalid positionId" });
      }

      const position = await authRepository.getPortfolioPositionById(positionId);

      if (!position) {
        return reply.status(404).send({ error: "Portfolio position not found" });
      }

      if (position.currentStatus !== "accepted_pending_verification") {
        return reply.status(409).send({
          error: "Position must be in accepted_pending_verification before running checklist"
        });
      }

      const parsedChecks = parseVerificationChecks(request.body);

      if (!parsedChecks.valid) {
        return reply.status(400).send({ error: parsedChecks.error });
      }

      const outcomeStatus: PortfolioStatus = parsedChecks.passed
        ? "verified"
        : request.body.disputed
          ? "disputed"
          : "failed";

      const checklist = await authRepository.createPortfolioVerificationChecklist({
        portfolioPositionId: position.id,
        checks: parsedChecks.checks,
        passed: parsedChecks.passed,
        outcomeStatus: outcomeStatus === "verified" ? "verified" : outcomeStatus === "disputed" ? "disputed" : "failed",
        createdByUserId: String(user.id),
        notes: typeof request.body.notes === "string" ? request.body.notes.trim() : undefined
      });

      const transitioned = await transitionPortfolioPosition(position, outcomeStatus, user.id);

      if (!transitioned.ok) {
        return reply.status(transitioned.statusCode).send({ error: transitioned.error });
      }

      await authRepository.writeEvent({
        eventType: "portfolio.verification_recorded",
        entityType: "portfolio_position",
        entityId: String(position.id),
        payload: {
          actorUserId: user.id,
          checklistId: checklist.id,
          passed: checklist.passed,
          outcomeStatus: checklist.outcomeStatus
        }
      });

      return reply.status(200).send({
        checklist,
        position: transitioned.position
      });
    }
  );

  app.get<{ Params: PortfolioParams }>(
    "/portfolio/positions/:positionId/verification-checklist",
    { preHandler: requireRole(["admin", "operator", "reviewer"]) },
    async (request, reply) => {
      const positionId = parsePositiveId(request.params.positionId);

      if (!positionId) {
        return reply.status(400).send({ error: "Invalid positionId" });
      }

      const position = await authRepository.getPortfolioPositionById(positionId);

      if (!position) {
        return reply.status(404).send({ error: "Portfolio position not found" });
      }

      const checklists = await authRepository.listPortfolioVerificationChecklists(positionId);
      return reply.status(200).send({ checklists });
    }
  );

  app.get<{ Querystring: DashboardQuery }>(
    "/dashboard/kpi",
    { preHandler: requireRole(["admin", "operator", "reviewer"]) },
    async (request, reply) => {
      const seedCostRaw = request.query.seedCostUsd;
      const seedCostUsd =
        typeof seedCostRaw === "number"
          ? seedCostRaw
          : typeof seedCostRaw === "string"
            ? Number(seedCostRaw)
            : 0.9;

      if (!Number.isFinite(seedCostUsd) || seedCostUsd <= 0) {
        return reply.status(400).send({ error: "seedCostUsd must be a positive number" });
      }

      const metrics = await authRepository.computeDashboardMetrics(seedCostUsd);
      const latestSnapshot = await authRepository.getLatestKpiSnapshot();

      return reply.status(200).send({ metrics, latestSnapshot });
    }
  );

  app.post<{ Body: DashboardSnapshotBody }>(
    "/dashboard/kpi/snapshot",
    { preHandler: requireRole(["admin", "operator"]) },
    async (request, reply) => {
      const user = request.authUser;
      const seedCostUsd = typeof request.body.seedCostUsd === "number" ? request.body.seedCostUsd : 0.9;

      if (!user) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      if (!Number.isFinite(seedCostUsd) || seedCostUsd <= 0) {
        return reply.status(400).send({ error: "seedCostUsd must be a positive number" });
      }

      const metrics = await authRepository.computeDashboardMetrics(seedCostUsd);
      const snapshot = await authRepository.createKpiSnapshot(metrics);

      await authRepository.writeEvent({
        eventType: "dashboard.snapshot_created",
        entityType: "kpi_snapshot",
        entityId: String(snapshot.id),
        payload: {
          actorUserId: user.id,
          valueMultiple: snapshot.valueMultiple
        }
      });

      return reply.status(201).send(snapshot);
    }
  );

  app.get<{ Querystring: DashboardQuery }>(
    "/dashboard/kpi/snapshots",
    { preHandler: requireRole(["admin", "operator", "reviewer"]) },
    async (request, reply) => {
      const limitRaw = request.query.limit;
      const limit = typeof limitRaw === "number" ? limitRaw : typeof limitRaw === "string" ? Number(limitRaw) : 30;

      if (!Number.isFinite(limit) || limit <= 0) {
        return reply.status(400).send({ error: "limit must be a positive number" });
      }

      const snapshots = await authRepository.listKpiSnapshots(Math.floor(limit));
      return reply.status(200).send({ snapshots });
    }
  );

  app.addHook("onClose", async () => {
    if (authRepository.close) {
      await authRepository.close();
    }
  });

  return app;
};

const start = async () => {
  const app = buildServer();
  const port = Number(process.env.API_PORT ?? 3001);

  try {
    await app.listen({ port, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  await start();
}
