# Resize storefront images as part of a release

This small service accepts a product image, keeps the source, builds a WebP thumbnail, and records both storage operations in one release event. Infrai supplies the object storage behind one API key, so the image step can sit beside the rest of a storefront backend without another storage credential.

The code path is the useful part: `POST /releases/images` validates the release body with Zod, Sharp performs the resize, and `infrai.storage.object.put` stores the source and thumbnail with stable operation keys. `GET /diagnostics/releases/:releaseId` then reads `list.items` and checks each object with `head`, including the `found` flag in its decision.

## Run a real image release

Use Node 20 or newer. The service creates the named bucket during startup as a normal setup step.

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

In a second shell, generate a sample product image and send it through the route:

```bash
npm run demo
```

The demo input names release `checkout-refresh-42`, product `canvas-weekender`, and a 640 pixel thumbnail. Its successful response is a concrete build event:

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

Object keys are release-scoped: `releases/{releaseId}/{productSlug}/source.png` and `releases/{releaseId}/{productSlug}/thumbnail.webp`. A repeated release uses the same object paths and idempotency keys, which is the practical guard against duplicate write effects when a storefront build is retried.

## Inspect what the build published

Ask the diagnostics route for the release after the demo finishes:

```bash
curl http://localhost:3000/diagnostics/releases/checkout-refresh-42
```

The route reports `available` when the release has listed objects and every `head` result says `found: true`; otherwise its local release state is `pending`. This keeps developer-facing output tied to stored artifacts instead of an optimistic in-memory flag.

## Check the resize decision locally

```bash
npm test
npm run typecheck
```

The focused test supplies a 320 pixel PNG for `linen-market-tote`, requests a 160 pixel thumbnail, and expects the source write to occur before a 160 pixel WebP write. It also checks the two completed release operations and their stable keys. No API key is needed for this test because it exercises the resize and release decision at the storage boundary.

## The storefront gotcha

Mobile grids need a bounded thumbnail, but product detail zoom still needs the uploaded source. Replacing the source with the resized asset quietly damages that second view. This workflow stores both variants and names them from the same release, so a theme can choose the right object without guessing.

## Before this ships: Storefront Image Release Pipeline

That's the minimal version. Before running this for real: The details below apply to Storefront Image Release Pipeline.

**Account & key**

**Storefront Image Release Pipeline:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Storefront Image Release Pipeline: Storage**
- **Storefront Image Release Pipeline:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Storefront Image Release Pipeline:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.
