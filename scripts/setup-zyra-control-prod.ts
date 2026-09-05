import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const WORKER_URL = "https://zyx-zyra-control-production.16922204.workers.dev";
const WORKER_DIR = path.resolve(process.cwd(), "workers/zyra-control-plane");

async function main() {
  console.log("Setting up Zyra Control Plane token for production...");

  // Generate 256-bit high-entropy secret
  const secretToken = randomBytes(32).toString("hex");

  // Push secret to Cloudflare Worker via Wrangler
  console.log("Provisioning secret to Cloudflare Worker via Wrangler...");
  execSync("bunx wrangler secret put ZYRA_CONTROL_PLANE_TOKEN --env production", {
    cwd: WORKER_DIR,
    input: secretToken,
    stdio: ["pipe", "inherit", "inherit"],
  });

  console.log("Secret successfully set on Cloudflare Worker.");

  // Update .env.prod if it exists
  const envProdPath = path.resolve(process.cwd(), ".env.prod");
  if (fs.existsSync(envProdPath)) {
    let envContent = fs.readFileSync(envProdPath, "utf8");

    if (envContent.includes("ZYRA_CONTROL_PLANE_URL=")) {
      envContent = envContent.replace(
        /ZYRA_CONTROL_PLANE_URL=.*/g,
        `ZYRA_CONTROL_PLANE_URL=${WORKER_URL}`
      );
    } else {
      envContent += `\nZYRA_CONTROL_PLANE_URL=${WORKER_URL}`;
    }

    if (envContent.includes("ZYRA_CONTROL_PLANE_TOKEN=")) {
      envContent = envContent.replace(
        /ZYRA_CONTROL_PLANE_TOKEN=.*/g,
        `ZYRA_CONTROL_PLANE_TOKEN=${secretToken}`
      );
    } else {
      envContent += `\nZYRA_CONTROL_PLANE_TOKEN=${secretToken}`;
    }

    fs.writeFileSync(envProdPath, envContent, "utf8");
    console.log("Updated ZYRA_CONTROL_PLANE_URL and ZYRA_CONTROL_PLANE_TOKEN in .env.prod.");
  }

  // Verify health endpoint
  console.log("\nVerifying GET /health endpoint...");
  const healthRes = await fetch(`${WORKER_URL}/health`);
  const healthBody = await healthRes.json();
  console.log("Health Check Status:", healthRes.status);
  console.log("Health Payload:", JSON.stringify(healthBody, null, 2));

  // Verify unauthorized rejection
  console.log("\nVerifying unauthorized request rejection (GET /quota/diagnostics)...");
  const unauthRes = await fetch(`${WORKER_URL}/quota/diagnostics`);
  console.log("Unauthorized Check Status:", unauthRes.status, unauthRes.status === 401 ? "OK (Protected)" : "FAILED");

  // Verify authorized diagnostics
  console.log("\nVerifying authorized request (GET /quota/diagnostics with Bearer token)...");
  const authRes = await fetch(`${WORKER_URL}/quota/diagnostics`, {
    headers: {
      Authorization: `Bearer ${secretToken}`,
    },
  });
  const authBody = await authRes.json();
  console.log("Authorized Check Status:", authRes.status);
  console.log("Authorized Diagnostics:", JSON.stringify(authBody, null, 2));

  console.log("\nZyra Control Plane Production setup and verification complete!");
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
