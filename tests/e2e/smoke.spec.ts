import { expect, test, type Page } from "@playwright/test";

/** Switches demo persona from the "Viewing as" menu in the header. */
async function viewAs(page: Page, role: string) {
  // While a page refreshes, its loading state can briefly show a second header; use the visible one.
  const menu = page.locator("header details:visible").last();
  await menu.locator("summary").click();
  await menu.getByRole("button", { name: role, exact: true }).click();
  await expect(page.locator("header details summary:visible").last()).toContainText(role);
}

test("visitor: landing, try the demo, hospital case with rules and a cited explanation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("experienced corridor-wise");
  await page.getByRole("button", { name: "Try the demo" }).click();

  await expect(page).toHaveURL(/\/cases\/CC-\d{4}-\d{3}/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Water and Jio works");
  await expect(page.getByText("Coordination required").first()).toBeVisible();

  const rules = page.locator("#rules");
  await expect(rules.getByText("XPMS_REPEAT_OTHER_3M")).toBeVisible();
  await expect(rules.getByText("CORRIDOR_SAME_SEGMENT_MULTIWORK")).toBeVisible();
  await expect(rules).toContainText("Karva Hospital");

  const why = page.locator("section", { has: page.getByRole("heading", { name: "Why this matters" }) });
  await expect(why.locator("a.cite").first()).toBeVisible();
  await expect(why).toContainText(/AI explanation · citations checked|Template explanation/);
  await expect(page.locator("#strategies")).toContainText("RECOMMENDED");
  await expect(page.getByRole("button", { name: "Approve joint execution" })).toBeVisible();
});

test("engineer: example permit shows the conflict in the pre-check, then submitting opens a case", async ({ page }) => {
  await page.goto("/permits/new?example=hospital");
  await viewAs(page, "Airtel Fiber engineer");
  await page.goto("/permits/new?example=hospital");

  const precheck = page.locator("section", { has: page.getByRole("heading", { name: "Pre-check" }) });
  await expect(precheck).toContainText("Planned work on this stretch.");
  await expect(precheck).toContainText("PMC/RC/2026/0023");
  await expect(precheck).toContainText("Within 200 m of Karva Hospital.");
  await expect(precheck).toContainText("a coordination case opens");

  await precheck.getByRole("button", { name: "Submit permit" }).click();
  await expect(page).toHaveURL(/\/cases\/CC-\d{4}-\d{3}\?filed=/);
  await expect(page.getByRole("status")).toContainText("was filed");
  await expect(page.locator("#permits")).toContainText("Airtel Fiber");
  await expect(page.locator("#permits")).toContainText("PMC/RC/2026/0026");
});

test("planner override, supervisor sign-off, then the notice is public in three languages", async ({ page }) => {
  await page.goto("/cases");
  await viewAs(page, "Corridor planner");
  await page.getByRole("link", { name: /Water and MNGL works/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Water and MNGL works");
  const caseUrl = page.url();

  // Override needs a reason: the button stays disabled until one is long enough.
  await page.getByRole("button", { name: "Choose another strategy" }).click();
  await page.getByLabel("Strategy", { exact: true }).selectOption("SEPARATE_EXECUTION");
  const record = page.getByRole("button", { name: "Record override" });
  await page.getByLabel(/Override reason/).fill("too short");
  await expect(record).toBeDisabled();
  await page.getByLabel(/Override reason/).fill("Gas connection has a fixed commissioning date; separate execution with a restoration bond.");
  await record.click();
  await expect(page.getByText("Waiting for sign-off").first()).toBeVisible();

  await viewAs(page, "Supervisor");
  await page.goto(caseUrl);
  await page.getByLabel(/Checker note/).fill("Agreed. Restoration bond to be lodged before work starts.");
  await page.getByRole("button", { name: "Sign off and release permits" }).click();
  await expect(page.getByText("Decided").first()).toBeVisible();
  await expect(page.getByText("planner override")).toBeVisible();

  // The audit trail carries the override reason and both people.
  await page.goto(`${caseUrl}?tab=audit`);
  const audit = page.locator("section", { has: page.getByRole("heading", { name: "Audit trail" }) });
  await expect(audit).toContainText("Planner overrode recommendation");
  await expect(audit).toContainText("fixed commissioning date");
  await expect(audit).toContainText("Supervisor signed off");

  // One notice for both works, readable without signing in.
  await page.goto(caseUrl);
  await page.getByRole("link", { name: "Open the public notice" }).click();
  await expect(page).toHaveURL(/\/public\/notice\//);
  // The previous page can stay mounted for a moment during navigation, so pick the notice by its language switcher.
  const notice = page.locator("main").filter({ has: page.getByRole("navigation", { name: "Language" }) });
  await expect(notice.getByRole("heading", { level: 1 })).toContainText("Sinhagad Road");
  await expect(notice).toContainText("PMC Water Supply with Maharashtra Natural Gas Ltd");
  await expect(notice).not.toContainText("One dig for"); // separate execution, so no shared dig is claimed
  await notice.getByRole("link", { name: "मराठी" }).click();
  await expect(notice).toContainText("जबाबदार विभाग");
  await notice.getByRole("link", { name: "हिंदी" }).click();
  await expect(notice).toContainText("ज़िम्मेदार विभाग");

  await page.goto("/public/works");
  await expect(page.locator("main").filter({ hasText: "Upcoming road works" })).toContainText(/CC-\d{4}-\d{3}/);
});
