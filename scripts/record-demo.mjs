/** Explicit, bounded fixture preparation. Never runs as part of install, build, or page load. */
import { readFile, writeFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import sharp from "sharp";

if (!process.argv.includes("--confirm-three-transformations")) {
  throw new Error(
    "Requires explicit authorization for three standard transformations and five verification reads.",
  );
}
const fixture = JSON.parse(
  await readFile(
    new URL("../fixtures/demo-image.json", import.meta.url),
    "utf8",
  ),
);
const source = fixture.cloudinary.asset;
const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
if (cloudName !== fixture.cloudinary.cloudName)
  throw new Error("The fixture belongs to another product environment.");
const outputs = [
  {
    recipe: "storefront",
    transformation: "b_white,c_pad,h_1200,w_1200/q_80",
    width: 1200,
    height: 1200,
  },
  {
    recipe: "social",
    transformation: "c_fill,g_center,h_630,w_1200/q_80",
    width: 1200,
    height: 630,
  },
  {
    recipe: "catalog",
    transformation: "b_white,c_pad,h_1600,w_1600/q_80",
    width: 1600,
    height: 1600,
  },
];
for (const output of outputs) {
  try {
    await access(
      new URL(`../public/demo/${output.recipe}.webp`, import.meta.url),
    );
    throw new Error(
      "The demo outputs already exist. Do not regenerate them inadvertently.",
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
cloudinary.config({
  cloud_name: cloudName,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});
function assertSource(asset) {
  if (
    asset.asset_id !== source.assetId ||
    asset.public_id !== source.publicId ||
    asset.version !== source.version ||
    asset.type !== "authenticated" ||
    asset.resource_type !== "image" ||
    asset.width !== source.width ||
    asset.height !== source.height ||
    asset.bytes !== source.bytes ||
    !asset.tags.includes("media-pipeline")
  )
    throw new Error("Saved source provenance no longer matches.");
}
// Two bounded Admin reads; one explicit call creates exactly three standard outputs.
assertSource(
  await cloudinary.api.resource_by_asset_id(source.assetId, { timeout: 15000 }),
);
const generated = await cloudinary.uploader.explicit(source.publicId, {
  type: "authenticated",
  resource_type: "image",
  eager: outputs.map((output) => `${output.transformation}/webp`).join("|"),
  eager_async: false,
  timeout: 25000,
});
assertSource(generated);
if (generated.eager?.length !== 3)
  throw new Error("Expected exactly three outputs.");
const readback = await cloudinary.api.resource_by_asset_id(source.assetId, {
  timeout: 15000,
});
assertSource(readback);
const records = [];
for (const output of outputs) {
  const matches = (transformation) =>
    transformation === output.transformation ||
    transformation === `${output.transformation}/webp`;
  const eager = generated.eager.find(
    (item) => matches(item.transformation) && item.format === "webp",
  );
  const derived = readback.derived?.find(
    (item) => matches(item.transformation) && item.format === "webp",
  );
  if (
    !eager ||
    !derived ||
    !/^[a-f0-9]{32}$/.test(derived.id) ||
    eager.width !== output.width ||
    eager.height !== output.height ||
    eager.bytes !== derived.bytes
  )
    throw new Error("The generated output was not verified in readback.");
  const url = cloudinary.url(source.publicId, {
    type: "authenticated",
    resource_type: "image",
    version: source.version,
    raw_transformation: output.transformation,
    format: "webp",
    secure: true,
    sign_url: true,
    signature_algorithm: "sha256",
  });
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (
    !response.ok ||
    response.headers.get("x-cld-error") ||
    response.headers.get("content-type")?.split(";")[0] !== "image/webp"
  ) {
    throw new Error("An output was not delivered as WebP.");
  }
  // Standard outputs are well below 4 MB; still bound streamed responses before decoding.
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4000000) {
        await reader.cancel();
        throw new Error("Oversized output.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = Buffer.concat(chunks, size);
  const decoded = sharp(bytes, {
    limitInputPixels: 4000000,
    failOn: "warning",
  });
  const metadata = await decoded.metadata();
  if (
    metadata.format !== "webp" ||
    metadata.width !== output.width ||
    metadata.height !== output.height ||
    (metadata.pages ?? 1) !== 1 ||
    bytes.length !== eager.bytes
  )
    throw new Error(
      "The delivered output does not match its declared artifact.",
    );
  await decoded.raw().toBuffer();
  const imagePath = `/demo/${output.recipe}.webp`;
  // Persist downloaded binary assets, not generated mock images or signed delivery URLs.
  await writeFile(new URL(`../public${imagePath}`, import.meta.url), bytes, {
    flag: "wx",
  });
  records.push({
    imagePath,
    derivative: {
      source: {
        assetId: source.assetId,
        publicId: source.publicId,
        version: source.version,
      },
      ...output,
      derivedAssetId: derived.id,
      format: "webp",
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      verifiedAt: new Date().toISOString(),
    },
  });
}
console.log(
  JSON.stringify(
    {
      schemaVersion: "media-pipeline.outputs.v1",
      cloudName,
      operations: {
        standardTransformations: 3,
        adminReads: 2,
        deliveryReads: 3,
        aiCalls: 0,
      },
      outputs: records,
    },
    null,
    2,
  ),
);
