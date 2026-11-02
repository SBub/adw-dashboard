import {
  expect,
  expectNoHorizontalScroll,
  servedHtml,
  test,
  type Locator,
  type Page,
} from "./fixtures";

// Every day card with runs on /projects/log shows three chart cards under its
// header, What I worked on, Tokens by model and What each step cost: one row
// from 1024px, stacked on mobile. Classes, models and phases come in a fixed
// order; every value sits above its bar in regular weight, inside its card,
// tilted 45 degrees in the model and phase charts and upright in the class
// chart; class labels carry a colour dot, model and phase bars are one gray;
// the tooltips show the split, time, runs and share; the per-project table
// keeps its class bars. Nothing here hard-codes a day, a count or a model.

const CAPTIONS = [
  { title: "What I worked on", subtitle: "Runs finished that day" },
  { title: "Tokens by model", subtitle: "All tokens, including cache reads" },
  { title: "What each step cost", subtitle: "What each pipeline step cost that day" },
] as const;
const CLASS_TITLE = CAPTIONS[0].title;
const MODEL_TITLE = CAPTIONS[1].title;
const PHASE_TITLE = CAPTIONS[2].title;

const CLASS_LABEL = /^(\w+): (\d+) runs?$/;
const MODEL_ORDER = ["Haiku", "Sonnet", "Opus"];
const PHASE_ORDER = ["Plan", "Build", "Test", "Review", "Docs"];
const PHASE_VALUE = /^(\$\d+\.\d{2}|<\$0\.01)$/;
// A -45 degree rotation: a and b of the matrix are about 0.7071 and -0.7071.
const COS_45 = Math.SQRT1_2;

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

interface ColumnMeasure {
  label: string;
  name: string;
  box: Rect;
  nameRow: Rect & {
    scrollWidth: number;
    clientWidth: number;
    transform: string;
    dots: number;
    dotColor: string | null;
    media: number;
  };
  bar: (Rect & { color: string }) | null;
  above: number;
  value: (Rect & { fontWeight: string; transform: string; text: string; inBar: boolean }) | null;
}

interface FigureMeasure {
  title: string;
  subtitle: string;
  titleLeft: number;
  subtitleLeft: number;
  captionMarkers: number;
  caption: Rect;
  box: Rect;
  content: Rect;
  list: Rect | null;
  inside: number;
  text: string;
  columns: ColumnMeasure[];
}

interface CardMeasure {
  header: Rect;
  chartsFollowHeader: boolean;
  figures: FigureMeasure[];
}

// The day cards whose charts render: a card with runs has all three figures
// (the class chart renders nothing on a day without runs). The first is today's
// when today has runs, else the first past day's.
function chartCards(page: Page): Locator {
  return page.getByRole("article").filter({ has: page.getByRole("figure").nth(2) });
}

async function openLog(page: Page): Promise<Locator> {
  await page.goto("/projects/log");
  await expect(page.getByRole("heading", { level: 2, name: /^Today,/ })).toBeVisible();
  await expect(
    page
      .getByRole("article")
      .nth(1)
      .or(page.getByText("No finished runs in the previous 30 days.")),
  ).toBeVisible();
  const cards = chartCards(page);
  test.skip((await cards.count()) === 0, "no day with runs in the window");
  return cards.first();
}

// Today's card (when it has runs) and one past card: the first two chart cards.
async function placementCards(page: Page): Promise<Locator[]> {
  const cards = chartCards(page);
  return (await cards.count()) > 1 ? [cards.nth(0), cards.nth(1)] : [cards.nth(0)];
}

