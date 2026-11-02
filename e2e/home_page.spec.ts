import { clickToNavigate, expect, test } from "./fixtures";

// The intro page at /: heading, role line, location, intro, the two doors into
// /hire and the header marking. It never submits the /hire form.

const PRODUCT_DOOR = /^Building a product\?/;
const AI_DOOR = /^Want to automate your processes with AI\?/;

test.describe("home page", () => {
  test("shows the heading, role, location and intro", async ({ page }) => {
    await page.goto("/");
    const heading = page.getByRole("heading", { level: 1, name: "Sviatlana Buben" });
    const role = page.getByText("Product Engineer, AI Consultant");
    const location = page.getByText("Remote, Lisbon");
    await expect(heading).toBeVisible();
    await expect(role).toBeVisible();
    await expect(location).toBeVisible();

    // "Directly under it": the role line below the heading, the location below the role line.
    const headingBox = await heading.boundingBox();
    const roleBox = await role.boundingBox();
    const locationBox = await location.boundingBox();
    if (!headingBox || !roleBox || !locationBox) throw new Error("intro lines have no box");
    expect(roleBox.y).toBeGreaterThanOrEqual(headingBox.y + headingBox.height);
    expect(locationBox.y).toBeGreaterThanOrEqual(roleBox.y + roleBox.height);

    await expect(page.getByText("Offline: running guest house issebya.com")).toBeVisible();
    await expect(page.getByRole("link", { name: "issebya.com" })).toHaveAttribute(
      "href",
      "https://www.issebya.com",
    );
    await expect(page.getByText("Love forest bathing, NTS, PostHog")).toBeVisible();
    await expect(page.getByText("[Placeholder]")).toHaveCount(0);
    await expect(page.getByText(/^Online:/)).toHaveCount(0);
  });

  test("has two doors into /hire, each only its title, on one row", async ({ page }) => {
    await page.goto("/");
    const product = page.getByRole("link", { name: PRODUCT_DOOR });
    const ai = page.getByRole("link", { name: AI_DOOR });
    await expect(product).toHaveAttribute("href", "/hire?offer=product-engineer");
    await expect(ai).toHaveAttribute("href", "/hire?offer=ai-consulting");
    await expect(product).toHaveText("Building a product?");
    await expect(ai).toHaveText("Want to automate your processes with AI?");

    const productBox = await product.boundingBox();
    const aiBox = await ai.boundingBox();
    if (!productBox || !aiBox) throw new Error("doors have no box");
    expect(aiBox.y).toBe(productBox.y);
  });

  test("has no run rows, sidebar or connection indicator", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /^Today,/ })).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Projects" })).toHaveCount(0);
  });

  test("marks the brand as current, not Watch me build", async ({ page }) => {
    await page.goto("/");
    const banner = page.getByRole("banner");
    await expect(banner.getByRole("link", { name: /^Sviatlana Buben/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      page
        .getByRole("navigation", { name: "Sections" })
        .getByRole("link", { name: "Watch me build" }),
    ).not.toHaveAttribute("aria-current");
  });

  test("each door opens /hire with its offer fixed", async ({ page }) => {
    const offer = page.locator('input[type="hidden"][name="offer"]');

    await page.goto("/");
    // clickToNavigate waits for the door to hydrate first: / has no pill.
    await clickToNavigate(
      page.getByRole("link", { name: PRODUCT_DOOR }),
      "/hire?offer=product-engineer",
    );
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await expect(offer).toHaveValue("Product engineer");
    await expect(page.getByLabel("What are you building?")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(0);

    await page.goBack();
    await expect(page).toHaveURL("/");
    await clickToNavigate(page.getByRole("link", { name: AI_DOOR }), "/hire?offer=ai-consulting");
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await expect(offer).toHaveValue("AI consulting");
    await expect(page.getByLabel("Tell me about your business")).toBeVisible();
    await expect(page.getByText("Structure and automate your processes with AI")).toHaveCount(0);
  });

  test("Watch me build leads to /projects and becomes current", async ({ page }) => {
    await page.goto("/");
    const watch = page
      .getByRole("navigation", { name: "Sections" })
      .getByRole("link", { name: "Watch me build" });
    await clickToNavigate(watch, "/projects");
    await expect(page.getByRole("heading", { level: 2, name: "Building now" })).toBeVisible();
    await expect(watch).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("banner").getByRole("link", { name: /^Sviatlana Buben/ }),
    ).not.toHaveAttribute("aria-current");
  });

  test("stacks the doors at 375px with no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    const product = page.getByRole("link", { name: PRODUCT_DOOR });
    const ai = page.getByRole("link", { name: AI_DOOR });
    await expect(ai).toBeVisible();

    const productBox = await product.boundingBox();
    const aiBox = await ai.boundingBox();
    if (!productBox || !aiBox) throw new Error("doors have no box");
    expect(aiBox.y).toBeGreaterThan(productBox.y + productBox.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      375,
    );
    await expect(page.getByText("Remote, Lisbon")).toBeVisible();
  });
});
