import "dotenv/config";
import { createServer } from "node:http";

export const renderHomePage = () => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Open Claw Bot</title>
  </head>
  <body>
    <main>
      <h1>Open Claw Bot Ops Console</h1>
      <p>Service is running. UI implementation starts in RPC-005.</p>
    </main>
  </body>
</html>`;

export const startWebServer = () => {
  const port = Number(process.env.WEB_PORT ?? 3000);
  const server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderHomePage());
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`[web] listening on ${port}`);
  });

  return server;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  startWebServer();
}