// Every box, colour and transform the checks below read, from one card.
async function measureCard(card: Locator): Promise<CardMeasure> {
  return card.evaluate((article) => {
    const rect = (el: Element) => {
      const { left, right, top, bottom, width, height } = el.getBoundingClientRect();
      return { left, right, top, bottom, width, height };
    };
    const header = article.querySelector(":scope > header");
    if (!header) throw new Error("the day card has no header");
    const figures = [...article.querySelectorAll("figure")].map((figure) => {
      const caption = figure.querySelector("figcaption");
      const [title, subtitle] = caption ? [...caption.children] : [];
      if (!caption || !title || !subtitle) throw new Error("a figure has no title and subtitle");
      const style = getComputedStyle(figure);
      const box = rect(figure);
      const content = {
        left: box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft),
        right: box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight),
        top: box.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop),
        bottom: box.bottom - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingBottom),
        width: 0,
        height: 0,
      };
      content.width = content.right - content.left;
      content.height = content.bottom - content.top;
      const list = figure.querySelector("ul");
      const columns = [...figure.querySelectorAll("li")].map((li) => {
        const nameRow = li.querySelector(":scope > span.mt-2");
        if (!nameRow) throw new Error("a column has no name row");
        const nameStyle = getComputedStyle(nameRow);
        const dots = nameRow.querySelectorAll('[aria-hidden="true"]');
        const firstDot = dots[0];
        const bar = li.querySelector('[style*="height"]');
        const values = li.querySelectorAll('[data-value-placement="above"]');
        const value = values[0];
        return {
          label: li.getAttribute("aria-label") ?? "",
          name: (nameRow.textContent ?? "").trim(),
          box: rect(li),
          nameRow: {
            ...rect(nameRow),
            scrollWidth: nameRow.scrollWidth,
            clientWidth: nameRow.clientWidth,
            transform: nameStyle.transform,
            dots: dots.length,
            dotColor: firstDot ? getComputedStyle(firstDot).backgroundColor : null,
            media: nameRow.querySelectorAll("img, svg").length,
          },
          bar: bar ? { ...rect(bar), color: getComputedStyle(bar).backgroundColor } : null,
          above: values.length,
          value: value
            ? {
                ...rect(value),
                fontWeight: getComputedStyle(value).fontWeight,
                transform: getComputedStyle(value).transform,
                text: (value.textContent ?? "").trim(),
                inBar: bar !== null && bar.contains(value),
              }
            : null,
        };
      });
      return {
        title: (title.textContent ?? "").trim(),
        subtitle: (subtitle.textContent ?? "").trim(),
        titleLeft: title.getBoundingClientRect().left,
        subtitleLeft: subtitle.getBoundingClientRect().left,
        captionMarkers: caption.querySelectorAll('[aria-hidden="true"]').length,
        caption: rect(caption),
        box,
        content,
        list: list ? rect(list) : null,
        inside: figure.querySelectorAll('[data-value-placement="inside"]').length,
        text: figure.textContent ?? "",
        columns,
      };
    });
    // The element right after the header holds the three figures.
    const charts = header.nextElementSibling;
    return {
      header: rect(header),
      chartsFollowHeader: charts !== null && charts.querySelectorAll("figure").length === 3,
      figures,
    };
  });
}

function figureOf(measure: CardMeasure, title: string): FigureMeasure {
  const figure = measure.figures.find((f) => f.title === title);
  if (!figure) throw new Error(`the card has no ${title} figure`);
  return figure;
}

// Whether a computed colour is a neutral gray (no chroma), in any notation
// Chromium serialises: rgb(), oklch(), oklab(), lch() or lab().
function isGray(color: string): boolean {
  const inner = color.slice(color.indexOf("(") + 1, color.lastIndexOf(")"));
  const n = inner.split(/[\s,/]+/).map((part) => Number.parseFloat(part));
  const [x = NaN, y = NaN, z = NaN] = n;
  if (color.startsWith("rgb")) return Math.abs(x - y) <= 1 && Math.abs(y - z) <= 1;
  if (color.startsWith("oklch")) return y < 0.01;
  if (color.startsWith("lch")) return y < 1;
  if (color.startsWith("oklab")) return Math.abs(y) < 0.01 && Math.abs(z) < 0.01;
  if (color.startsWith("lab")) return Math.abs(y) < 1 && Math.abs(z) < 1;
  throw new Error(`unknown colour notation: ${color}`);
}

