const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const Purchase = require("../models/Purchase");
const geminiService = require("../services/geminiService");
const { importHistoricalOrders } = require("../controllers/import.controller");

const root = path.resolve(__dirname, "../..");

const createProductLink = () => ({
  innerText: "Example Amazon product",
  getAttribute: (name) => (name === "href" ? "/dp/B000000001" : null),
  querySelectorAll: () => [],
});

const loadExtractor = (pathname, text, bodyLinks = []) => {
  const productLink = createProductLink();
  const body = {
    innerText: text,
    querySelectorAll: (selector) => {
      if (selector === "a[href]") return bodyLinks;
      return selector.includes("/dp/") ? [productLink] : [];
    },
  };
  const source = fs
    .readFileSync(
      path.join(root, "src/content-scripts/extractors/generic.js"),
      "utf8",
    )
    .replace(
      "export function extractSitePurchaseData()",
      "function extractSitePurchaseData()",
    );
  const context = {
    document: { body, querySelectorAll: () => [] },
    window: {
      location: { hostname: "www.amazon.in", pathname },
    },
  };
  vm.runInNewContext(
    `${source}\nglobalThis.extractSitePurchaseData = extractSitePurchaseData;`,
    context,
  );
  return context.extractSitePurchaseData();
};

const makeOrder = () => ({
  platform: "amazon",
  store: "amazon",
  orderId: "123-1234567-1234567",
  orderDateText: "October 11, 2026",
  amount: 918,
  currency: "INR",
  products: [],
  individualPricesAvailable: false,
  source: "realtime",
  excludedFromExpenditure: false,
});

const makeSummary = (status) => ({
  received: 1,
  imported: status === "imported" ? 1 : 0,
  duplicates: status === "duplicate" ? 1 : 0,
  excluded: status === "excluded" ? 1 : 0,
  failed: status === "failed" ? 1 : 0,
  errors:
    status === "failed"
      ? [{ index: 0, code: "ORDER_PROCESSING_FAILED", message: "Try again." }]
      : [],
  results: [{ index: 0, status }],
});

const createWorker = ({ fetchImpl, authenticated = true } = {}) => {
  const data = {
    spendwisePendingOrders: [],
    ...(authenticated
      ? { spendwiseAuth: { token: "mock-jwt", user: { id: "test-user" } } }
      : {}),
  };
  let onMessage;
  const runtimeMessages = [];
  const chrome = {
    storage: {
      local: {
        async get(key) {
          return { [key]: structuredClone(data[key] || []) };
        },
        async set(values) {
          Object.assign(data, structuredClone(values));
        },
      },
      session: {
        async get(key) {
          return { [key]: structuredClone(data[key]) };
        },
        async remove(key) {
          delete data[key];
        },
      },
    },
    runtime: {
      onInstalled: { addListener() {} },
      sendMessage(message, callback) {
        runtimeMessages.push(message);
        callback?.();
      },
      onMessage: {
        addListener(listener) {
          onMessage = listener;
        },
      },
    },
  };
  const source = fs
    .readFileSync(path.join(root, "src/background/background.js"), "utf8")
    .replace(/^import \{[\s\S]*?\} from "\.\.\/shared\/constants\.js";\s*/, "");
  const context = {
    chrome,
    console,
    URL,
    fetch: fetchImpl,
    API_BASE_URL: "http://localhost:5000",
    AUTH_STORAGE_KEY: "spendwiseAuth",
    PENDING_ORDERS_STORAGE_KEY: "spendwisePendingOrders",
  };
  vm.runInNewContext(source, context);

  return {
    data,
    runtimeMessages,
    send(
      message,
      senderUrl = "https://www.amazon.in/gp/buy/thankyou/confirmation",
    ) {
      return new Promise((resolve) => {
        const returned = onMessage(message, { url: senderUrl }, resolve);
        if (returned !== true) resolve(undefined);
      });
    },
  };
};

test("extracts a completed Amazon confirmation, not an ordinary product view", () => {
  const productView = loadExtractor("/dp/B000000001", "Add to Cart Buy Now");
  assert.equal(productView, null);

  const confirmation = loadExtractor(
    "/gp/buy/thankyou/confirmation",
    "Your order has been placed\nORDER # 123-1234567-1234567\nORDER PLACED October 11, 2026\nTOTAL ₹918",
  );
  assert.equal(confirmation.orderId, "123-1234567-1234567");
  assert.equal(confirmation.amount, 918);
  assert.equal(confirmation.source, "realtime");
});

