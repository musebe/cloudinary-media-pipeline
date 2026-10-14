import { expect, test, type Page } from "@playwright/test";

async function guardLocalRequests(page: Page) {
  const externalRequests = new Set<string>();
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:3003") {
      externalRequests.add(url.origin);
      await route.abort();
      return;
    }
    await route.continue();
  });
  return externalRequests;
}

test("previews five typed stages with a bundled image and no external services", async ({
  page,
}, testInfo) => {
  const externalRequests = await guardLocalRequests(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "One request. Every handoff visible." }),
  ).toBeVisible();
  await expect(
    page.getByText("Saved output preview", { exact: true }),
  ).toBeVisible();

  const previewButton = page.getByRole("button", { name: "Preview workflow" });
  await previewButton.focus();
  await page.keyboard.press("Enter");
  const plan = page.getByTestId("pipeline-plan");
  await expect(plan).toBeVisible();
  await expect(plan.locator('[data-testid^="stage-"]')).toHaveCount(5);
  await expect(
    plan.getByText("No operations performed", { exact: true }),
  ).toBeVisible();
  await expect(
    plan.getByText("1200 × 1200 · WebP · Preserve full image"),
  ).toBeVisible();

  const delivery = page.getByTestId("stage-deliver");
  await expect(
    delivery.getByText("Waits for: transform + policy"),
  ).toBeVisible();
  await delivery.getByText("Inputs and allowed tools", { exact: true }).click();
  await expect(
    delivery.getByText("cloudinary.delivery.sign", { exact: true }),
  ).toBeVisible();

  await expect(page.locator("img")).toHaveCount(1);
  await expect(page.locator("video")).toHaveCount(0);
  await expect(page.getByLabel("Or choose your own image")).toBeDisabled();
  expect([...externalRequests]).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `.test-artifacts/preview-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Preview workflow" }),
  ).toBeVisible();
});

test("uses the social recipe and clears stale plans after request or output edits", async ({
  page,
}) => {
  await guardLocalRequests(page);
  await page.goto("/");
  await page
    .getByRole("radio", { name: "Social preview", exact: true })
    .click();
  await page.getByRole("button", { name: "Use example request" }).click();
  await expect(page.getByLabel("Your request")).toHaveValue(
    "Prepare a landscape social preview. Check the crop and send the image for approval before release.",
  );
  await page.getByRole("button", { name: "Preview workflow" }).click();
  await expect(page.getByTestId("pipeline-plan")).toContainText(
    "1200 × 630 · WebP · Crop requires review",
  );

  await page
    .getByLabel("Your request")
    .fill("Prepare this image for approval.");
  await expect(page.getByTestId("pipeline-plan")).toHaveCount(0);
  await expect(
    page.getByText("Saved output preview", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Preview workflow" }).click();
  await expect(page.getByTestId("pipeline-plan")).toBeVisible();
  await page.getByRole("radio", { name: "Catalog image", exact: true }).click();
  await expect(page.getByTestId("pipeline-plan")).toHaveCount(0);
  await expect(page.getByText("1600 × 1600 · WebP").first()).toBeVisible();

  await page.getByLabel("Your request").fill("   ");
  await expect(
    page.getByRole("button", { name: "Preview workflow" }),
  ).toBeDisabled();
});

test("shows a friendly alert when the preview service returns non-JSON", async ({
  page,
}) => {
  await guardLocalRequests(page);
  await page.route("**/api/pipelines/preview", (route) =>
    route.fulfill({
      status: 503,
      contentType: "text/plain",
      body: "The deployment returned an unexpected response.",
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Preview workflow" }).click();
  const alert = page
    .getByRole("alert")
    .filter({ hasText: "Request not completed" });
  await expect(alert).toContainText("Request not completed");
  await expect(alert).toContainText(
    "The preview service returned an unexpected response. Please try again.",
  );
  await expect(alert).not.toContainText("Unexpected token");
  await expect(page.getByTestId("pipeline-plan")).toHaveCount(0);
});

test("loads the saved demo without uploading or generating an image", async ({
  page,
}) => {
  const externalRequests = await guardLocalRequests(page);
  const mediaWrites: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /ingestions|cloudinary\.com/.test(request.url())
    )
      mediaWrites.push(request.url());
  });
  // Exercise the loader offline without asking Cloudinary to deliver any media.
  await page.route("**/api/demo?*", async (route) => {
    const response = await route.fetch();
    const result = await response.json();
    result.image.imageUrl = "/demo/product-shoe.jpg";
    await route.fulfill({ response, json: result });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Load saved demo" }).click();
  await expect(page.getByTestId("run-result")).toBeVisible();
  await expect(page.getByTestId("source-image").locator("img")).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved output ready" }),
  ).toBeVisible();
  await expect(page.getByLabel("Or choose your own image")).toBeDisabled();
  expect(mediaWrites).toEqual([]);
  expect([...externalRequests]).toEqual([]);
});

test("keeps primary and supporting text readable on light surfaces", async ({
  page,
}) => {
  await guardLocalRequests(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Preview workflow" }).click();
  await expect(page.getByTestId("pipeline-plan")).toBeVisible();

  const measurements = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    function rgba(color: string) {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    }
    function blend(front: number[], back: number[]) {
      const alpha = front[3] / 255;
      return front
        .slice(0, 3)
        .map((value, index) => value * alpha + back[index] * (1 - alpha));
    }
    function luminance(color: number[]) {
      const linear = color
        .map((value) => value / 255)
        .map((value) =>
          value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
        );
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    }
    return [
      "h1",
      "footer",
      "textarea",
      'button[type="submit"]',
      '[data-testid="pipeline-plan"] .text-muted-foreground',
    ].map((selector) => {
      const element = document.querySelector(selector)!;
      const ancestors: Element[] = [];
      for (let item: Element | null = element; item; item = item.parentElement)
        ancestors.unshift(item);
      let background = [255, 255, 255];
      for (const item of ancestors)
        background = blend(
          rgba(getComputedStyle(item).backgroundColor),
          background,
        );
      const foreground = blend(
        rgba(getComputedStyle(element).color),
        background,
      );
      const light = Math.max(luminance(foreground), luminance(background));
      const dark = Math.min(luminance(foreground), luminance(background));
      return { selector, contrast: (light + 0.05) / (dark + 0.05) };
    });
  });
  for (const result of measurements) {
    expect(result.contrast, result.selector).toBeGreaterThanOrEqual(4.5);
  }
});
