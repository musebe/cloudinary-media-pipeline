import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import outputs from "../fixtures/demo-outputs.json";

test("shows the first saved output on initial load without starting a run", async ({
  page,
}, testInfo) => {
  const mutations: string[] = [];
  const external: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") mutations.push(request.url());
  });
  await page.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin !== "http://127.0.0.1:3003") {
      external.push(route.request().url());
      await route.abort();
    } else await route.continue();
  });
  await page.goto("/");
  const preview = page.getByTestId("saved-output-preview");
  const image = preview.locator("img");
  await expect(preview).toBeVisible();
  await expect(image).toHaveAttribute("src", /\/demo\/storefront\.webp$/);
  await expect(image).toHaveAttribute("loading", "eager");
  await expect(image).toHaveJSProperty("naturalWidth", 1200);
  await expect(preview).toContainText("Saved preview · not approved");
  await expect(page.getByRole("link", { name: "Download WebP" })).toHaveCount(
    0,
  );
  await expect(page.getByTestId("run-result")).toHaveCount(0);
  await expect(
    page.getByText("Your workflow starts here", { exact: true }),
  ).toHaveCount(0);
  expect(mutations).toEqual([]);
  expect(external).toEqual([]);
  await page.screenshot({
    path: `.test-artifacts/initial-output-${testInfo.project.name}.png`,
    fullPage: true,
  });
  expect((await page.request.get("/api/pipelines/current")).status()).toBe(401);
  await page
    .getByRole("radio", { name: "Social preview", exact: true })
    .click();
  await expect(preview.locator("img")).toHaveAttribute(
    "src",
    /\/demo\/social\.webp$/,
  );
  await expect(preview.locator("img")).toHaveJSProperty("naturalHeight", 630);
  await preview
    .getByRole("button", { name: "Review this output", exact: true })
    .click();
  await expect(page.getByTestId("run-result")).toBeVisible();
});

test("loads, reviews, releases, and restores a saved output with no external requests", async ({
  page,
}, testInfo) => {
  const external: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin !== "http://127.0.0.1:3003") {
      external.push(route.request().url());
      await route.abort();
    } else await route.continue();
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Load saved demo", exact: true })
    .click();
  await expect(page.getByTestId("run-result")).toBeVisible();
  const image = page.getByTestId("output-image").locator("img");
  await expect(image).toBeVisible();
  await expect(image).toHaveJSProperty("naturalWidth", 1200);
  expect(await image.getAttribute("srcset")).toBeNull();
  await expect(
    page.getByRole("button", { name: "Approve output", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("link", { name: "Download WebP" })).toHaveCount(
    0,
  );
  const current = await (
    await page.request.get("/api/pipelines/current")
  ).json();
  const blocked = await page.request.get(
    current.outputImageUrl + "&download=1",
  );
  expect(blocked.status()).toBe(403);
  for (const name of [
    "The product and crop look right",
    "The image is appropriate for this use",
    "I have permission to use this image",
  ]) {
    await page.getByRole("checkbox", { name, exact: true }).check();
  }
  await page
    .getByRole("button", { name: "Approve output", exact: true })
    .click();
  await expect(
    page.getByText("Approved · not released", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Verify & release", exact: true })
    .click();
  await expect(page.getByText("Released", { exact: true })).toBeVisible();
  const href = await page
    .getByRole("link", { name: "Download WebP", exact: true })
    .getAttribute("href");
  const download = await page.request.get(href!);
  expect(download.status()).toBe(200);
  expect(download.headers()["content-disposition"]).toContain("attachment");
  expect(download.headers()["cache-control"]).toBe("private, no-store");
  expect(
    createHash("sha256")
      .update(await download.body())
      .digest("hex"),
  ).toBe(outputs.outputs[0].derivative.sha256);
  await page
    .getByRole("button", { name: "Load saved demo", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Download WebP", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `.test-artifacts/completed-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Resume previous review", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Download WebP", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("radio", { name: "Social preview", exact: true })
    .click();
  await expect(page.getByTestId("run-result")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Prepare output", exact: true })
    .click();
  await expect(
    page.getByText("Awaiting approval", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTestId("output-image").locator("img"),
  ).toHaveJSProperty("naturalHeight", 630);
  await expect(page.getByRole("link", { name: "Download WebP" })).toHaveCount(
    0,
  );
  await page.setViewportSize({ width: 320, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("rejection locks release, a new review clears it, and the benchmark is reproducible", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Load saved demo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reject output", exact: true })
    .click();
  await expect(
    page.getByText("Rejected", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Verify & release" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Start new review", exact: true })
    .click();
  await expect(
    page.getByText("Awaiting approval", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve output", exact: true }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Release checks", exact: true }).click();
  await page
    .getByRole("button", { name: "Run contract benchmark", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("30/30");
  await expect(page.getByRole("row")).toHaveCount(31);
  await expect(page.getByText(/not AI accuracy/i)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("shows a friendly error for a non-JSON execution response", async ({
  page,
}) => {
  await page.route("**/api/pipelines/execute", (route) =>
    route.fulfill({
      status: 503,
      contentType: "text/plain",
      body: "The deployment failed",
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Prepare output", exact: true })
    .click();
  const alert = page
    .getByRole("alert")
    .filter({ hasText: "Request not completed" });
  await expect(alert).toContainText(
    "The service returned an unexpected response.",
  );
  await expect(alert).not.toContainText("Unexpected token");
  await expect(page.getByTestId("run-result")).toHaveCount(0);
});