test("wallet-credit labels are excluded without matching ordinary similar text", () => {
  const walletLink = {
    innerText: "Amazon Pay balance: credits",
    getAttribute: () => "#",
    querySelectorAll: () => [],
  };
  const ordinaryLink = {
    innerText: "Amazon Pay balance gift card holder",
    getAttribute: () => "#",
    querySelectorAll: () => [],
  };
  const confirmationText =
    "Your order has been placed\nORDER # 123-1234567-1234567\nORDER PLACED October 11, 2026\nTOTAL ₹918";

  const walletOrder = loadExtractor(
    "/gp/buy/thankyou/confirmation",
    confirmationText,
    [walletLink],
  );
  const ordinaryOrder = loadExtractor(
    "/gp/buy/thankyou/confirmation",
    confirmationText,
    [ordinaryLink],
  );

  assert.equal(walletOrder.excludedFromExpenditure, true);
  assert.equal(ordinaryOrder.excludedFromExpenditure, false);
  assert.equal(ordinaryOrder.amount, 918);
});

test("realtime extraction classifies Amazon Fresh and Amazon Now order-level purchases", () => {
  const confirmation =
    "Your order has been placed\nORDER # 123-1234567-1234567\nORDER PLACED October 11, 2026\nTOTAL ₹918";
  const freshOrder = loadExtractor(
    "/gp/buy/thankyou/confirmation",
    `${confirmation}\nAmazon Fresh`,
  );
  const nowOrder = loadExtractor(
    "/gp/buy/thankyou/confirmation",
    `${confirmation}\nAmazon Now`,
  );

  assert.equal(freshOrder.store, "amazon-fresh");
  assert.equal(freshOrder.category, "Groceries");
  assert.equal(freshOrder.products.length, 0);
  assert.equal(nowOrder.store, "amazon-now");
  assert.equal(nowOrder.category, "quick commerce");
  assert.equal(nowOrder.products.length, 0);
});

test("submits a valid confirmation and clears it only after backend import", async () => {
  const requests = [];
  const worker = createWorker({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({ summary: makeSummary("imported") }),
      };
    },
  });

  const response = await worker.send({
    type: "AMAZON_PURCHASE_CONFIRMED",
    payload: makeOrder(),
  });

  assert.equal(response.status, "success");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "http://localhost:5000/api/import/history");
  assert.equal(requests[0].options.headers.Authorization, "Bearer mock-jwt");
  assert.equal(
    JSON.parse(requests[0].options.body).orders[0].orderId,
    makeOrder().orderId,
  );
  assert.deepEqual(worker.data.spendwisePendingOrders, []);
  assert.equal(worker.runtimeMessages.length, 1);
  assert.equal(worker.runtimeMessages[0].type, "PURCHASES_IMPORTED");
});

test("a successful staged-history import notifies the dashboard and clears the queue", async () => {
  const worker = createWorker({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ summary: makeSummary("imported") }),
    }),
  });
  const order = { ...makeOrder(), source: "history" };

  const staged = await worker.send({
    type: "HISTORICAL_ORDERS_EXTRACTED",
    payload: [order],
  });
  const imported = await worker.send({ type: "IMPORT_HISTORICAL_ORDERS" });

  assert.equal(staged.status, "staged");
  assert.equal(imported.status, "success");
  assert.deepEqual(worker.data.spendwisePendingOrders, []);
  assert.equal(worker.runtimeMessages.length, 1);
  assert.equal(worker.runtimeMessages[0].type, "PURCHASES_IMPORTED");
});

test("an order already imported from history is treated as duplicate", async () => {
  const worker = createWorker({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ summary: makeSummary("duplicate") }),
    }),
  });

  const response = await worker.send({
    type: "AMAZON_PURCHASE_CONFIRMED",
    payload: makeOrder(),
  });

  assert.equal(response.status, "duplicate");
  assert.deepEqual(worker.data.spendwisePendingOrders, []);
});

test("rejects incomplete or non-Amazon confirmations without API calls", async () => {
  let fetchCount = 0;
  const worker = createWorker({
    fetchImpl: async () => {
      fetchCount++;
      throw new Error("Unexpected request");
    },
  });
  const invalidOrder = { ...makeOrder(), amount: null };

  const invalid = await worker.send({
    type: "AMAZON_PURCHASE_CONFIRMED",
    payload: invalidOrder,
  });
  const wrongSender = await worker.send(
    { type: "AMAZON_PURCHASE_CONFIRMED", payload: makeOrder() },
    "https://example.com/order/confirmation",
  );
  const insecureSender = await worker.send(
    { type: "AMAZON_PURCHASE_CONFIRMED", payload: makeOrder() },
    "http://www.amazon.in/gp/buy/thankyou/confirmation",
  );
  const lookalikeSender = await worker.send(
    { type: "AMAZON_PURCHASE_CONFIRMED", payload: makeOrder() },
    "https://amazon.in.example.com/gp/buy/thankyou/confirmation",
  );

  assert.equal(invalid.status, "error");
  assert.equal(wrongSender.status, "error");
  assert.equal(insecureSender.status, "error");
  assert.equal(lookalikeSender.status, "error");
  assert.equal(fetchCount, 0);
  assert.deepEqual(worker.data.spendwisePendingOrders, []);
});

