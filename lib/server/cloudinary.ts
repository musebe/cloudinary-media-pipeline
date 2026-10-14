import "server-only";
import { v2 as cloudinary } from "cloudinary";
import { z } from "zod";

const credentialsSchema = z.object({
  cloud_name: z.string().trim().min(1),
  api_key: z.string().trim().min(1),
  api_secret: z.string().trim().min(1),
});

export function getCloudinary() {
  const credentials = credentialsSchema.safeParse({
    cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  if (!credentials.success) {
    throw new Error("Cloudinary credentials are not configured.");
  }
  cloudinary.config({ ...credentials.data, secure: true });
  return cloudinary;
}

export async function getAssetById(assetId: string): Promise<unknown> {
  const api = getCloudinary().api;
  // SDK 2.11 implements this documented method but omits its TypeScript declaration.
  const readAsset: unknown = Reflect.get(api, "resource_by_asset_id");
  if (typeof readAsset !== "function")
    throw new Error("Asset-ID readback is unavailable.");
  const result: unknown = await readAsset.call(api, assetId, {
    timeout: 15000,
  });
  return result;
}
