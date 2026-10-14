import { describe, expect, it } from "vitest";

import rawDataset from "@/benchmarks/release-contracts-v1.json";

import {
  benchmarkDatasetSchema,
  benchmarkResultSchema,
  benchmarkScenarioSchema,
} from "./contracts";
import {
  benchmarkDataset,
  runBenchmark,
  summarizeBenchmarkResults,
} from "./run";

describe("release-contract benchmark dataset", () => {
  it("contains exactly thirty uniquely labeled independent scenarios", () => {
    expect(benchmarkDataset.cases).toHaveLength(30);
    expect(new Set(benchmarkDataset.cases.map((item) => item.id)).size).toBe(
      30,
    );
    expect(
      new Set(benchmarkDataset.cases.map((item) => item.scenario)).size,
    ).toBe(30);
    expect(benchmarkScenarioSchema.options).toHaveLength(30);
    expect(benchmarkDataset.description).toMatch(/not AI accuracy/);
  });

  it("labels three valid recipes and twenty-seven fail-closed cases", () => {
    const allowed = benchmarkDataset.cases.filter(
      (item) => item.expectedAllowed,
    );
    expect(allowed.map((item) => item.scenario)).toEqual([
      "valid_storefront",
      "valid_social",
      "valid_catalog",
    ]);
    expect(
      benchmarkDataset.cases.filter((item) => !item.expectedAllowed),
    ).toHaveLength(27);
    expect(
      allowed.every((item) => item.expectedCode === "release_allowed"),
    ).toBe(true);
  });

  it("rejects duplicate IDs, duplicate scenarios, and unknown dataset fields", () => {
    const first = rawDataset.cases[0];
    expect(
      benchmarkDatasetSchema.safeParse({
        ...rawDataset,
        cases: rawDataset.cases.map((item, index) =>
          index === 1 ? { ...item, id: first.id } : item,
        ),
      }).success,
    ).toBe(false);
    expect(
      benchmarkDatasetSchema.safeParse({
        ...rawDataset,
        cases: rawDataset.cases.map((item, index) =>
          index === 1 ? { ...item, scenario: first.scenario } : item,
        ),
      }).success,
    ).toBe(false);
    expect(
      benchmarkDatasetSchema.safeParse({ ...rawDataset, hiddenCase: true })
        .success,
    ).toBe(false);
  });

  it("rejects a changed case count and an unsupported expected decision", () => {
    expect(
      benchmarkDatasetSchema.safeParse({
        ...rawDataset,
        cases: rawDataset.cases.slice(0, 29),
      }).success,
    ).toBe(false);
    expect(
      benchmarkDatasetSchema.safeParse({
        ...rawDataset,
        cases: rawDataset.cases.map((item, index) =>
          index === 0 ? { ...item, expectedCode: "content_safe" } : item,
        ),
      }).success,
    ).toBe(false);
  });
});

describe("release-contract benchmark runner", () => {
  const result = runBenchmark();

  it.each(result.results)(
    "matches the explicit label for $id: $label",
    (item) => {
      expect(item.actualAllowed).toBe(item.expectedAllowed);
      expect(item.actualCode).toBe(item.expectedCode);
      expect(item.passed).toBe(true);
    },
  );

  it("reports measured counts without claiming AI or visual-content accuracy", () => {
    expect(benchmarkResultSchema.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({
      version: "release-contracts-v1",
      method: "deterministic-release-contract-checks",
      caseCount: 30,
      passed: 30,
      failed: 0,
      falseReleaseCount: 0,
      falseBlockCount: 0,
      accuracy: 100,
    });
    expect(result.limitation).toMatch(/not AI accuracy/);
    expect(result.limitation).toMatch(/legal rights/);
  });

  it("uses a fixed evaluation clock for reproducible decisions", () => {
    expect(runBenchmark().results).toEqual(result.results);
    expect(result.referenceTime).toBe("2026-10-14T12:00:00.000Z");
  });

  it("counts false releases and false blocks separately from wrong reason codes", () => {
    const approved = result.results[0];
    const blocked = result.results[3];
    expect(
      summarizeBenchmarkResults([
        {
          ...approved,
          actualAllowed: false,
          actualCode: "review_required",
          passed: false,
        },
        {
          ...blocked,
          actualAllowed: true,
          actualCode: "release_allowed",
          passed: false,
        },
        { ...blocked, actualCode: "invalid_run", passed: false },
        approved,
      ]),
    ).toEqual({
      passed: 1,
      failed: 3,
      falseReleaseCount: 1,
      falseBlockCount: 1,
      accuracy: 25,
    });
  });

  it("reports no completed cases as zero accuracy instead of NaN", () => {
    expect(summarizeBenchmarkResults([])).toEqual({
      passed: 0,
      failed: 0,
      falseReleaseCount: 0,
      falseBlockCount: 0,
      accuracy: 0,
    });
  });
});
