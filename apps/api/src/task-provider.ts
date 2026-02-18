export type TaskType = "inspect" | "pickup" | "meet" | "ship";

export type CreateProviderTaskInput = {
  type: TaskType;
  assignee?: string;
  metadata?: Record<string, unknown>;
};

export type ProviderTaskResult = {
  providerName: string;
  providerTaskId: string;
};

export interface TaskProvider {
  createTask(input: CreateProviderTaskInput): Promise<ProviderTaskResult>;
}

type RentAHumanApiProviderOptions = {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export class RentAHumanStubProvider implements TaskProvider {
  async createTask(input: CreateProviderTaskInput): Promise<ProviderTaskResult> {
    const suffix = Math.random().toString(36).slice(2, 10);

    return {
      providerName: "rentahuman_stub",
      providerTaskId: `${input.type}-${suffix}`
    };
  }
}

const resolveString = (value: unknown) => (typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined);

const toIsoDateString = (value: unknown) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const extractProviderTaskId = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const objectPayload = payload as Record<string, unknown>;
  const directCandidates = [objectPayload.id, objectPayload.bountyId, objectPayload.taskId];
  const nestedData = objectPayload.data;
  const nestedCandidates =
    nestedData && typeof nestedData === "object"
      ? [(nestedData as Record<string, unknown>).id, (nestedData as Record<string, unknown>).bountyId, (nestedData as Record<string, unknown>).taskId]
      : [];

  const value = [...directCandidates, ...nestedCandidates].find(
    (candidate) => typeof candidate === "string" || typeof candidate === "number"
  );

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
};

export class RentAHumanApiProvider implements TaskProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: RentAHumanApiProviderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async createTask(input: CreateProviderTaskInput): Promise<ProviderTaskResult> {
    const metadata = input.metadata ?? {};
    const budgetUsdRaw = metadata.budgetUsd;
    const budgetUsd =
      typeof budgetUsdRaw === "number" && Number.isFinite(budgetUsdRaw) && budgetUsdRaw > 0 ? Number(budgetUsdRaw.toFixed(2)) : 25;
    const location = resolveString(metadata.location) ?? "unspecified";
    const deadlineIso = toIsoDateString(metadata.deadlineIso) ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const title = resolveString(metadata.title) ?? `Claw bot ${input.type} task`;
    const description =
      resolveString(metadata.description) ?? `Task type ${input.type}. Provide proof media and completion notes.`;

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/api/bounties`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
          "x-api-key": this.apiKey
        },
        body: JSON.stringify({
          title,
          description,
          budget: budgetUsd,
          location,
          deadline: deadlineIso,
          metadata: {
            ...metadata,
            taskType: input.type,
            assignee: input.assignee
          }
        }),
        signal: controller.signal
      });

      const responseText = await response.text();
      let parsedPayload: unknown = {};
      if (responseText.trim().length > 0) {
        try {
          parsedPayload = JSON.parse(responseText);
        } catch {
          parsedPayload = { raw: responseText };
        }
      }

      if (!response.ok) {
        throw new Error(`RentAHuman API error ${response.status}`);
      }

      const providerTaskId = extractProviderTaskId(parsedPayload);
      if (!providerTaskId) {
        throw new Error("RentAHuman API response missing task id");
      }

      return {
        providerName: "rentahuman_api",
        providerTaskId
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

export const createTaskProviderFromEnv = (env: NodeJS.ProcessEnv = process.env): TaskProvider => {
  const provider = (env.TASK_PROVIDER ?? "rentahuman_stub").trim().toLowerCase();

  if (provider === "rentahuman_api") {
    const baseUrl = env.RENTAHUMAN_BASE_URL?.trim();
    const apiKey = env.RENTAHUMAN_API_KEY?.trim();
    const timeoutMsRaw = env.RENTAHUMAN_TIMEOUT_MS;
    const timeoutMs = timeoutMsRaw ? Number(timeoutMsRaw) : 10_000;

    if (!baseUrl || !apiKey) {
      throw new Error("RENTAHUMAN_BASE_URL and RENTAHUMAN_API_KEY are required when TASK_PROVIDER=rentahuman_api");
    }

    return new RentAHumanApiProvider({
      baseUrl,
      apiKey,
      timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10_000
    });
  }

  return new RentAHumanStubProvider();
};
