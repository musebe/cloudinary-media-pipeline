type EnvironmentValues = Record<string, string | undefined>;

function isConfigured(value: string | undefined) {
  const normalized = value?.trim();
  return Boolean(
    normalized && !/^your[_-]|^replace[_-]|^<.+>$/i.test(normalized),
  );
}

export function getConfigurationStatus(values: EnvironmentValues) {
  return {
    mode: "preview" as const,
    cloudinary: {
      configured: [
        values.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
        values.CLOUDINARY_API_KEY,
        values.CLOUDINARY_API_SECRET,
      ].every(isConfigured),
      verified: false,
    },
    reviewerSessionConfigured: Boolean(
      isConfigured(values.DEMO_SESSION_SECRET) &&
      values.DEMO_SESSION_SECRET!.trim().length >= 32,
    ),
    capabilities: {
      planPreview: true,
      liveExecution: false,
      paidAnalysis: false,
      modelBackedPlanning: false,
    },
  };
}

export type ConfigurationStatus = ReturnType<typeof getConfigurationStatus>;
