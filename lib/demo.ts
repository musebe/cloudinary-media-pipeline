import { z } from "zod";
import savedDemo from "@/fixtures/demo-image.json";
import { verifiedAssetSchema } from "@/lib/ingestion/contracts";

export const demoFixtureSchema = z
  .object({
    schemaVersion: z.literal("media-pipeline.demo.v1"),
    imagePath: z.literal("/demo/product-shoe.jpg"),
    alt: z.string().min(1).max(250),
    sourceUrl: z.literal(
      "https://res.cloudinary.com/demo/image/upload/cld-sample-5.jpg",
    ),
    cloudinary: z
      .object({
        cloudName: z.string().regex(/^[a-z0-9_-]+$/),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        asset: verifiedAssetSchema,
      })
      .strict()
      .nullable(),
  })
  .strict();

export const demoFixture = demoFixtureSchema.parse(savedDemo);
export const bundledDemo = {
  imageUrl: demoFixture.imagePath,
  alt: demoFixture.alt,
  width: 1870,
  height: 1250,
  asset: null,
  source: "bundled-demo" as const,
};

export const demoImageSchema = z
  .object({
    imageUrl: z.string().min(1),
    alt: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    asset: verifiedAssetSchema.nullable(),
    source: z.enum(["bundled-demo", "cloudinary-demo", "upload"]),
  })
  .strict();
export type DemoImage = z.infer<typeof demoImageSchema>;
