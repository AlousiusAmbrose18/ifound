import { test, expect, type Page } from "@playwright/test";
async function addCustomer(page: Page) {
  await page
    .getByRole("button", { name: "Customer screening", exact: true })
    .click();
  await page.getByLabel("First name").fill("Workflow");
  await page.getByLabel("Last name").fill("Customer");
  await page.getByLabel("Country", { exact: true }).fill("India");
  await page.getByLabel("Location", { exact: true }).fill("Mumbai");
  await page.getByRole("button", { name: "Save & screen customer" }).click();
}
async function transactionDraft(
  page: Page,
  reference: string,
  amount = "10",
  id?: string,
) {
  await page
    .getByRole("button", { name: "New transaction", exact: true })
    .click();
  if (id) await page.getByLabel("Customer", { exact: true }).selectOption(id);
  else
    await page
      .getByLabel("Customer", { exact: true })
      .selectOption({ index: 1 });
  await page.getByLabel("Beneficiary name").fill("Unlisted Recipient");
  await page.getByLabel("Beneficiary account / reference").fill("ACCT-001");
  await page.getByLabel("Destination country").fill("India");
  await page
    .getByLabel("Transaction reference", { exact: true })
    .fill(reference);
  await page.getByLabel("Amount (INR)").fill(amount);
  await page.getByLabel("Purpose", { exact: true }).fill("Invoice payment");
}
async function screenTransaction(page: Page) {
  await page
    .getByRole("button", { name: "Review transaction", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Screen transaction", exact: true })
    .click();
}

test("screening, review evidence, automatic velocity and persistence", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page).toHaveTitle(/ifound/);
  await page
    .getByRole("button", { name: "Customer screening", exact: true })
    .click();
  await page.getByLabel("First name").fill("Alexandr");
  await page.getByLabel("Last name").fill("Petrov");
  await page.getByLabel("Country", { exact: true }).fill("Russia");
  await page.getByLabel("Location", { exact: true }).fill("Moscow");
  await page.getByLabel("Profession", { exact: true }).fill("Engineer");
  await page.getByRole("button", { name: "Save & screen customer" }).click();
  await expect(page.getByRole("status")).toContainText("alert created");
  await expect(
    page.getByRole("region", { name: "Screening result" }),
  ).toContainText("Alert generated");
  await page.getByRole("button", { name: /^Alerts/ }).click();
  await page
    .getByRole("row")
    .filter({ hasText: "Alexandr Petrov" })
    .first()
    .click();
  await page.getByLabel("Review status").selectOption("Closed");
  await expect(page.getByRole("status")).toContainText("Add review notes");
  await page.getByLabel("Review notes").fill("DOB differs; evidence reviewed.");
  await page.getByLabel("Review status").selectOption("Closed");
  await expect(page.getByRole("dialog")).toContainText("DOB differs");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Transaction monitoring", exact: true })
    .click();
  for (let i = 0; i < 5; i++) {
    await transactionDraft(page, `TX-${i}`);
    await screenTransaction(page);
    if (i < 4)
      await page.getByRole("button", { name: "Back to transactions" }).click();
  }
  await expect(
    page.getByRole("region", { name: "Transaction result" }),
  ).toContainText("Alert generated");
  await expect(
    page.getByText("Transaction velocity", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Transaction monitoring", exact: true })
    .click();
  await page
    .getByRole("button", { name: "View transaction TX-4", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Transaction result" }),
  ).toContainText("Alert generated");
  await expect(
    page.getByRole("button", { name: "Export workspace" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Connected to MySQL", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Demo workspace", { exact: true })).toHaveCount(
    0,
  );
  expect(errors).toEqual([]);
});
test("corrupted saved records produce recovery UI", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("ifound-v1", '{"alerts":null}'),
  );
  await page.goto("/");
  await expect(
    page.getByRole("alert").filter({ hasText: "Saved data" }),
  ).toContainText("could not be loaded");
  expect(await page.evaluate(() => localStorage.getItem("ifound-v1"))).toBe(
    '{"alerts":null}',
  );
});
test("watchlist import rejects invalid records and deduplicates", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Watchlists", exact: true }).click();
  const file = page.locator("input[type=file]").last();
  await file.setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      '[{"name":"Bad","country":"India","dob":"2024-02-30"}]',
    ),
  });
  await expect(page.getByRole("status")).toContainText("valid past DOB");
  await file.setInputFiles({
    name: "list.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify([
        {
          name: "Alexander Petrov",
          country: "Russia",
          dob: "1982-04-16",
          source: "Demo sanctions",
        },
      ]),
    ),
  });
  await expect(page.getByRole("status")).toContainText("0 records imported");
});

