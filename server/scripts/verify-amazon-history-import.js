const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const Purchase = require("../models/Purchase");
const { buildDeduplicationKey } = require("../services/deduplicationService");

const projectRoot = path.resolve(__dirname, "../..");
require("dotenv").config({
  path: path.join(projectRoot, ".env"),
  quiet: true,
});

const safePurchase = (purchase) => ({
  platform: purchase.platform,
  orderId: purchase.orderId,
  productName: purchase.productName,
  amount: purchase.amount,
  category: purchase.category,
});

const loadInputs = () => {
  const userId = process.env.SPENDWISE_VERIFY_USER_ID;
  const expectationsPath = process.env.SPENDWISE_VERIFY_EXPECTATIONS_FILE;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error(
      "Set SPENDWISE_VERIFY_USER_ID to the signed-in user's MongoDB ID.",
    );
  }
  if (!expectationsPath) {
    throw new Error(
      "Set SPENDWISE_VERIFY_EXPECTATIONS_FILE to the local batch expectations JSON.",
    );
  }

  const resolvedPath = path.resolve(expectationsPath);
  const expectations = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  const orders = expectations.orders;

  if (!Array.isArray(orders) || orders.length !== 10) {
    throw new Error(
      "The expectations file must contain the ten imported orders.",
    );
  }

  const orderIds = new Set();
  for (const order of orders) {
    if (
      !order ||
      typeof order.orderId !== "string" ||
      !order.orderId.trim() ||
      orderIds.has(order.orderId)
    ) {
      throw new Error(
        "Each expected order must have a unique, non-empty orderId.",
      );
    }
    orderIds.add(order.orderId);

    if (!Array.isArray(order.expectedExpenses)) {
      throw new Error("Each order must include an expectedExpenses array.");
    }

    if (order.excludedFromExpenditure === true) {
      if (order.expectedExpenses.length !== 0) {
        throw new Error(
          "Excluded wallet orders must not list expected expenses.",
        );
      }
      continue;
    }

    for (const expense of order.expectedExpenses) {
      if (
        !expense ||
        typeof expense.productName !== "string" ||
        !expense.productName.trim() ||
        !Number.isFinite(expense.amount) ||
        (expense.category !== null &&
          (typeof expense.category !== "string" || !expense.category))
      ) {
        throw new Error(
          "Each expected expense needs a name, finite amount, and a category string or null.",
        );
      }
    }
  }

  const excludedOrders = orders.filter(
    (order) => order.excludedFromExpenditure === true,
  );
  const expenses = orders.flatMap((order) =>
    order.expectedExpenses.map((expense) => ({
      ...expense,
      orderId: order.orderId,
    })),
  );
  const amazonNowOrders = orders.filter(
    (order) => order.store === "amazon-now",
  );

  if (
    excludedOrders.length !== 4 ||
    expenses.length !== 6 ||
    amazonNowOrders.length !== 1 ||
    amazonNowOrders[0].expectedExpenses.length !== 1 ||
    amazonNowOrders[0].expectedExpenses[0].productName !== "Amazon Now" ||
    amazonNowOrders[0].expectedExpenses[0].amount !== 918 ||
    amazonNowOrders[0].expectedExpenses[0].category !== "quick commerce"
  ) {
    throw new Error(
      "Expectations must describe four excluded orders, six expenses, and one ₹918 Amazon Now expense.",
    );
  }

  for (const order of orders.filter((item) => item.store === "amazon-fresh")) {
    if (
      order.expectedExpenses.length !== 1 ||
      order.expectedExpenses[0].productName !== "Amazon Fresh" ||
      order.expectedExpenses[0].category !== "Groceries"
    ) {
      throw new Error(
        "Amazon Fresh expectations must be one Amazon Fresh expense in Groceries.",
      );
    }
  }

  return {
    userId: new mongoose.Types.ObjectId(userId),
    orders,
    expenses,
    excludedOrders,
    amazonNowOrder: amazonNowOrders[0],
  };
};

