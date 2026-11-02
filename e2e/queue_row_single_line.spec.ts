import {
  expect,
  hasQueuedItem,
  openFirstProject,
  requireProject,
  section,
  sectionRows,
  test,
} from "./fixtures";

// Each Queue row is one row (issue number, title, the `queued` or `waiting`
// pill, the title may wrap). A queued row has no `label:` chip, no wait and no
// start hint; a row held on a dependency adds only the toolkit's reason, one
// line (under the title on a phone, beside it from `sm` up). The rail markers read `next`, then the ordinals, over the
// queued rows only; a waiting row's marker is empty.

test.describe("queue row single line", () => {
  test("Up next shows the queue or the empty panel", async ({ page }) => {
    await openFirstProject(page);
    const upNext = section(page, "Up next");
    await expect(
      page.getByRole("main").getByRole("heading", { level: 2, name: "Up next", exact: true }),
    ).toBeVisible();
    await expect(
      sectionRows(page, "Up next")
        .first()
        .or(upNext.getByText("Nothing queued.", { exact: true })),
    ).toBeVisible();
  });

  test("queue rows are single, marked rows", async ({ page }) => {
    await requireProject(page, hasQueuedItem, "no project has a queued item");
    const rows = sectionRows(page, "Up next");
    const count = await rows.count();

    // The gutter is the li's first div; it holds the marker.
    const marker = (i: number) => rows.nth(i).locator("xpath=./div").first();
    let ordinal = 0;

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      await expect(row).toContainText(/#\d+/);
      const pill = row.getByText(/^(queued|waiting)$/);
      await expect(pill).toBeVisible();
      const status = (await pill.textContent())?.trim();

      if (status === "queued") {
        ordinal += 1;
        await expect(marker(i)).toHaveText(ordinal === 1 ? "next" : String(ordinal));
      } else {
        await expect(marker(i)).toHaveText("");
      }

      // The forbidden words are row chrome, so the issue title, the reason
      // and the pill are left out: a live title can hold them ("awaiting"
      // contains "waiting").
      const chrome = await row.evaluate((li) => {
        const clone = li.cloneNode(true) as HTMLElement;
        const card = clone.querySelector(":scope > div:last-of-type");
        const title = card?.querySelector("a")?.nextElementSibling;
        if (
          title?.tagName === "SPAN" &&
          title.children.length === 0 &&
          !title.hasAttribute("title")
        )
          title.remove();
        card?.querySelector("span[title]")?.remove();
        for (const span of Array.from(clone.querySelectorAll("span"))) {
          const text = span.textContent?.trim();
          if (text === "queued" || text === "waiting") span.remove();
        }
        return clone.textContent ?? "";
      });
      const forbidden =
        status === "queued"
          ? ["label:", "waiting", "starts ", "manual", "Removing the label"]
          : ["label:"];
      for (const text of forbidden) {
        expect(chrome, chrome).not.toContain(text);
      }
      // The lower-case pill is expected; a capitalised `Queued` is not.
      expect(chrome, chrome).not.toMatch(/Queued/);
    }

    const g = await rows.first().evaluate((li) => {
      const card = li.querySelector(":scope > div:last-of-type");
      const link = card?.querySelector("a");
      if (!card || !link) throw new Error("the queue row has no card or issue link");
      const next = link.nextElementSibling;
      const title =
        next?.tagName === "SPAN" && next.children.length === 0 && !next.hasAttribute("title")
          ? next
          : null;
      const pill = Array.from(card.querySelectorAll("span")).find((s) =>
        ["queued", "waiting"].includes(s.textContent?.trim() ?? ""),
      );
      if (!pill) throw new Error("the queue row has no pill");
      const style = getComputedStyle(card);
      const pillRect = pill.getBoundingClientRect();
      return {
        pillTop: pillRect.top,
        pillRight: pillRect.right,
        refTop: (title ?? link).getBoundingClientRect().top,
        contentRight:
          card.getBoundingClientRect().right -
          parseFloat(style.borderRightWidth) -
          parseFloat(style.paddingRight),
      };
    });
    expect(Math.abs(g.pillTop - g.refTop)).toBeLessThanOrEqual(2);
    expect(Math.abs(g.pillRight - g.contentRight)).toBeLessThanOrEqual(2);
  });
});