test("retains a confirmed order when the backend request fails", async () => {
  const worker = createWorker({
    fetchImpl: async () => {
      throw new TypeError("Network unavailable");
    },
  });

  const response = await worker.send({
    type: "AMAZON_PURCHASE_CONFIRMED",
    payload: makeOrder(),
  });

  assert.equal(response.status, "queued");
  assert.equal(worker.data.spendwisePendingOrders.length, 1);
  assert.equal(
    worker.data.spendwisePendingOrders[0].orderId,
    makeOrder().orderId,
  );
});

test("retains an order and clears expired authentication after an API 401", async () => {
  const worker = createWorker({
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      json: async () => ({ message: "Invalid token" }),
    }),
  });

  const response = await worker.send({
    type: "AMAZON_PURCHASE_CONFIRMED",
    payload: makeOrder(),
  });

  assert.equal(response.status, "queued");
  assert.equal(worker.data.spendwisePendingOrders.length, 1);
  assert.equal(worker.data.spendwiseAuth, undefined);
  assert.deepEqual(worker.runtimeMessages, []);
});

test("retains per-order failures and clears resolved exclusions without refreshing purchases", async () => {
  const failedWorker = createWorker({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ summary: makeSummary("failed") }),
    }),
  });
  const failed = await failedWorker.send({
    type: "AMAZON_PURCHASE_CONFIRMED",
    payload: makeOrder(),
  });

  assert.equal(failed.status, "failed");
  assert.equal(failedWorker.data.spendwisePendingOrders.length, 1);
  assert.deepEqual(failedWorker.runtimeMessages, []);

  const excludedWorker = createWorker({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ summary: makeSummary("excluded") }),
    }),
  });
  const excluded = await excludedWorker.send({
    type: "AMAZON_PURCHASE_CONFIRMED",
    payload: makeOrder(),
  });

  assert.equal(excluded.status, "excluded");
  assert.deepEqual(excludedWorker.data.spendwisePendingOrders, []);
  assert.deepEqual(excludedWorker.runtimeMessages, []);
});

const originalFindOne = Purchase.findOne;
const originalCreate = Purchase.create;
const originalCategorizeProduct = geminiService.categorizeProduct;

test.afterEach(() => {
  Purchase.findOne = originalFindOne;
  Purchase.create = originalCreate;
  geminiService.categorizeProduct = originalCategorizeProduct;
});

const runImport = async (orders) => {
  let responseBody;
  const response = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      responseBody = body;
      return this;
    },
  };
  await importHistoricalOrders(
    { userId: "test-user", body: { orders } },
    response,
  );
  return { statusCode: response.statusCode, body: responseBody };
};

const makeHistoricalOrder = (overrides = {}) => ({
  platform: "amazon",
  store: "amazon",
  orderId: "111-2222222-3333333",
  orderDateText: "October 12, 2026",
  amount: 249,
  currency: "INR",
  products: [
    { productName: "History product one", unitPrice: null },
    { productName: "History product two", unitPrice: null },
  ],
  individualPricesAvailable: false,
  source: "history",
  excludedFromExpenditure: false,
  ...overrides,
});

const setupPurchaseMocks = (records) => {
  geminiService.categorizeProduct = async () => ({ category: "Uncategorized" });
  Purchase.findOne = (query) => ({
    lean: async () => {
      const found = records.find((record) => {
        if (
          record.userId !== String(query.userId) ||
          record.platform !== query.platform
        ) {
          return false;
        }
        if (query.orderId && record.orderId !== query.orderId) return false;
        if (
          query.deduplicationKey &&
          record.deduplicationKey !== query.deduplicationKey
        )
          return false;
        if (
          query.rawExtractedText?.$regex &&
          !new RegExp(query.rawExtractedText.$regex).test(
            record.rawExtractedText || "",
          )
        ) {
          return false;
        }
        return true;
      });
      return found || null;
    },
  });
  Purchase.create = async (record) => {
    const saved = { ...record, userId: String(record.userId) };
    records.push(saved);
    return saved;
  };
};

test("history-first order is a duplicate when its realtime confirmation arrives", async () => {
  const records = [];
  setupPurchaseMocks(records);

  const history = await runImport([makeHistoricalOrder()]);
  const realtime = await runImport([
    makeHistoricalOrder({
      source: "realtime",
      products: [],
    }),
  ]);

  assert.equal(history.body.summary.imported, 1);
  assert.equal(realtime.body.summary.duplicates, 1);
  assert.equal(records.length, 1);
});

test("realtime-first order prevents a later history import from adding another expense", async () => {
  const records = [];
  setupPurchaseMocks(records);

  const realtime = await runImport([
    makeHistoricalOrder({ source: "realtime", products: [] }),
  ]);
  const history = await runImport([makeHistoricalOrder()]);

  assert.equal(realtime.body.summary.imported, 1);
  assert.equal(history.body.summary.duplicates, 1);
  assert.equal(records.length, 1);
});
