import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sharedSource } from "./scripts/lendloop-sign.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const shared = sharedSource();

function code(name, id, position, jsCode) {
  return {
    parameters: { mode: "runOnceForAllItems", jsCode: `${shared}\n\n${jsCode}` },
    id,
    name,
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position,
  };
}

function http(name, id, position) {
  return {
    parameters: {
      method: "POST",
      url: "={{ $json.url }}",
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: "X-LendLoop-Timestamp", value: "={{ $json.timestamp }}" },
          { name: "X-LendLoop-Signature", value: "={{ $json.signature }}" },
        ],
      },
      sendBody: true,
      contentType: "raw",
      rawContentType: "application/json",
      body: "={{ $json.rawBody }}",
      options: {},
    },
    id,
    name,
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position,
    retryOnFail: true,
    maxTries: 4,
    waitBetweenTries: 2000,
    onError: "stopWorkflow",
  };
}

function note(name, id, position, content) {
  return {
    parameters: { content, height: 220, width: 420, color: 4 },
    id,
    name,
    type: "n8n-nodes-base.stickyNote",
    typeVersion: 1,
    position,
  };
}

function workflow(name, nodes, connections) {
  return {
    name,
    nodes,
    connections,
    pinData: {},
    active: false,
    settings: {
      executionOrder: "v1",
      timezone: "UTC",
    },
    meta: {
      templateCredsSetupCompleted: true,
    },
    tags: [],
  };
}

const request = workflow(
  "LendLoop Request Notification",
  [
    note(
      "Setup",
      "a1000000-0000-4000-8000-000000000001",
      [-20, -40],
      "## LendLoop request notification\n\nConvex signs each loan event and POSTs it here.\n\nAfter import: workflow menu → Settings → Error workflow → **LendLoop Error Handler**. Then publish this workflow.\n\nThe HMAC secret is read from `$env.LENDLOOP_HMAC_SECRET`. Do not paste it into this workflow.",
    ),
    {
      parameters: {
        httpMethod: "POST",
        path: "lendloop-request",
        responseMode: "responseNode",
        options: { rawBody: true },
      },
      id: "a1000000-0000-4000-8000-000000000002",
      name: "Request webhook",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [280, 220],
      webhookId: "a1000000-0000-4000-8000-000000000003",
    },
    code(
      "Verify signature",
      "a1000000-0000-4000-8000-000000000004",
      [540, 220],
      `const secret = $env.LENDLOOP_HMAC_SECRET;
if (!secret) throw new Error("LENDLOOP_HMAC_SECRET is not set.");
let rawBody = "";
try {
  rawBody = (await this.helpers.getBinaryDataBuffer(0, "data")).toString("utf8");
} catch (error) {
  throw new Error("Raw webhook body is missing. Enable Raw Body on the Webhook node.");
}
const headers = $input.first().json.headers || {};
const timestamp = String(headers["x-lendloop-timestamp"] || "");
const signature = String(headers["x-lendloop-signature"] || "").trim().toLowerCase();
let valid = false;
let reason = "missing_timestamp";
if (!/^\\d{10,16}$/.test(timestamp)) reason = "missing_timestamp";
else if (!/^[0-9a-f]{64}$/.test(signature)) reason = "missing_signature";
else if (!timingSafeEqualHex(signBody(secret, timestamp, rawBody), signature)) reason = "invalid_signature";
else if (Math.abs(Date.now() - Number(timestamp)) > 5 * 60 * 1000) reason = "stale_timestamp";
else {
  valid = true;
  reason = "ok";
}
let body = {};
try {
  body = JSON.parse(rawBody);
} catch (error) {
  body = {};
}
return [{ json: { valid, reason, body } }];`,
    ),
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
          conditions: [
            {
              id: "signature-valid",
              leftValue: "={{ $json.valid }}",
              rightValue: "",
              operator: { type: "boolean", operation: "true", singleValue: true },
            },
          ],
          combinator: "and",
        },
        options: {},
      },
      id: "a1000000-0000-4000-8000-000000000005",
      name: "Signature valid?",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [820, 220],
    },
    code(
      "Log notification",
      "a1000000-0000-4000-8000-000000000006",
      [1080, 80],
      `const staticData = $getWorkflowStaticData("global");
staticData.seen = staticData.seen || {};
const body = $json.body || {};
const notice = {
  event: body.event,
  idempotencyKey: body.idempotencyKey,
  loanId: body.loanId,
  recipientUserId: body.recipientUserId,
  status: body.status,
  toolName: body.toolName,
};
const key = String(notice.idempotencyKey || "");
if (key && staticData.seen[key]) {
  return [{ json: { duplicate: true, log: "duplicate notification " + key } }];
}
if (key) staticData.seen[key] = Date.now();
const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
for (const seenKey of Object.keys(staticData.seen)) {
  if (staticData.seen[seenKey] < cutoff) delete staticData.seen[seenKey];
}
const log = "Notify " + notice.recipientUserId + ": " + notice.toolName + " is " + notice.status + " (" + notice.event + ")";
return [{ json: { duplicate: false, log } }];`,
    ),
    {
      parameters: {
        respondWith: "json",
        responseBody: '={{ JSON.stringify({ ok: true, duplicate: $json.duplicate === true }) }}',
        options: { responseCode: 200 },
      },
      id: "a1000000-0000-4000-8000-000000000007",
      name: "Accept",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.1,
      position: [1360, 80],
    },
    {
      parameters: {
        respondWith: "json",
        responseBody: '={{ JSON.stringify({ ok: false }) }}',
        options: { responseCode: 401 },
      },
      id: "a1000000-0000-4000-8000-000000000008",
      name: "Reject",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.1,
      position: [1080, 380],
    },
  ],
  {
    "Request webhook": { main: [[{ node: "Verify signature", type: "main", index: 0 }]] },
    "Verify signature": { main: [[{ node: "Signature valid?", type: "main", index: 0 }]] },
    "Signature valid?": {
      main: [
        [{ node: "Log notification", type: "main", index: 0 }],
        [{ node: "Reject", type: "main", index: 0 }],
      ],
    },
    "Log notification": { main: [[{ node: "Accept", type: "main", index: 0 }]] },
  },
);

