import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { buildStorefrontImageRelease, imageReleaseRequest } from "./image_release.js";
import { ensureStorefrontBucket, infrai, InfraiError } from "./infrai_storage.js";

const bucket = process.env.INFRAI_IMAGE_BUCKET ?? "storefront-developer-images";
const port = Number(process.env.PORT ?? 3000);

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body, null, 2));
}

function clientStatus(error: InfraiError): number {
  return error.status >= 400 && error.status < 500 ? error.status : 502;
}

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method === "POST" && request.url === "/releases/images") {
    const input = imageReleaseRequest.parse(await readJson(request));
    const event = await buildStorefrontImageRelease(input, async (key, dataBase64, contentType, idempotencyKey) => {
      await infrai.storage.object.put(bucket, key, {
        data_base64: dataBase64,
        content_type: contentType,
        idempotency_key: idempotencyKey,
      });
    });
    json(response, 201, event);
    return;
  }

  if (request.method === "GET" && request.url?.startsWith("/diagnostics/releases/")) {
    const releaseId = decodeURIComponent(request.url.slice("/diagnostics/releases/".length));
    const listing = await infrai.storage.object.list(bucket);
    const keys = listing.items.flatMap((item) => item.key ? [item.key] : [])
      .filter((key) => key.startsWith(`releases/${releaseId}/`));
    const objects = await Promise.all(keys.map(async (key) => ({
      key,
      found: (await infrai.storage.object.head(bucket, key)).found,
    })));
    json(response, 200, { releaseId, state: objects.length > 0 && objects.every((item) => item.found) ? "available" : "pending", objects });
    return;
  }

  json(response, 404, { error: "Route not found" });
}

await ensureStorefrontBucket(bucket);

createServer((request, response) => {
  route(request, response).catch((error: unknown) => {
    if (error instanceof ZodError) {
      json(response, 400, { error: "Invalid release request", issues: error.issues });
    } else if (error instanceof InfraiError) {
      json(response, clientStatus(error), { error: error.code, message: error.message });
    } else {
      console.error(error);
      json(response, 500, { error: "Image release failed" });
    }
  });
}).listen(port, () => {
  console.log(`Storefront image service listening on http://localhost:${port}`);
});
