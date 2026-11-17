// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
const workflowDir = path.join(process.cwd(), "n8n", "workflows");

function readWorkflow(name: string) {
  return JSON.parse(fs.readFileSync(path.join(workflowDir, name), "utf8")) as {
    name: string;
    nodes: Array<{
      name: string;
      type: string;
      parameters?: { jsCode?: string };
      retryOnFail?: boolean;
      maxTries?: number;
    }>;
  };
}

const files = ["request-notification.json", "overdue-reminders.json", "error-handler.json"];

describe("exported n8n workflows", () => {
  test("ship the request, reminder, and error workflows", () => {
    expect(files.map((file) => fs.existsSync(path.join(workflowDir, file)))).toEqual([
      true,
      true,
      true,
    ]);
  });

  test("embed the shared signer and never a secret value", () => {
    for (const file of files) {
      const workflow = readWorkflow(file);
      const code = workflow.nodes.map((node) => node.parameters?.jsCode ?? "").join("\n");
      expect(code).toContain("function canonicalize(value)");
      expect(code).toContain("function timingSafeEqualHex");
      expect(code).toContain('require("crypto")');
      expect(code).toContain("createHmac");
      const raw = fs.readFileSync(path.join(workflowDir, file), "utf8");
      expect(raw).not.toMatch(/sk_(test|live)_/);
      expect(raw).not.toMatch(/LENDLOOP_HMAC_SECRET"\s*:\s*"(?!\{\{)/);
      expect(raw).toContain("$env.LENDLOOP_HMAC_SECRET");
    }
  });

  test("retries Convex calls and keeps an error workflow in the repo", () => {
    for (const file of ["overdue-reminders.json", "error-handler.json"]) {
      const workflow = readWorkflow(file);
      const httpNodes = workflow.nodes.filter((node) => node.type === "n8n-nodes-base.httpRequest");
      expect(httpNodes.length).toBeGreaterThan(0);
      for (const node of httpNodes) {
        expect(node.retryOnFail).toBe(true);
        expect(node.maxTries).toBeGreaterThanOrEqual(3);
      }
    }
    const errorWorkflow = readWorkflow("error-handler.json");
    expect(errorWorkflow.nodes.some((node) => node.type === "n8n-nodes-base.errorTrigger")).toBe(
      true,
    );
    const reminder = readWorkflow("overdue-reminders.json");
    expect(reminder.nodes.some((node) => node.type === "n8n-nodes-base.scheduleTrigger")).toBe(true);
    const request = readWorkflow("request-notification.json");
    expect(request.nodes.some((node) => node.type === "n8n-nodes-base.webhook")).toBe(true);
  });

  test("docker compose reads secrets from the environment", () => {
    const compose = fs.readFileSync(path.join(process.cwd(), "docker-compose.yml"), "utf8");
    expect(compose).toContain("${LENDLOOP_HMAC_SECRET:?");
    expect(compose).toContain("${CONVEX_SITE_URL:?");
    expect(compose).not.toMatch(/LENDLOOP_HMAC_SECRET:\s*[0-9a-f]{16,}/);
  });
});