const overdue = workflow(
  "LendLoop Overdue Reminders",
  [
    note(
      "Setup",
      "b2000000-0000-4000-8000-000000000001",
      [-20, -40],
      "## Daily overdue reminders\n\nRuns at 08:00 UTC. Fetches overdue loans from Convex, logs a minimal reminder, and writes the result back with an idempotency key.\n\nAfter import: Settings → Error workflow → **LendLoop Error Handler**. Then publish.\n\nUses `$env.LENDLOOP_HMAC_SECRET` and `$env.CONVEX_SITE_URL`.",
    ),
    {
      parameters: {
        rule: {
          interval: [{ field: "days", daysInterval: 1, triggerAtHour: 8, triggerAtMinute: 0 }],
        },
      },
      id: "b2000000-0000-4000-8000-000000000002",
      name: "Daily 08:00 UTC",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1.2,
      position: [280, 220],
    },
    code(
      "Sign overdue request",
      "b2000000-0000-4000-8000-000000000003",
      [540, 220],
      `const secret = $env.LENDLOOP_HMAC_SECRET;
const base = $env.CONVEX_SITE_URL;
if (!secret || !base) throw new Error("LENDLOOP_HMAC_SECRET and CONVEX_SITE_URL are required.");
const rawBody = canonicalize({});
const timestamp = Date.now().toString();
const signature = signBody(secret, timestamp, rawBody);
return [{ json: { rawBody, timestamp, signature, url: base.replace(/\\/$/, "") + "/overdue" } }];`,
    ),
    http("Fetch overdue loans", "b2000000-0000-4000-8000-000000000004", [820, 220]),
    code(
      "Prepare reminders",
      "b2000000-0000-4000-8000-000000000005",
      [1100, 220],
      `const secret = $env.LENDLOOP_HMAC_SECRET;
if (!secret) throw new Error("LENDLOOP_HMAC_SECRET is not set.");
const loans = Array.isArray($json.loans) ? $json.loans : [];
if (loans.length === 0) return [{ json: { empty: true, log: "No overdue loans." } }];
const today = new Date().toISOString().slice(0, 10);
const base = String($env.CONVEX_SITE_URL || "").replace(/\\/$/, "");
return loans.map((loan) => {
  const payload = {
    daysOverdue: loan.daysOverdue,
    idempotencyKey: "reminder:" + loan.loanId + ":" + today,
    loanId: loan.loanId,
    outcome: "sent",
  };
  const rawBody = canonicalize(payload);
  const timestamp = Date.now().toString();
  return {
    json: {
      empty: false,
      log: "Notify borrower " + loan.borrowerId + ": " + loan.toolName + " is " + loan.daysOverdue + " day(s) overdue",
      rawBody,
      timestamp,
      signature: signBody(secret, timestamp, rawBody),
      url: base + "/reminders",
    },
  };
});`,
    ),
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
          conditions: [
            {
              id: "has-loans",
              leftValue: "={{ $json.empty }}",
              rightValue: "",
              operator: { type: "boolean", operation: "false", singleValue: true },
            },
          ],
          combinator: "and",
        },
        options: {},
      },
      id: "b2000000-0000-4000-8000-000000000006",
      name: "Anything overdue?",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [1380, 220],
    },
    http("Write reminder", "b2000000-0000-4000-8000-000000000007", [1640, 80]),
    {
      parameters: {},
      id: "b2000000-0000-4000-8000-000000000008",
      name: "Nothing overdue",
      type: "n8n-nodes-base.noOp",
      typeVersion: 1,
      position: [1640, 380],
    },
  ],
  {
    "Daily 08:00 UTC": { main: [[{ node: "Sign overdue request", type: "main", index: 0 }]] },
    "Sign overdue request": { main: [[{ node: "Fetch overdue loans", type: "main", index: 0 }]] },
    "Fetch overdue loans": { main: [[{ node: "Prepare reminders", type: "main", index: 0 }]] },
    "Prepare reminders": { main: [[{ node: "Anything overdue?", type: "main", index: 0 }]] },
    "Anything overdue?": {
      main: [
        [{ node: "Write reminder", type: "main", index: 0 }],
        [{ node: "Nothing overdue", type: "main", index: 0 }],
      ],
    },
  },
);

