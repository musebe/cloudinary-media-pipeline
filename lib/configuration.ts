type EnvironmentValues = Record<string, string | undefined>;

function isConfigured(value: string | undefined) {
  const normalized = value?.trim();
  return Boolean(
    normalized && !/^your[_-]|^replace[_-]|^<.+>$/i.test(normalized),
  );
}

export function getConfigurationStatus(values: EnvironmentValues) {
  const cloudinaryConfigured = [
    values.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    values.CLOUDINARY_API_KEY,
    values.CLOUDINARY_API_SECRET,
  ].every(isConfigured);
  const reviewerSessionConfigured = Boolean(
    isConfigured(values.DEMO_SESSION_SECRET) &&
    values.DEMO_SESSION_SECRET!.trim().length >= 32,
  );
  const requestedLimit = Number(values.MAX_UPLOAD_BYTES ?? 4000000);
  return {
    mode: "preview" as const,
    cloudinary: {
      configured: cloudinaryConfigured,
      verified: false,
    },
    reviewerSessionConfigured,
    maxUploadBytes:
      Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 4000000)
        : 4000000,
    capabilities: {
      planPreview: true,
      liveIngestion:
        values.ENABLE_LIVE_PIPELINE === "true" &&
        values.NODE_ENV === "development" &&
        cloudinaryConfigured &&
        reviewerSessionConfigured,
      liveExecution: false,
      paidAnalysis: false,
      modelBackedPlanning: false,
    },
  };
}

export type ConfigurationStatus = ReturnType<typeof getConfigurationStatus>;
