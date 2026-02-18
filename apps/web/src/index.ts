import "dotenv/config";
import { createServer } from "node:http";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const renderHomePage = (apiBaseUrl: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Open Claw Bot Console</title>
    <style>
      :root {
        --paper: #f7f1e3;
        --ink: #182433;
        --accent: #e63946;
        --accent-soft: #f4a261;
        --panel: rgba(255, 255, 255, 0.78);
        --line: rgba(24, 36, 51, 0.15);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Avenir Next", "Segoe UI", sans-serif;
        color: var(--ink);
        background: radial-gradient(circle at 20% 20%, #ffd6a5 0, transparent 45%),
          radial-gradient(circle at 85% 15%, #ffadad 0, transparent 35%),
          linear-gradient(145deg, #fdf0d5, #f1faee 60%, #eaf4f4);
      }

      .layout {
        max-width: 1080px;
        margin: 0 auto;
        padding: 24px 18px 40px;
      }

      .hero {
        margin-bottom: 16px;
        border: 1px solid var(--line);
        background: linear-gradient(120deg, rgba(230, 57, 70, 0.12), rgba(244, 162, 97, 0.18));
        border-radius: 20px;
        padding: 20px;
      }

      h1 {
        margin: 0;
        font-size: clamp(1.6rem, 3vw, 2.4rem);
        letter-spacing: 0.02em;
      }

      .subtitle {
        margin: 8px 0 0;
        font-size: 0.96rem;
      }

      .grid {
        display: grid;
        gap: 16px;
      }

      @media (min-width: 900px) {
        .grid {
          grid-template-columns: 1fr 1fr;
        }
      }

      .panel {
        border: 1px solid var(--line);
        border-radius: 16px;
        background: var(--panel);
        backdrop-filter: blur(6px);
        padding: 16px;
        box-shadow: 0 8px 24px rgba(24, 36, 51, 0.08);
      }

      label {
        display: block;
        font-size: 0.85rem;
        margin-bottom: 6px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      input {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid var(--line);
        border-radius: 10px;
        font-size: 0.95rem;
        margin-bottom: 12px;
        background: #fff;
      }

      button {
        border: 0;
        border-radius: 999px;
        padding: 10px 16px;
        font-size: 0.92rem;
        font-weight: 600;
        cursor: pointer;
      }

      .primary {
        background: var(--accent);
        color: #fff;
      }

      .secondary {
        background: var(--accent-soft);
        color: #2e1f0f;
      }

      .row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .status {
        margin-top: 10px;
        min-height: 20px;
        font-size: 0.88rem;
      }

      .status.error {
        color: #b00020;
      }

      .status.ok {
        color: #1b5e20;
      }

      .opportunity-list {
        margin: 10px 0 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: 10px;
      }

      .opportunity-card {
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 12px;
        background: #fff;
      }

      .opportunity-meta {
        margin: 4px 0 0;
        font-size: 0.86rem;
        color: rgba(24, 36, 51, 0.78);
      }

      .pill {
        display: inline-block;
        padding: 4px 8px;
        border-radius: 999px;
        background: rgba(230, 57, 70, 0.12);
        color: #7d1128;
        font-size: 0.76rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
    </style>
  </head>
  <body>
    <div class="layout">
      <section class="hero">
        <h1>Open Claw Bot Operations</h1>
        <p class="subtitle">Manual intake and review console for opportunity flow.</p>
      </section>

      <div class="grid">
        <section class="panel">
          <h2>Opportunity Intake</h2>
          <label for="api-key">Operator API Key</label>
          <input id="api-key" placeholder="dev-operator-key" />

          <label for="source">Source</label>
          <input id="source" placeholder="Craigslist" />

          <label for="category">Category</label>
          <input id="category" placeholder="Electronics" />

          <label for="location">Location</label>
          <input id="location" placeholder="San Francisco, CA" />

          <label for="title">Title</label>
          <input id="title" placeholder="Nintendo Switch" />

          <label for="price">Price (USD)</label>
          <input id="price" type="number" min="0" step="0.01" placeholder="250" />

          <button id="submit" class="primary">Submit Opportunity</button>
          <p id="submit-status" class="status"></p>
        </section>

        <section class="panel">
          <h2>Opportunity Review</h2>
          <div class="row">
            <button id="refresh" class="secondary">Refresh List</button>
          </div>
          <p id="list-status" class="status"></p>
          <ul id="opportunity-list" class="opportunity-list"></ul>
        </section>
      </div>
    </div>

    <script>
      const apiBaseUrl = "${escapeHtml(apiBaseUrl)}";
      const submitStatus = document.getElementById("submit-status");
      const listStatus = document.getElementById("list-status");
      const listElement = document.getElementById("opportunity-list");

      const getApiKey = () => document.getElementById("api-key").value.trim();

      const setStatus = (element, message, type) => {
        element.textContent = message;
        element.className = ("status " + type).trim();
      };

      const loadOpportunities = async () => {
        const apiKey = getApiKey();
        if (!apiKey) {
          setStatus(listStatus, "Enter API key to load opportunities.", "error");
          return;
        }

        setStatus(listStatus, "Loading...", "");
        try {
          const response = await fetch(apiBaseUrl + "/opportunities", {
            headers: { "x-api-key": apiKey }
          });
          const payload = await response.json();

          if (!response.ok) {
            setStatus(listStatus, payload.error || "Failed to load opportunities.", "error");
            return;
          }

          listElement.innerHTML = "";
          for (const opportunity of payload.opportunities) {
            const card = document.createElement("li");
            card.className = "opportunity-card";
            card.innerHTML =
              '<span class="pill">' + opportunity.status + '</span>' +
              '<p><strong>' + opportunity.category + '</strong> from ' + opportunity.source + '</p>' +
              '<p class="opportunity-meta">' + opportunity.location + ' · $' + Number(opportunity.askValueUsd).toFixed(2) + '</p>';
            listElement.appendChild(card);
          }

          if (payload.opportunities.length === 0) {
            setStatus(listStatus, "No opportunities yet.", "");
          } else {
            setStatus(listStatus, "Loaded " + payload.opportunities.length + " opportunities.", "ok");
          }
        } catch (error) {
          setStatus(listStatus, "Network error while loading opportunities.", "error");
        }
      };

      document.getElementById("submit").addEventListener("click", async () => {
        const apiKey = getApiKey();
        if (!apiKey) {
          setStatus(submitStatus, "API key is required.", "error");
          return;
        }

        const payload = {
          source: document.getElementById("source").value,
          category: document.getElementById("category").value,
          location: document.getElementById("location").value,
          title: document.getElementById("title").value,
          priceUsd: Number(document.getElementById("price").value)
        };

        setStatus(submitStatus, "Submitting...", "");
        try {
          const response = await fetch(apiBaseUrl + "/opportunities", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-key": apiKey
            },
            body: JSON.stringify(payload)
          });
          const body = await response.json();

          if (!response.ok) {
            setStatus(submitStatus, body.error || "Failed to submit opportunity.", "error");
            return;
          }

          setStatus(submitStatus, "Opportunity #" + body.id + " created.", "ok");
          await loadOpportunities();
        } catch (error) {
          setStatus(submitStatus, "Network error while submitting.", "error");
        }
      });

      document.getElementById("refresh").addEventListener("click", loadOpportunities);
    </script>
  </body>
</html>`;

export const startWebServer = () => {
  const port = Number(process.env.WEB_PORT ?? 3000);
  const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001";
  const server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderHomePage(apiBaseUrl));
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`[web] listening on ${port}`);
  });

  return server;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  startWebServer();
}