const errors = workflow(
  "LendLoop Error Handler",
  [
    note(
      "Setup",
      "c3000000-0000-4000-8000-000000000001",
      [-20, -40],
      "## Error handler\n\nAttach this workflow as the Error workflow on the request and reminder workflows.\n\nIt keeps only the workflow name, execution id, and a short error message. The original payload is not forwarded.\n\nFailed runs also stay visible in the n8n Executions list.",
    ),
    {
      parameters: {},
      id: "c3000000-0000-4000-8000-000000000002",
      name: "Error trigger",
      type: "n8n-nodes-base.errorTrigger",
      typeVersion: 1,
      position: [280, 220],
    },
    code(
      "Sign failure report",
      "c3000000-0000-4000-8000-000000000003",
      [560, 220],
      `const secret = $env.LENDLOOP_HMAC_SECRET;
const base = $env.CONVEX_SITE_URL;
if (!secret || !base) throw new Error("LENDLOOP_HMAC_SECRET and CONVEX_SITE_URL are required.");
const execution = $json.execution || {};
const workflow = $json.workflow || {};
const workflowName = String(workflow.name || "unknown").slice(0, 120);
const executionId = String(execution.id || "unknown").replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 80) || "unknown";
const message = String((execution.error && execution.error.message) || "Workflow failed").slice(0, 300);
const payload = {
  idempotencyKey: "error:" + workflowName + ":" + executionId,
  message,
  workflowName,
};
const rawBody = canonicalize(payload);
const timestamp = Date.now().toString();
return [{
  json: {
    rawBody,
    timestamp,
    signature: signBody(secret, timestamp, rawBody),
    url: base.replace(/\\/$/, "") + "/automation-errors",
    log: "Failure visible for " + workflowName + " execution " + executionId,
  },
}];`,
    ),
    http("Report failure", "c3000000-0000-4000-8000-000000000004", [880, 220]),
  ],
  {
    "Error trigger": { main: [[{ node: "Sign failure report", type: "main", index: 0 }]] },
    "Sign failure report": { main: [[{ node: "Report failure", type: "main", index: 0 }]] },
  },
);

const out = path.join(root, "workflows");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "request-notification.json"), `${JSON.stringify(request, null, 2)}\n`);
fs.writeFileSync(path.join(out, "overdue-reminders.json"), `${JSON.stringify(overdue, null, 2)}\n`);
fs.writeFileSync(path.join(out, "error-handler.json"), `${JSON.stringify(errors, null, 2)}\n`);
