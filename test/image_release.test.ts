import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { buildStorefrontImageRelease, imageReleaseRequest } from "../src/image_release.js";

test("a product image release stores its source before a bounded WebP thumbnail", async () => {
  const imageBase64 = (await sharp({
    create: { width: 320, height: 200, channels: 3, background: "#f1c21b" },
  }).png().toBuffer()).toString("base64");
  const writes: Array<{ key: string; bytes: Buffer; contentType: string; idempotencyKey: string }> = [];

  const input = imageReleaseRequest.parse({
    releaseId: "catalog-17",
    productSlug: "linen-market-tote",
    imageBase64,
    contentType: "image/png",
    thumbnailWidth: 160,
  });
  const event = await buildStorefrontImageRelease(input, async (key, data, contentType, idempotencyKey) => {
    writes.push({ key, bytes: Buffer.from(data, "base64"), contentType, idempotencyKey });
  });

  assert.deepEqual(writes.map(({ key, contentType, idempotencyKey }) => ({ key, contentType, idempotencyKey })), [
    { key: "releases/catalog-17/linen-market-tote/source.png", contentType: "image/png", idempotencyKey: "catalog-17:source" },
    { key: "releases/catalog-17/linen-market-tote/thumbnail.webp", contentType: "image/webp", idempotencyKey: "catalog-17:thumbnail" },
  ]);
  const metadata = await sharp(writes[1].bytes).metadata();
  assert.equal(metadata.width, 160);
  assert.equal(metadata.format, "webp");
  assert.equal(event.type, "image.release.completed");
  assert.deepEqual(event.operations.map((operation) => operation.state), ["completed", "completed"]);
});
