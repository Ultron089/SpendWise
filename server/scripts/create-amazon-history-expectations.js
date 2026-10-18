const fs = require("node:fs");
const path = require("node:path");

const fail = (message) => {
  console.error(message);
  process.exitCode = 1;
};

const orderExpense = (order) => {
  const products = order.products;
  const orderLevelExpense =
    order.store === "amazon-now" ||
    order.individualPricesAvailable !== true ||
    products.length === 0;

  if (orderLevelExpense) {
    let productName = "Amazon order";
    let category = "Uncategorized";

    if (order.store === "amazon-now") {
      productName = "Amazon Now";
      category = "quick commerce";
    } else if (order.store === "amazon-fresh") {
      productName = "Amazon Fresh";
      category = "Groceries";
    } else if (products.length === 1 && products[0].productName) {
      productName = products[0].productName;
      category = null;
    }

    return [{ productName, amount: order.amount, category }];
  }

  return products.map((product) => ({
    productName: product.productName,
    amount: product.unitPrice,
    category: null,
  }));
};

const main = () => {
  const [, , inputArgument, outputArgument] = process.argv;
  if (!inputArgument || !outputArgument) {
    fail(
      "Usage: node server/scripts/create-amazon-history-expectations.js <saved-extractor-output.json> <new-expectations.json>",
    );
    return;
  }

  const inputPath = path.resolve(inputArgument);
  const outputPath = path.resolve(outputArgument);
  if (inputPath === outputPath || fs.existsSync(outputPath)) {
    fail("Choose a new output path; the command will not overwrite a file.");
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  } catch {
    fail("Could not read valid JSON from the explicitly supplied fixture.");
    return;
  }

  const sourceOrders = Array.isArray(parsed) ? parsed : parsed?.orders;
  if (!Array.isArray(sourceOrders) || sourceOrders.length !== 10) {
    fail("The supplied fixture must contain the ten extracted orders.");
    return;
  }

  const seenOrderIds = new Set();
  const orders = [];
  for (const sourceOrder of sourceOrders) {
    if (
      !sourceOrder ||
      sourceOrder.platform !== "amazon" ||
      typeof sourceOrder.orderId !== "string" ||
      !sourceOrder.orderId.trim() ||
      seenOrderIds.has(sourceOrder.orderId) ||
      !Number.isFinite(sourceOrder.amount) ||
      sourceOrder.amount <= 0 ||
      typeof sourceOrder.currency !== "string" ||
      !Array.isArray(sourceOrder.products)
    ) {
      fail(
        "The supplied fixture contains an invalid or repeated Amazon order.",
      );
      return;
    }
    seenOrderIds.add(sourceOrder.orderId);

    const excluded = sourceOrder.excludedFromExpenditure === true;
    orders.push({
      orderId: sourceOrder.orderId,
      store: sourceOrder.store,
      excludedFromExpenditure: excluded,
      expectedExpenses: excluded ? [] : orderExpense(sourceOrder),
    });
  }

  const excludedCount = orders.filter(
    (order) => order.excludedFromExpenditure,
  ).length;
  const expenses = orders.flatMap((order) => order.expectedExpenses);
  const amazonNow = orders.filter((order) => order.store === "amazon-now");
  if (
    excludedCount !== 4 ||
    expenses.length !== 6 ||
    amazonNow.length !== 1 ||
    amazonNow[0].expectedExpenses.length !== 1 ||
    amazonNow[0].expectedExpenses[0].productName !== "Amazon Now" ||
    amazonNow[0].expectedExpenses[0].amount !== 918 ||
    amazonNow[0].expectedExpenses[0].category !== "quick commerce"
  ) {
    fail(
      "Fixture does not match the reported batch: expected four excluded orders, six expenses, and one ₹918 Amazon Now order.",
    );
    return;
  }

  for (const order of orders.filter((item) => item.store === "amazon-fresh")) {
    if (
      order.expectedExpenses.length !== 1 ||
      order.expectedExpenses[0].productName !== "Amazon Fresh" ||
      order.expectedExpenses[0].category !== "Groceries"
    ) {
      fail("Amazon Fresh did not resolve to one Groceries expense.");
      return;
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify({ orders }, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  console.log(
    `Created expectations for ${orders.length} orders (${excludedCount} excluded, ${expenses.length} expected expenses). ${expenses.filter((expense) => expense.category === null).length} AI categories remain unknown and will be reported as unverified.`,
  );
};

main();
