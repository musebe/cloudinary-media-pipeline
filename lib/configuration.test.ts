import { describe, expect, it } from "vitest";
import { getConfigurationStatus } from "./configuration";

describe("configuration status", () => {
  const configured = {
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: "test-cloud",
    CLOUDINARY_API_KEY: "123456789",
    CLOUDINARY_API_SECRET: "synthetic-server-secret",
    DEMO_SESSION_SECRET: "s".repeat(32),
    ENABLE_LIVE_PIPELINE: "true",
  };
  it("permits explicit local ingestion but never enables uploads in production", () => {
    expect(
      getConfigurationStatus({ ...configured, NODE_ENV: "development" })
        .capabilities.liveIngestion,
    ).toBe(true);
    expect(
      getConfigurationStatus({ ...configured, NODE_ENV: "production" })
        .capabilities.liveIngestion,
    ).toBe(false);
    expect(
      getConfigurationStatus({ ...configured, NODE_ENV: "test" }).capabilities
        .liveIngestion,
    ).toBe(false);
    expect(
      getConfigurationStatus({
        NODE_ENV: "development",
        ENABLE_LIVE_PIPELINE: "true",
      }).capabilities.liveIngestion,
    ).toBe(false);
  });
  it("bounds the upload limit and rejects invalid configuration", () => {
    expect(
      getConfigurationStatus({ MAX_UPLOAD_BYTES: "9000000" }).maxUploadBytes,
    ).toBe(4000000);
    expect(
      getConfigurationStatus({ MAX_UPLOAD_BYTES: "1000000" }).maxUploadBytes,
    ).toBe(1000000);
    expect(
      getConfigurationStatus({ MAX_UPLOAD_BYTES: "NaN" }).maxUploadBytes,
    ).toBe(4000000);
    expect(
      getConfigurationStatus({ MAX_UPLOAD_BYTES: "-1" }).maxUploadBytes,
    ).toBe(4000000);
  });
  it("keeps the local preview usable without credentials", () => {
    const status = getConfigurationStatus({});
    expect(status.cloudinary.configured).toBe(false);
    expect(status.capabilities.planPreview).toBe(true);
    expect(status.capabilities.liveExecution).toBe(false);
  });

  it("does not count whitespace or template placeholders as credentials", () => {
    const status = getConfigurationStatus({
      NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: "your-cloud-name",
      CLOUDINARY_API_KEY: "   ",
      CLOUDINARY_API_SECRET: "<your-secret>",
    });
    expect(status.cloudinary.configured).toBe(false);
  });

  it("distinguishes supplied credentials from authenticated access", () => {
    const status = getConfigurationStatus({
      NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: "test-cloud",
      CLOUDINARY_API_KEY: "123456789",
      CLOUDINARY_API_SECRET: "synthetic-server-secret",
    });
    expect(status.cloudinary.configured).toBe(true);
    expect(status.cloudinary.verified).toBe(false);
  });

  it("never serializes secret values", () => {
    const values = {
      CLOUDINARY_API_SECRET: "synthetic-cloudinary-secret",
      DEMO_SESSION_SECRET: "synthetic-reviewer-secret-that-is-long-enough",
    };
    const publicStatus = JSON.stringify(getConfigurationStatus(values));
    expect(publicStatus).not.toContain(values.CLOUDINARY_API_SECRET);
    expect(publicStatus).not.toContain(values.DEMO_SESSION_SECRET);
  });

  it("requires a sufficiently long reviewer secret", () => {
    expect(
      getConfigurationStatus({ DEMO_SESSION_SECRET: "short" })
        .reviewerSessionConfigured,
    ).toBe(false);
    expect(
      getConfigurationStatus({ DEMO_SESSION_SECRET: "s".repeat(32) })
        .reviewerSessionConfigured,
    ).toBe(true);
  });

  it("cannot enable unimplemented live or paid operations through environment flags", () => {
    const status = getConfigurationStatus({
      ENABLE_LIVE_PIPELINE: "true",
      ENABLE_PAID_ANALYSIS: "true",
    });
    expect(status.capabilities.liveExecution).toBe(false);
    expect(status.capabilities.paidAnalysis).toBe(false);
    expect(status.capabilities.modelBackedPlanning).toBe(false);
  });
});
