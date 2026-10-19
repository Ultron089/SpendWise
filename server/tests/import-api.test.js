const assert = require("node:assert/strict");
const test = require("node:test");
const jwt = require("jsonwebtoken");
const Purchase = require("../models/Purchase");
const app = require("../app");

const originalFindOne = Purchase.findOne;
const originalCreate = Purchase.create;
const originalJwtSecret = process.env.JWT_SECRET;
const jwtSecret = "spendwise-route-test-secret";
const userId = "route-test-user";
const records = [];

let server;
let baseUrl;

const makeOrder = (overrides = {}) => ({
  platform: "amazon",
  store: "amazon",
  orderId: "route-test-123-4567890-1234567",
  orderDateText: "October 11, 2026",
  amount: 918,
  currency: "INR",
  products: [],
  individualPricesAvailable: false,
  source: "realtime",
  excludedFromExpenditure: false,
  ...overrides,
});

const createToken = () => jwt.sign({ userId }, jwtSecret);

const postImport = async (body, token = createToken(), rawBody = null) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (rawBody === null) headers["Content-Type"] = "application/json";

  return fetch(`${baseUrl}/api/import/history`, {
    method: "POST",
    headers,
    body: rawBody === null ? JSON.stringify(body) : rawBody,
  });
};

test.before(async () => {
  process.env.JWT_SECRET = jwtSecret;
  Purchase.findOne = (query) => ({
    lean: async () =>
      records.find((record) => {
        if (record.userId !== String(query.userId)) return false;
        if (query.platform && record.platform !== query.platform) return false;
        if (query.orderId && record.orderId !== query.orderId) return false;
        if (
          query.deduplicationKey &&
          record.deduplicationKey !== query.deduplicationKey
        ) {
          return false;
        }
        if (
          query.rawExtractedText?.$regex &&
          !new RegExp(query.rawExtractedText.$regex).test(
            record.rawExtractedText || "",
          )
        ) {
          return false;
        }
        return true;
      }) || null,
  });
  Purchase.create = async (purchase) => {
    const saved = { ...purchase, userId: String(purchase.userId) };
    records.push(saved);
    return saved;
  };

  server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  server.closeAllConnections();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  Purchase.findOne = originalFindOne;
  Purchase.create = originalCreate;
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});

test("the import route rejects missing and invalid JWTs", async () => {
  const missing = await postImport({ orders: [makeOrder()] }, null);
  const invalid = await postImport({ orders: [makeOrder()] }, "not-a-jwt");

  assert.equal(missing.status, 401);
  assert.deepEqual(await missing.json(), {
    message: "Authentication required",
  });
  assert.equal(invalid.status, 401);
  assert.deepEqual(await invalid.json(), {
    message: "Invalid or expired token",
  });
});

test("the import route accepts a valid JWT and validates request limits", async () => {
  const empty = await postImport({ orders: [] });
  const invalid = await postImport({ orders: "not-an-array" });
  const tooMany = await postImport({
    orders: Array.from({ length: 51 }, (_, index) =>
      makeOrder({ orderId: `limit-${index}` }),
    ),
  });
  const malformedJson = await postImport(null, createToken(), '{"orders":');

  assert.equal(empty.status, 400);
  assert.deepEqual(await empty.json(), {
    message: "A non-empty orders array is required",
  });
  assert.equal(invalid.status, 400);
  assert.equal(tooMany.status, 400);
  assert.deepEqual(await tooMany.json(), {
    message: "Import at most 50 orders per request",
  });
  assert.equal(malformedJson.status, 500);
  assert.deepEqual(await malformedJson.json(), {
    message: "Historical import failed",
  });
});

test("the authenticated route persists an order and reports a repeated event as duplicate", async () => {
  records.length = 0;

  const first = await postImport({ orders: [makeOrder()] });
  const firstBody = await first.json();
  const second = await postImport({ orders: [makeOrder()] });
  const secondBody = await second.json();

  assert.equal(first.status, 200);
  assert.equal(firstBody.summary.imported, 1);
  assert.equal(firstBody.summary.results[0].status, "imported");
  assert.equal(records.length, 1);
  assert.equal(records[0].amount, 918);
  assert.equal(records[0].productName, "Amazon order");
  assert.equal(records[0].userId, userId);
  assert.equal(second.status, 200);
  assert.equal(secondBody.summary.duplicates, 1);
  assert.equal(secondBody.summary.results[0].status, "duplicate");
  assert.equal(records.length, 1);
});

test("wallet credits are excluded without excluding an ordinary similar-value order", async () => {
  records.length = 0;

  const walletOrder = makeOrder({
    orderId: "wallet-credit-test",
    excludedFromExpenditure: true,
    products: [{ productName: "Amazon Pay balance: credits" }],
  });
  const ordinaryOrder = makeOrder({
    orderId: "ordinary-similar-amount",
    excludedFromExpenditure: false,
    products: [
      { productName: "Amazon Pay balance gift card holder", unitPrice: null },
      { productName: "Ordinary item", unitPrice: null },
    ],
  });
  const response = await postImport({ orders: [walletOrder, ordinaryOrder] });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.summary.excluded, 1);
  assert.equal(body.summary.imported, 1);
  assert.deepEqual(
    body.summary.results.map((result) => result.status),
    ["excluded", "imported"],
  );
  assert.equal(records.length, 1);
  assert.equal(records[0].orderId, "ordinary-similar-amount");
});

test("the route stores Amazon Fresh and Amazon Now as order-level category expenses", async () => {
  records.length = 0;

  const response = await postImport({
    orders: [
      makeOrder({ orderId: "fresh-order", store: "amazon-fresh" }),
      makeOrder({ orderId: "now-order", store: "amazon-now" }),
    ],
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.summary.imported, 2);
  assert.deepEqual(
    records.map(({ orderId, productName, amount, category }) => ({
      orderId,
      productName,
      amount,
      category,
    })),
    [
      {
        orderId: "fresh-order",
        productName: "Amazon Fresh",
        amount: 918,
        category: "Groceries",
      },
      {
        orderId: "now-order",
        productName: "Amazon Now",
        amount: 918,
        category: "quick commerce",
      },
    ],
  );
});

test("malformed orders and persistence errors are reported per order", async () => {
  records.length = 0;

  const invalidDate = makeOrder({
    orderId: "invalid-date-test",
    orderDateText: "not a date",
  });
  const response = await postImport({ orders: [{}, invalidDate] });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.summary.received, 2);
  assert.equal(body.summary.failed, 2);
  assert.deepEqual(
    body.summary.errors.map((error) => error.code),
    ["INVALID_ORDER_DATA", "INVALID_ORDER_DATE"],
  );

  Purchase.create = async () => {
    throw new Error("test persistence failure");
  };
  const failedWrite = await postImport({
    orders: [makeOrder({ orderId: "write-failure-test" })],
  });
  const failedBody = await failedWrite.json();

  assert.equal(failedWrite.status, 200);
  assert.equal(failedBody.summary.failed, 1);
  assert.equal(failedBody.summary.results[0].code, "ORDER_PROCESSING_FAILED");
  Purchase.create = async (purchase) => {
    const saved = { ...purchase, userId: String(purchase.userId) };
    records.push(saved);
    return saved;
  };
});