const verify = async ({
  userId,
  orders,
  expenses,
  excludedOrders,
  amazonNowOrder,
}) => {
  const purchases = await Purchase.find({
    userId,
    platform: "amazon",
    orderId: { $in: orders.map((order) => order.orderId) },
  })
    .select("platform orderId productName amount category deduplicationKey")
    .lean();

  const expectedKeyToExpense = new Map();
  const expenseChecks = expenses.map((expense) => {
    const deduplicationKey = buildDeduplicationKey(
      userId,
      "amazon",
      expense.orderId,
      expense.productName,
    );
    expectedKeyToExpense.set(deduplicationKey, expense);

    const keyMatches = purchases.filter(
      (purchase) => purchase.deduplicationKey === deduplicationKey,
    );
    const sameExpense = purchases.filter(
      (purchase) =>
        purchase.orderId === expense.orderId &&
        purchase.productName?.trim().toLowerCase() ===
          expense.productName.trim().toLowerCase(),
    );
    const actual = keyMatches[0] || sameExpense[0] || null;
    const fieldsMatch =
      keyMatches.length === 1 &&
      actual.platform === "amazon" &&
      actual.orderId === expense.orderId &&
      actual.productName === expense.productName &&
      actual.amount === expense.amount &&
      (expense.category === null || actual.category === expense.category);

    return {
      orderId: expense.orderId,
      expected: {
        platform: "amazon",
        productName: expense.productName,
        amount: expense.amount,
        category: expense.category,
      },
      actual: actual ? safePurchase(actual) : null,
      deduplicationKeyMatches: keyMatches.length === 1,
      categoryVerified: expense.category !== null,
      passed: fieldsMatch,
    };
  });

  const walletChecks = excludedOrders.map((order) => {
    const storedPurchases = purchases.filter(
      (purchase) => purchase.orderId === order.orderId,
    );
    return {
      orderId: order.orderId,
      noExpenditureStored: storedPurchases.length === 0,
      storedPurchaseCount: storedPurchases.length,
    };
  });

  const amazonNowRows = purchases.filter(
    (purchase) => purchase.orderId === amazonNowOrder.orderId,
  );
  const amazonNowCheck = {
    orderId: amazonNowOrder.orderId,
    expected: {
      productName: "Amazon Now",
      amount: 918,
      category: "quick commerce",
    },
    actual: amazonNowRows.map(safePurchase),
    passed:
      amazonNowRows.length === 1 &&
      amazonNowRows[0].productName === "Amazon Now" &&
      amazonNowRows[0].amount === 918 &&
      amazonNowRows[0].category === "quick commerce" &&
      amazonNowRows[0].deduplicationKey ===
        buildDeduplicationKey(
          userId,
          "amazon",
          amazonNowOrder.orderId,
          "Amazon Now",
        ),
  };

  const expectedKeys = new Set(expectedKeyToExpense.keys());
  const unexpectedPurchases = purchases
    .filter((purchase) => !expectedKeys.has(purchase.deduplicationKey))
    .map(safePurchase);
  const duplicatesPass = expenseChecks.every((check) => check.passed);
  const walletsPass = walletChecks.every((check) => check.noExpenditureStored);
  const unexpectedPass = unexpectedPurchases.length === 0;
  const categoryChecksComplete = expenseChecks.every(
    (check) => check.categoryVerified,
  );
  const dataChecksPassed =
    duplicatesPass && amazonNowCheck.passed && walletsPass && unexpectedPass;

  return {
    readOnly: true,
    userScopeApplied: true,
    duplicateExpenses: {
      expected: expenses.length,
      passed: duplicatesPass,
      records: expenseChecks,
    },
    amazonNow: amazonNowCheck,
    walletTopUps: {
      expected: excludedOrders.length,
      passed: walletsPass,
      orders: walletChecks,
    },
    unexpectedAmazonPurchasesForBatch: {
      passed: unexpectedPass,
      records: unexpectedPurchases,
    },
    dataChecksPassed,
    categoryChecksComplete,
    fullyVerified: dataChecksPassed && categoryChecksComplete,
  };
};

const main = async () => {
  try {
    if (!process.env.MONGO_URI) {
      require("dotenv").config({
        path: path.join(projectRoot, ".env"),
        quiet: true,
      });
    }
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is not configured in the server environment.");
    }

    const inputs = loadInputs();
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    const report = await verify(inputs);
    console.log(JSON.stringify(report, null, 2));
    if (!report.fullyVerified) process.exitCode = 1;
  } catch (error) {
    const safeInputErrors = new Set([
      "Set SPENDWISE_VERIFY_USER_ID to the signed-in user's MongoDB ID.",
      "Set SPENDWISE_VERIFY_EXPECTATIONS_FILE to the local batch expectations JSON.",
      "The expectations file must contain the ten imported orders.",
      "Each expected order must have a unique, non-empty orderId.",
      "Each order must include an expectedExpenses array.",
      "Excluded wallet orders must not list expected expenses.",
      "Each expected expense needs a name, finite amount, and category.",
      "Each expected expense needs a name, finite amount, and a category string or null.",
      "Expectations must describe four excluded orders, six expenses, and one ₹918 Amazon Now expense.",
      "Amazon Fresh expectations must be one Amazon Fresh expense in Groceries.",
      "MONGO_URI is not configured in the server environment.",
    ]);
    const message =
      safeInputErrors.has(error.message) || error instanceof SyntaxError
        ? error instanceof SyntaxError
          ? "The expectations file is not valid JSON."
          : error.message
        : "Verification could not complete; database and file details were withheld.";
    console.error(message);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
};

main();
