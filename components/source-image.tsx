"use client";

import Image from "next/image";
import { CldImage } from "next-cloudinary";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { bundledDemo, type DemoImage } from "@/lib/demo";

export function SourceImage({ image }: { image: DemoImage }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="source-image">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Source image</p>
        <Badge variant="outline">
          {image.source === "upload" ? "Your uploaded image" : "Reusable demo"}
        </Badge>
      </div>
      {failed && image.source !== "cloudinary-demo" ? (
        <Alert>
          <AlertTitle>Image preview unavailable</AlertTitle>
          <AlertDescription>
            The verification record remains below. Load the bundled demo to try
            another image.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="relative aspect-3/2 overflow-hidden rounded-lg border bg-muted">
          {image.asset && !failed ? (
            // Preserve the server-authorized original. Automatic responsive transformations
            // would alter the signed path and create unapproved derivatives in this stage.
            <CldImage
              src={image.asset.publicId}
              version={image.asset.version}
              deliveryType="authenticated"
              format="default"
              quality="default"
              overrideSrc={image.imageUrl}
              alt={image.alt}
              fill
              unoptimized
              loading="eager"
              sizes="(max-width: 1023px) 100vw, 420px"
              className="object-contain"
              referrerPolicy="no-referrer"
              onError={() => {
                setFailed(true);
                return false;
              }}
            />
          ) : (
            <Image
              src={failed ? bundledDemo.imageUrl : image.imageUrl}
              alt={image.alt}
              fill
              unoptimized
              loading="eager"
              sizes="(max-width: 1023px) 100vw, 420px"
              className="object-contain"
              referrerPolicy="no-referrer"
              onError={() => setFailed(true)}
            />
          )}
        </div>
      )}
      {failed && image.source === "cloudinary-demo" ? (
        <p className="text-xs text-muted-foreground">
          Cloudinary preview unavailable. Showing the bundled copy of the same
          demo image.
        </p>
      ) : null}
      {image.asset ? (
        <div className="flex flex-col gap-2 text-xs text-muted-foreground">
          <p>
            {image.asset.width} × {image.asset.height} ·{" "}
            {image.asset.format.toUpperCase()} ·{" "}
            {Math.round(image.asset.bytes / 1000)} KB
          </p>
          <p>
            {image.source === "cloudinary-demo"
              ? "Saved Cloudinary verification"
              : "Cloudinary readback verified"}{" "}
            · original remains authenticated
          </p>
          <details>
            <summary className="flex min-h-11 cursor-pointer items-center outline-none focus-visible:ring-2 focus-visible:ring-ring">
              View verification evidence
            </summary>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 pb-2">
              <dt>Asset ID</dt>
              <dd className="break-all font-mono">{image.asset.assetId}</dd>
              <dt>Version</dt>
              <dd>{image.asset.version}</dd>
              <dt>Verified</dt>
              <dd>{image.asset.verifiedAt}</dd>
            </dl>
          </details>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Included in the project. Loading this example creates no new
          Cloudinary asset.
        </p>
      )}
    </div>
  );
}
