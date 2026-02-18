import "dotenv/config";

export const buildHeartbeatMessage = () => {
  return {
    service: "worker",
    status: "running",
    timestamp: new Date().toISOString()
  };
};

const startWorker = () => {
  const intervalMs = Number(process.env.WORKER_HEARTBEAT_MS ?? 10000);

  console.log("[worker] started");
  setInterval(() => {
    console.log(buildHeartbeatMessage());
  }, intervalMs);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  startWorker();
}
