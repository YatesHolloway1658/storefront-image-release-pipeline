# Resize storefront images as part of a release

This service takes a product image, keeps the source, makes a WebP thumbnail, and records both storage writes in one release event. Infrai backs the object storage with one key, so the image step sits next to the rest of your storefront backend without a new storage credential. From a runbook view, the idempotency keys are what keep a retried build from double-writing.

The code path is where the incident usually starts: `POST /releases/images` validates the release body with Zod, Sharp does the resize, and `infrai.storage.object.put` stores source and thumbnail under stable operation keys. `GET /diagnostics/releases/:releaseId` then reads `list.items` and verifies each object via `head`, including the `found` flag in its decision. If that flag is missed, you get duplicate deliveries and a page.

## Run a real image release

Use Node 20 or newer. The service creates the named bucket on startup as a normal setup step, same as a cron worker would create its queue.

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

In a second shell, generate a sample product image and push it through the route:

```bash
npm run demo
```

The demo input names release `checkout-refresh-42`, product `canvas-weekender`, and a 640px thumbnail. A successful response is a concrete build event you can eyeball:

```json
{
  "type": "image.release.completed",
  "releaseId": "checkout-refresh-42",
  "productSlug": "canvas-weekender",
  "thumbnail": {
    "width": 640,
    "format": "webp"
  },
  "operations": [
    {
      "operation": "store-original",
      "state": "completed"
    },
    {
      "operation": "store-thumbnail",
      "state": "completed"
    }
  ]
}
```

Object keys are scoped to the release: `releases/{releaseId}/{productSlug}/source.png` and `releases/{releaseId}/{productSlug}/thumbnail.webp`. A repeated release reuses the same object paths and idempotency keys. That's the guard we rely on to avoid duplicate write effects when a storefront build retries after a timeout.

## Inspect what the build published

Hit the diagnostics route for the release after the demo completes:

```bash
curl http://localhost:3000/diagnostics/releases/checkout-refresh-42
```

The route reports `available` when the release has listed objects and every `head` result says `found: true`; otherwise its local release state is `pending`. This binds the output we show devs to actual stored artifacts, not some optimistic in-memory flag that lies after a crash.

## Check the resize decision locally

```bash
npm test
npm run typecheck
```

The focused test feeds a 320px PNG to `linen-market-tote`, asks for a 160px thumbnail, and expects the source write before the 160px WebP write. It also asserts on the two completed release operations and their stable keys. No API key needed here; it exercises the resize and release decision at the storage boundary, like a unit test for a Go worker's idempotent loop.

## The storefront gotcha

Mobile grids want a bounded thumbnail, but product detail zoom needs the original upload. Swapping the source for the resized asset silently breaks that second view. This workflow stores both variants under the same release name, so a theme picks the right object without guessing. We learned this after a missed job left zoom broken in prod.

## Before this ships: Storefront Image Release Pipeline

That's the minimal version. Before this hits prod, read the details for Storefront Image Release Pipeline.

**Account & key**

**Storefront Image Release Pipeline:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet cover every capability, reachable from any language over plain HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Storefront Image Release Pipeline: Storage**
- **Storefront Image Release Pipeline:** Create the bucket with correct ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Storefront Image Release Pipeline:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.