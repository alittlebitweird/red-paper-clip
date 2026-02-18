import "dotenv/config";

import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";

import {
  type AuthRepository,
  type AuthUser,
  type PolicyRuleInput,
  type UserRole,
  PgAuthRepository
} from "./auth-repository.js";
import { hashApiKey } from "./hash-api-key.js";

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

type BuildServerOptions = {
  authRepository?: AuthRepository;
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
