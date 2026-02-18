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

export class RentAHumanStubProvider implements TaskProvider {
  async createTask(input: CreateProviderTaskInput): Promise<ProviderTaskResult> {
    const suffix = Math.random().toString(36).slice(2, 10);

    return {
      providerName: "rentahuman_stub",
      providerTaskId: `${input.type}-${suffix}`
    };
  }
}
