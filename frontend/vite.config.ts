import { defineConfig, type Plugin } from "vite";
import { existsSync, promises as fs } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OFFSETS_FILE = resolve(__dirname, "public/data/offsets.json");

interface OffsetEntry {
  dLat: number;
  dLon: number;
}

type OffsetsData = Record<string, OffsetEntry>;

interface OffsetUpdateRequest {
  groupKey: string;
  dLat: number;
  dLon: number;
}

function isOffsetUpdateRequest(value: unknown): value is OffsetUpdateRequest {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.groupKey === "string" && typeof record.dLat === "number" && typeof record.dLon === "number"
  );
}

async function readOffsets(): Promise<OffsetsData> {
  if (!existsSync(OFFSETS_FILE)) {
    return {};
  }
  const raw = await fs.readFile(OFFSETS_FILE, "utf-8");
  return raw.trim() ? (JSON.parse(raw) as OffsetsData) : {};
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => resolvePromise(body));
    req.on("error", rejectPromise);
  });
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

/**
 * Dev-only local persistence for manual position adjustments of
 * "approximate" (coarsely georeferenced) parcel groups. Not part of the
 * production build (static hosting has no backend); this exists purely to
 * support local data-curation work during `npm run dev`.
 */
function offsetsApiPlugin(): Plugin {
  return {
    name: "chiban-offsets-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next) => {
        if (req.url !== "/api/offsets") {
          next();
          return;
        }

        if (req.method === "GET") {
          void readOffsets().then((data) => sendJson(res, 200, data));
          return;
        }

        if (req.method === "POST") {
          void readRequestBody(req)
            .then(async (body) => {
              const parsed: unknown = JSON.parse(body);
              if (!isOffsetUpdateRequest(parsed)) {
                sendJson(res, 400, { ok: false, error: "Invalid offset payload" });
                return;
              }
              const data = await readOffsets();
              data[parsed.groupKey] = { dLat: parsed.dLat, dLon: parsed.dLon };
              await fs.writeFile(OFFSETS_FILE, JSON.stringify(data, null, 2));
              sendJson(res, 200, { ok: true });
            })
            .catch((error: unknown) => {
              sendJson(res, 500, { ok: false, error: String(error) });
            });
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [offsetsApiPlugin()],
});
