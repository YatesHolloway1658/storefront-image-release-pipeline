import sharp from "sharp";
import { z } from "zod";

export const imageReleaseRequest = z.object({
  releaseId: z.string().min(3).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  productSlug: z.string().min(2).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  imageBase64: z.string().min(1),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  thumbnailWidth: z.number().int().min(160).max(1600).default(640),
});

export type ImageReleaseInput = z.infer<typeof imageReleaseRequest>;

export type ReleaseOperation = {
  operation: "store-original" | "store-thumbnail";
  objectKey: string;
  state: "completed";
};

export type BuildEvent = {
  type: "image.release.completed";
  releaseId: string;
  productSlug: string;
  thumbnail: { width: number; format: "webp"; bytes: number };
  operations: ReleaseOperation[];
};

export type ImageWriter = (key: string, dataBase64: string, contentType: string, idempotencyKey: string) => Promise<void>;

export async function buildStorefrontImageRelease(input: ImageReleaseInput, writeImage: ImageWriter): Promise<BuildEvent> {
  const original = Buffer.from(input.imageBase64, "base64");
  const thumbnail = await sharp(original)
    .rotate()
    .resize({ width: input.thumbnailWidth, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  const originalExtension = input.contentType.split("/")[1];
  const originalKey = `releases/${input.releaseId}/${input.productSlug}/source.${originalExtension}`;
  const thumbnailKey = `releases/${input.releaseId}/${input.productSlug}/thumbnail.webp`;

  await writeImage(originalKey, original.toString("base64"), input.contentType, `${input.releaseId}:source`);
  await writeImage(thumbnailKey, thumbnail.toString("base64"), "image/webp", `${input.releaseId}:thumbnail`);

  return {
    type: "image.release.completed",
    releaseId: input.releaseId,
    productSlug: input.productSlug,
    thumbnail: { width: input.thumbnailWidth, format: "webp", bytes: thumbnail.byteLength },
    operations: [
      { operation: "store-original", objectKey: originalKey, state: "completed" },
      { operation: "store-thumbnail", objectKey: thumbnailKey, state: "completed" },
    ],
  };
}