test("legacy data migrates into the plain app", async ({ page }) => {
  const workspace = {
    alerts: [],
    watch: [],
    customers: [
      { name: "Legacy Customer", country: "India", dob: "", risk: 20 },
    ],
    transactions: [],
    rules: {
      threshold: 80,
      amount: 1000000,
      velocity: 5,
      countryWeight: 40,
      locationWeight: 25,
      professionWeight: 35,
      screen: true,
      transaction: true,
    },
  };
  await page.addInitScript(
    (v) => localStorage.setItem("sentinel-v1", JSON.stringify(v)),
    workspace,
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Customers", exact: true }).click();
  await expect(page.getByText("Legacy Customer")).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("ifound-v1")!).customers.length,
    ),
  ).toBe(1);
  await expect(page.getByText("Restore backup", { exact: true })).toHaveCount(
    0,
  );
});
test("rule changes persist and disabled monitoring suppresses alerts", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Rule engine", exact: true }).click();
  await page.locator("input[name=amount]").fill("100");
  await page.locator("input[name=transaction]").uncheck();
  await page.getByRole("button", { name: "Save rules" }).click();
  await expect(page.getByRole("status")).toContainText("Rules saved");
  await page.reload();
  await page.getByRole("button", { name: "Rule engine", exact: true }).click();
  await expect(page.locator("input[name=amount]")).toHaveValue("100");
  await expect(page.locator("input[name=transaction]")).not.toBeChecked();
  await page
    .getByRole("button", { name: "Transaction monitoring", exact: true })
    .click();
  await addCustomer(page);
  await page
    .getByRole("button", { name: "Transaction monitoring", exact: true })
    .click();
  await transactionDraft(page, "DISABLED-1", "200");
  await screenTransaction(page);
  await expect(
    page.getByRole("region", { name: "Transaction result" }),
  ).toContainText("No alert generated");
});
test("security headers and mobile navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto("/");
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response?.headers()["x-frame-options"]).toBe("DENY");
  expect(response?.headers()["x-powered-by"]).toBeUndefined();
  await page.getByRole("button", { name: /^Alerts/ }).click();
  await expect(
    page.getByRole("heading", { name: /Alert queue/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open", exact: true }),
  ).toHaveClass("selected");
  await page.getByLabel("Risk filter").selectOption("High");
  await expect(
    page.getByRole("button", { name: "Open", exact: true }),
  ).toHaveClass("selected");
  await expect(
    page.getByRole("row").filter({ hasText: "In review" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/ifound-mobile.png",
    fullPage: true,
  });
});

test("inline mandatory, name, amount and rule validation blocks invalid saves", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Customer screening", exact: true })
    .click();
  await page.getByRole("button", { name: "Save & screen customer" }).click();
  await expect(
    page.getByText("This field is required.", { exact: true }),
  ).toHaveCount(3);
  await expect(page.getByLabel("First name")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.getByLabel("First name").fill("123");
  await page.getByLabel("Last name").fill("   ");
  await page.getByRole("button", { name: "Save & screen customer" }).click();
  await expect(
    page.getByText("Enter a name containing letters."),
  ).toBeVisible();
  await expect(page.getByLabel("Last name")).toHaveAttribute(
    "aria-invalid",
    "false",
  );
  await page
    .getByRole("button", { name: "Transaction monitoring", exact: true })
    .click();
  await addCustomer(page);
  await page
    .getByRole("button", { name: "Transaction monitoring", exact: true })
    .click();
  await page
    .getByRole("button", { name: "New transaction", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review transaction", exact: true })
    .click();
  await expect(
    page.getByText("This field is required.", { exact: true }),
  ).toHaveCount(7);
  await page.getByLabel("Amount (INR)").fill("-1");
  await page
    .getByRole("button", { name: "Review transaction", exact: true })
    .click();
  await expect(page.getByText("Enter a value of at least 0.01.")).toBeVisible();
  await page.getByRole("button", { name: "Rule engine", exact: true }).click();
  await page.locator("input[name=threshold]").fill("101");
  await page.locator("input[name=velocity]").fill("1.5");
  await page.getByRole("button", { name: "Save rules" }).click();
  await expect(
    page.getByText("Enter a value no greater than 100."),
  ).toBeVisible();
  await expect(page.getByText("Enter a whole number.")).toBeVisible();
});
test("DOB rejects future dates and branding uses navy", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/^ifound/);
  await expect(page.locator(".brand")).toContainText("ifound");
  expect(
    await page
      .locator(".brand-icon")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(23, 46, 89)");
  await page
    .getByRole("button", { name: "Customer screening", exact: true })
    .click();
  await page.getByLabel("Date of birth").fill("2099-01-01");
  await page.getByRole("button", { name: "Save & screen customer" }).click();
  await expect(
    page.getByText("Enter a valid date of birth that is not in the future."),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/ifound-validation.png",
    fullPage: true,
  });
});

test("server mode uses transaction API and shows conflicts", async ({
  page,
}) => {
  const workspace = {
    alerts: [],
    watch: [],
    customers: [
      {
        id: "test-customer",
        name: "Conflict Test",
        country: "India",
        dob: "",
        risk: 20,
      },
    ],
    transactions: [],
    rules: {
      threshold: 80,
      amount: 1000000,
      velocity: 5,
      countryWeight: 40,
      locationWeight: 25,
      professionWeight: 35,
      screen: true,
      transaction: true,
    },
  };
  let writes = 0;
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: { user: { id: "admin", username: "admin", role: "Admin" } },
    }),
  );
  await page.route("**/api/workspace", (route) =>
    route.fulfill({ json: { mode: "server", revision: 7, workspace } }),
  );
  await page.route("**/api/transactions", async (route) => {
    writes++;
    expect(route.request().postDataJSON().revision).toBe(7);
    expect(route.request().postDataJSON().customerId).toBe("test-customer");
    await route.fulfill({
      status: 409,
      json: { error: "Workspace changed in another session." },
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Transaction monitoring", exact: true })
    .click();
  await transactionDraft(page, "CONFLICT-1", "10", "test-customer");
  expect(writes).toBe(0);
  await screenTransaction(page);
  await expect(
    page.getByRole("alert").filter({ hasText: "Workspace changed" }),
  ).toContainText("Refresh workspace");
  expect(writes).toBe(1);
});

test("optional profession, customer watchlist and responsive navigation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  await expect(page.locator("aside nav button").nth(1)).toContainText("Alerts");
  await page
    .getByRole("button", { name: "Customer screening", exact: true })
    .click();
  await page.getByLabel("First name").fill("Optional");
  await page.getByLabel("Last name").fill("Profession");
  await page.getByLabel("Country", { exact: true }).fill("India");
  await page.getByLabel("Location", { exact: true }).fill("Mumbai");
  await expect(
    page.getByLabel("Profession", { exact: true }),
  ).not.toHaveAttribute("required", "");
  await page.getByRole("button", { name: "Save & screen customer" }).click();
  await expect(page.getByRole("status")).toContainText("Customer saved");
  await expect(
    page.getByRole("region", { name: "Screening result" }),
  ).toContainText("No alert generated");
  await page.getByRole("button", { name: "Watchlists", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "Optional Profession" }),
  ).toContainText("Customer screening");
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Customer screening", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Transaction monitoring", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("notifications are separate and transaction tab uses the same active style", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Notifications", exact: true }),
  ).toContainText("No notifications");
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close notifications" }).click();
  const colors: string[] = [];
  for (const name of [
    "Customer screening",
    "Transaction monitoring",
    "Alerts",
  ]) {
    await page
      .getByRole("button", {
        name: name === "Alerts" ? /^Alerts/ : name,
        exact: name !== "Alerts",
      })
      .click();
    const current = page.locator('aside nav button[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toContainText(name);
    colors.push(
      await current.evaluate((el) => getComputedStyle(el).backgroundColor),
    );
  }
  expect(new Set(colors).size).toBe(1);
});

test("a single phonetic name creates an alert with matching evidence", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "ifound-v1",
      JSON.stringify({
        alerts: [],
        customers: [],
        transactions: [],
        watch: [
          {
            name: "messi leonel",
            country: "Argentina",
            dob: "",
            source: "Test",
          },
        ],
        rules: {
          threshold: 80,
          amount: 1000000,
          velocity: 5,
          countryWeight: 40,
          locationWeight: 25,
          professionWeight: 35,
          screen: true,
          transaction: true,
        },
      }),
    ),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Customer screening", exact: true })
    .click();
  await page.getByLabel("First name").fill("mesi");
  await page.getByLabel("Country", { exact: true }).fill("Argentina");
  await page.getByLabel("Location", { exact: true }).fill("Rosario");
  await page.getByRole("button", { name: "Save & screen customer" }).click();
  await expect(
    page.getByRole("region", { name: "Screening result" }),
  ).toContainText("Alert generated");
  await page.getByRole("button", { name: /^Alerts/ }).click();
  await page.getByRole("row").filter({ hasText: "mesi" }).click();
  await expect(page.getByRole("dialog")).toContainText("Phonetic token match");
});
