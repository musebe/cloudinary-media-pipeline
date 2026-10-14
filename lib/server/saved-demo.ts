import "server-only";
import { bundledDemo, demoFixture, type DemoImage } from "@/lib/demo";
import { getConfigurationStatus } from "@/lib/configuration";
import { getReviewerImageUrl } from "@/lib/server/ingestion";

export function getSavedDemo(): DemoImage {
  const record = demoFixture.cloudinary;
  const configured = getConfigurationStatus(process.env).cloudinary.configured;
  if (
    !record ||
    !configured ||
    record.cloudName !== process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim()
  )
    return bundledDemo;
  return {
    imageUrl: getReviewerImageUrl(record.asset),
    alt: demoFixture.alt,
    width: record.asset.width,
    height: record.asset.height,
    asset: record.asset,
    source: "cloudinary-demo",
  };
}