function matrixOf(transform: string): { a: number; b: number } {
  const match = transform.match(/^matrix\(([^,]+), ([^,]+),/);
  if (!match) throw new Error(`not a 2D matrix: ${transform}`);
  return { a: Number(match[1]), b: Number(match[2]) };
}

function expectWithin(inner: Rect, outer: Rect, what: string): void {
  expect(inner.left, `${what} left`).toBeGreaterThanOrEqual(outer.left - 0.5);
  expect(inner.right, `${what} right`).toBeLessThanOrEqual(outer.right + 0.5);
  expect(inner.top, `${what} top`).toBeGreaterThanOrEqual(outer.top - 0.5);
  expect(inner.bottom, `${what} bottom`).toBeLessThanOrEqual(outer.bottom + 0.5);
}

// Every value above its bar, regular weight, tilted in the model and phase
// charts and upright and centred in the class chart, inside its card and
// below its caption; model and phase bars gray.
async function checkPlacement(card: Locator): Promise<void> {
  const measure = await measureCard(card);
  for (const figure of measure.figures) {
    const tilted = figure.title !== CLASS_TITLE;
    expect(figure.inside, `${figure.title} inside values`).toBe(0);
    for (const column of figure.columns) {
      const what = `${figure.title} ${column.name}`;
      expect(column.above, `${what} values above`).toBe(1);
      const { value, bar } = column;
      if (!value || !bar) throw new Error(`${what} has no value or no bar`);
      if (tilted) expect(isGray(bar.color), `${what} bar ${bar.color}`).toBe(true);
      expect(value.fontWeight, `${what} weight`).toBe("400");
      if (tilted) {
        const { a, b } = matrixOf(value.transform);
        expect(Math.abs(a - COS_45), `${what} matrix a`).toBeLessThanOrEqual(0.01);
        expect(Math.abs(b + COS_45), `${what} matrix b`).toBeLessThanOrEqual(0.01);
      } else {
        expect(value.transform, `${what} transform`).toBe("none");
        const centre = value.left + value.width / 2;
        expect(
          Math.abs(centre - (bar.left + bar.width / 2)),
          `${what} centred`,
        ).toBeLessThanOrEqual(1);
      }
      expect(value.inBar, `${what} inside its bar`).toBe(false);
      expectWithin(value, figure.content, `${what} value`);
      expect(value.top, `${what} below the caption`).toBeGreaterThanOrEqual(figure.caption.bottom);
    }
  }
}

// Equal bar widths and equally spaced centres in every chart with two or more
// columns, bars at most 28px, and the Docs name on one line like Plan's.
async function checkBars(card: Locator): Promise<void> {
  const measure = await measureCard(card);
  for (const figure of measure.figures) {
    const bars = figure.columns.map((column) => {
      if (!column.bar) throw new Error(`${figure.title} ${column.name} has no bar`);
      return column.bar;
    });
    for (const bar of bars) expect(bar.width, `${figure.title} bar cap`).toBeLessThanOrEqual(28.5);
    if (bars.length < 2) continue;
    const [first] = bars;
    if (!first) continue;
    const centres = bars.map((bar) => bar.left + bar.width / 2);
    const spacing = (centres[1] ?? 0) - (centres[0] ?? 0);
    bars.forEach((bar, i) => {
      expect(
        Math.abs(bar.width - first.width),
        `${figure.title} bar ${i} width`,
      ).toBeLessThanOrEqual(1);
      if (i > 0) {
        const step = (centres[i] ?? 0) - (centres[i - 1] ?? 0);
        expect(Math.abs(step - spacing), `${figure.title} bar ${i} spacing`).toBeLessThanOrEqual(1);
      }
    });
  }
  const phases = figureOf(measure, PHASE_TITLE).columns;
  const docs = phases.find((column) => column.name === "Docs");
  const plan = phases.find((column) => column.name === "Plan");
  if (docs && plan) {
    expect(Math.abs(docs.nameRow.height - plan.nameRow.height)).toBeLessThanOrEqual(0.5);
  }
}

// The phase chart's list, columns and names inside its content box, the
// names not overlapping.
async function checkPhaseContainment(card: Locator): Promise<void> {
  const figure = figureOf(await measureCard(card), PHASE_TITLE);
  const { content } = figure;
  const boxes: [string, Rect][] = [
    ...(figure.list ? [["list", figure.list] as [string, Rect]] : []),
    ...figure.columns.map(({ name, box }) => [`${name} column`, box] as [string, Rect]),
    ...figure.columns.map(({ name, nameRow }) => [`${name} name row`, nameRow] as [string, Rect]),
  ];
  for (const [what, box] of boxes) {
    expect(box.left, `${what} left`).toBeGreaterThanOrEqual(content.left - 0.5);
    expect(box.right, `${what} right`).toBeLessThanOrEqual(content.right + 0.5);
  }
  figure.columns.forEach((column, i) => {
    const next = figure.columns[i + 1];
    if (next) {
      expect(column.nameRow.right, `${column.name} overlaps ${next.name}`).toBeLessThanOrEqual(
        next.nameRow.left,
      );
    }
  });
}

async function checkCardsAt(page: Page): Promise<void> {
  for (const card of await placementCards(page)) {
    await checkBars(card);
    await checkPlacement(card);
    await checkPhaseContainment(card);
  }
}

test.describe("day card charts", () => {
  test("three captioned chart cards in one row under the header", async ({ page, request }) => {
    const card = await openLog(page);
    const measure = await measureCard(card);
    expect(measure.chartsFollowHeader).toBe(true);
    expect(measure.figures.map(({ title, subtitle }) => ({ title, subtitle }))).toEqual(
      CAPTIONS.map(({ title, subtitle }) => ({ title, subtitle })),
    );
    const [first] = measure.figures;
    if (!first) throw new Error("no figure");
    for (const figure of measure.figures) {
      expect(figure.box.top).toBeGreaterThanOrEqual(measure.header.bottom);
      expect(Math.abs(figure.box.top - first.box.top)).toBeLessThanOrEqual(0.5);
      expect(figure.captionMarkers).toBe(0);
      expect(figure.titleLeft).toBe(figure.subtitleLeft);
    }

    const html = await servedHtml(request, "/projects/log");
    for (const { title } of CAPTIONS) expect(html).toContain(title);
  });

  test("classes come as feature, chore, bug, then patch and other", async ({ page }) => {
    const card = await openLog(page);
    const measure = await measureCard(card);
    const labels = figureOf(measure, CLASS_TITLE).columns.map(({ label }) => {
      const match = label.match(CLASS_LABEL);
      if (!match?.[1] || !match[2]) throw new Error(`unexpected class label: ${label}`);
      return { name: match[1], count: Number(match[2]) };
    });
    expect(labels.slice(0, 3).map(({ name }) => name)).toEqual(["feature", "chore", "bug"]);
    const rest = labels.slice(3).map(({ name }) => name);
    expect(["patch", "other"].filter((name) => rest.includes(name))).toEqual(rest);

    const runs = await card
      .locator("header")
      .getByText(/^\d+ runs?$/)
      .innerText();
    expect(labels.reduce((sum, { count }) => sum + count, 0)).toBe(Number.parseInt(runs, 10));
  });

  test("a chore-only day keeps feature and bug at 0 above the baseline", async ({ page }) => {
    await openLog(page);
    let choreOnly: CardMeasure | null = null;
    for (const card of await chartCards(page).all()) {
      const measure = await measureCard(card);
      const labels = figureOf(measure, CLASS_TITLE).columns.map(({ label }) => label);
      if (labels.includes("feature: 0 runs") && labels.includes("bug: 0 runs")) {
        choreOnly = measure;
        break;
      }
    }
    test.skip(choreOnly === null, "no chore-only day in the 30-day window");
    if (!choreOnly) return;
    const columns = figureOf(choreOnly, CLASS_TITLE).columns;
    expect(columns.map(({ name }) => name)).toEqual(["feature", "chore", "bug"]);
    for (const column of columns.filter(({ label }) => label.endsWith(": 0 runs"))) {
      expect(column.above).toBe(1);
      expect(column.value?.text).toBe("0");
    }
  });

  test("models and phases come in their fixed order", async ({ page }) => {
    const card = await openLog(page);
    const measure = await measureCard(card);

    const models = figureOf(measure, MODEL_TITLE);
    if (models.columns.length === 0) {
      expect(models.text).toContain("No per-model usage published.");
    } else {
      const ranks = models.columns.map(({ name }) => {
        const rank = MODEL_ORDER.indexOf(name);
        return rank === -1 ? MODEL_ORDER.length : rank;
      });
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    }

    const phases = figureOf(measure, PHASE_TITLE);
    if (phases.columns.length === 0) {
      expect(phases.text).toContain("No per-phase usage published.");
    } else {
      const names = phases.columns.map(({ name }) => name);
      expect(names).not.toContain("CI");
      expect(names).not.toContain("Document");
      expect(PHASE_ORDER.filter((name) => names.includes(name))).toEqual(names);
      for (const column of phases.columns) expect(column.value?.text).toMatch(PHASE_VALUE);
    }
  });

  test("values sit above their bars at 1920x1080, light and dark", async ({ page }) => {
    await openLog(page);
    await page.emulateMedia({ colorScheme: "light" });
    for (const card of await placementCards(page)) {
      await checkPlacement(card);
      await checkBars(card);
    }
    await page.emulateMedia({ colorScheme: "dark" });
    for (const card of await placementCards(page)) await checkPlacement(card);
  });

  test("tooltips show the split, the time and runs, and the share", async ({ page }) => {
    const card = await openLog(page);
    const figure = (title: string) => card.getByRole("figure", { name: title });
    const tooltipOf = (column: Locator) => column.getByRole("tooltip");

    const models = figure(MODEL_TITLE).getByRole("listitem");
    if ((await models.count()) > 0) {
      await models.first().hover();
      const tip = tooltipOf(models.first());
      await expect(tip).toBeVisible();
      for (const label of ["Model", "Input", "Cache read", "Cache write", "Output"]) {
        await expect(tip).toContainText(label);
      }
      await expect(tip).toContainText(/Cost<?\$\d/);
    }

    const phases = figure(PHASE_TITLE).getByRole("listitem");
    if ((await phases.count()) > 0) {
      const tip = tooltipOf(phases.first());
      await phases.first().hover();
      await expect(tip).toBeVisible();
      for (const label of ["Input", "Cache read", "Cache write", "Output", "Time", "Runs"]) {
        await expect(tip).toContainText(label);
      }
      await page.mouse.move(0, 0);
      await expect(tip).toBeHidden();
      await phases.first().focus();
      await expect(tip).toBeVisible();
      for (const label of ["Input", "Cache read", "Cache write", "Output", "Time", "Runs"]) {
        await expect(tip).toContainText(label);
      }
      await phases.first().blur();
    }

    const classes = figure(CLASS_TITLE).getByRole("listitem");
    await classes.first().hover();
    const tip = tooltipOf(classes.first());
    await expect(tip).toBeVisible();
    await expect(tip).toContainText("Runs");
    await expect(tip).toContainText(/Share<?\d+%/);
  });

  test("labels: dots on classes only, shown in full, never tilted", async ({ page }) => {
    const card = await openLog(page);
    const measure = await measureCard(card);
    for (const figure of measure.figures) {
      for (const { name, nameRow } of figure.columns) {
        const what = `${figure.title} ${name}`;
        expect(nameRow.media, `${what} img or svg`).toBe(0);
        expect(nameRow.scrollWidth, `${what} in full`).toBeLessThanOrEqual(nameRow.clientWidth);
        expect(nameRow.transform, `${what} transform`).toBe("none");
        if (figure.title === CLASS_TITLE) {
          expect(nameRow.dots, `${what} dot`).toBe(1);
          if (name === "feature" || name === "bug") {
            expect(isGray(nameRow.dotColor ?? ""), `${what} dot colour`).toBe(false);
          }
        } else {
          expect(nameRow.dots, `${what} dot`).toBe(0);
        }
      }
    }
  });

  test("status counts, Work with me and the class bars keep their colours", async ({ page }) => {
    await openLog(page);
    // A day's runs count every run whose finished_at falls on it, whatever its
    // status: a failed run that is resumed is running again but keeps the
    // finished_at of its failure, so while it runs its day shows "1 run, 0
    // completed, 0 failed" next to all three charts. Take the first chart card
    // that has a non-zero count instead of the first chart card.
    const nonZero = page.locator("header").getByText(/^[1-9]\d* (completed|failed)$/);
    const withCounts = chartCards(page).filter({ has: nonZero });
    test.skip((await withCounts.count()) === 0, "no day with a completed or failed run");
    const card = withCounts.first();
    const counts = card.locator("header").getByText(/^[1-9]\d* (completed|failed)$/);
    await expect(counts.first()).toBeVisible();
    const color = await counts.first().evaluate((el) => getComputedStyle(el).color);
    expect(isGray(color), `status count ${color}`).toBe(false);

    const hire = page.getByRole("banner").getByRole("link", { name: "Work with me" });
    const background = await hire.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(isGray(background), `Work with me ${background}`).toBe(false);

    await expect(
      card
        .getByRole("table")
        .getByRole("img", { name: /^Issue classes:/ })
        .first(),
    ).toBeVisible();
  });

  test("at 1024x768 the three cards share a row and stay inside", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    const card = await openLog(page);
    const measure = await measureCard(card);
    const [first] = measure.figures;
    if (!first) throw new Error("no figure");
    for (const figure of measure.figures) {
      expect(Math.abs(figure.box.top - first.box.top)).toBeLessThanOrEqual(0.5);
    }
    await expectNoHorizontalScroll(page);
    await checkCardsAt(page);
  });

  test("at 375x812 the three cards stack and stay inside", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const card = await openLog(page);
    const measure = await measureCard(card);
    measure.figures.forEach((figure, i) => {
      const previous = measure.figures[i - 1];
      if (previous) expect(figure.box.top).toBeGreaterThanOrEqual(previous.box.bottom);
    });
    await expectNoHorizontalScroll(page);
    await checkCardsAt(page);
  });
});
