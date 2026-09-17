"use strict";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseArgs } = require("util");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("path");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const os = require("os");

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

const CLI_OPTIONS = {
  port: { type: "string", short: "p" },
  hostname: { type: "string", short: "H" },
  "no-open": { type: "boolean" },
  help: { type: "boolean", short: "h" },
};

function isEnabled(value) {
  return typeof value === "string" && TRUE_VALUES.has(value.trim().toLowerCase());
}

function normalizePort(value) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error("Port must be a non-negative integer.");
  }

  const port = Number(value);
  if (!Number.isSafeInteger(port) || port > 65535) {
    throw new Error("Port must be between 0 and 65535.");
  }

  return String(port);
}

function getAgentDir() {
  const envDir = process.env.PI_CODING_AGENT_DIR || process.env.PRIME_AGENT_CODING_AGENT_DIR;
  if (envDir) return envDir;
  try {
    return path.join(os.homedir(), ".prime/agent");
  } catch {
    return "";
  }
}

function getSettingsHost() {
  try {
    const agentDir = getAgentDir();
    if (!agentDir) return null;
    const settingsPath = path.join(agentDir, "settings.json");
    if (!fs.existsSync(settingsPath)) return null;
    const raw = fs.readFileSync(settingsPath, "utf-8");
    const data = JSON.parse(raw);
    // task key: prime-agent-web-host (kebab-case). Also support camelCase alias.
    const rawHost = data["prime-agent-web-host"] ?? data.primeAgentWebHost ?? data["prime-web-host"];
    if (typeof rawHost !== "string") return null;
    const host = rawHost.trim();
    if (host === "0.0.0.0" || host === "127.0.0.1" || host === "localhost") {
      return host === "localhost" ? "127.0.0.1" : host;
    }
    // allow any non-empty hostname but only 0.0.0.0/127.0.0.1 are documented; pass through otherwise
    if (host) return host;
    return null;
  } catch {
    return null;
  }
}

function getHelpText() {
  return `Usage: pi-web [options]

Start the Prime Web UI server.

Options:
  -p, --port <port>          Server port (default: 30141, or PORT)
  -H, --hostname <host>      Bind hostname (default: 127.0.0.1, or PI_WEB_HOSTNAME)
      --no-open              Do not open a browser automatically
  -h, --help                 Show this help message and exit

Environment:
  PORT                       Default port when --port is omitted
  PI_WEB_HOSTNAME            Default hostname when --hostname is omitted
  PI_WEB_NO_OPEN             Set to 1/true/yes/on to disable browser open
  PI_WEB_PASSWORD            Enable browser password login and API Basic Auth
  PI_WEB_ALLOWED_HOSTS       Extra exact proxy/custom hostnames, comma-separated
  PI_WEB_SKIP_VERSION_CHECK / PRIME_WEB_SKIP_VERSION_CHECK Set to 1 to disable Prime Web update checks
  PI_WEB_IDLE_TIMEOUT_MS     Session idle timeout in ms (0 disables; default 600000)

Settings (~/.prime/agent/settings.json):
  prime-agent-web-host       Host to bind when --hostname/PI_WEB_HOSTNAME not set (127.0.0.1 or 0.0.0.0)
`;
}

function parseLaunchOptions(args = process.argv.slice(2), env = process.env) {
  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({
      args,
      options: CLI_OPTIONS,
      strict: true,
      allowPositionals: true,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const err = new Error(`${message}\nUse --help to see available options.`);
    err.code = "ERR_PARSE_ARGS_UNKNOWN_OPTION";
    throw err;
  }

  if (values.help) {
    return { help: true };
  }

  if (positionals.length > 0) {
    throw new Error(
      `Unexpected argument(s): ${positionals.join(" ")}\nUse --help to see available options.`,
    );
  }

  return {
    help: false,
    port: normalizePort(values.port ?? env.PORT ?? "30141"),
    hostname: values.hostname ?? env.PI_WEB_HOSTNAME ?? getSettingsHost() ?? "127.0.0.1",
    openBrowser: !values["no-open"] && !isEnabled(env.PI_WEB_NO_OPEN),
  };
}

module.exports = { parseLaunchOptions, getHelpText, getSettingsHost, getAgentDir };
