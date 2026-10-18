import {
  API_BASE_URL,
  AUTH_STORAGE_KEY,
  PENDING_ORDERS_STORAGE_KEY,
} from "../shared/constants.js";

console.log("SpendWise background service worker started");

const isValidOrder = (order) =>
  order &&
  typeof order.platform === "string" &&
  typeof order.orderId === "string" &&
  Number.isFinite(order.amount) &&
  order.amount > 0 &&
  typeof order.currency === "string" &&
  Array.isArray(order.products);

const getOrderKey = (order) => `${order.platform}:${order.orderId}`;

let pendingOrdersUpdate = Promise.resolve();

const mutatePendingOrders = (transform) => {
  const operation = pendingOrdersUpdate.then(async () => {
    const stored = await chrome.storage.local.get(PENDING_ORDERS_STORAGE_KEY);
    const current = stored[PENDING_ORDERS_STORAGE_KEY] || [];
    const { orders, result } = transform(current);
    await chrome.storage.local.set({
      [PENDING_ORDERS_STORAGE_KEY]: orders,
    });
    return result;
  });

  pendingOrdersUpdate = operation.catch(() => {});
  return operation;
};

const stageHistoricalOrders = async (orders) => {
  return mutatePendingOrders((current) => {
    const pending = new Map(
      current.map((order) => [getOrderKey(order), order]),
    );

    for (const order of orders) {
      pending.set(getOrderKey(order), order);
    }

    const stagedOrders = [...pending.values()];
    return { orders: stagedOrders, result: stagedOrders.length };
  });
};

const isValidRealtimeOrder = (order) =>
  isValidOrder(order) &&
  order.platform === "amazon" &&
  ["amazon", "amazon-fresh", "amazon-now"].includes(order.store) &&
  order.source === "realtime" &&
  order.individualPricesAvailable === false &&
  typeof order.orderDateText === "string" &&
  Number.isFinite(new Date(order.orderDateText).getTime()) &&
  order.products.length === 0 &&
  (order.excludedFromExpenditure === true ||
    order.excludedFromExpenditure === false);

const isAmazonContentSender = (sender) => {
  try {
    const senderUrl = new URL(sender.url || sender.tab?.url);
    return (
      senderUrl.protocol === "https:" &&
      ["amazon.in", "amazon.com"].some(
        (domain) =>
          senderUrl.hostname === domain ||
          senderUrl.hostname.endsWith(`.${domain}`),
      )
    );
  } catch {
    return false;
  }
};

const submitRealtimeOrder = async (order) => {
  await stageHistoricalOrders([order]);

  const auth = await chrome.storage.session.get(AUTH_STORAGE_KEY);
  const token = auth[AUTH_STORAGE_KEY]?.token;
  if (typeof token !== "string" || !token) {
    return {
      status: "queued",
      message: "Sign in to submit this confirmed order; it remains staged.",
    };
  }

  let response;
  let body;
  try {
    response = await fetch(`${API_BASE_URL}/api/import/history`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ orders: [order] }),
    });
    body = await response.json();
  } catch {
    return {
      status: "queued",
      message:
        "The server could not be reached; the confirmed order remains staged.",
    };
  }

  if (response.status === 401) {
    await chrome.storage.session.remove(AUTH_STORAGE_KEY);
    return {
      status: "queued",
      message:
        "Your session expired; sign in again to submit the staged order.",
    };
  }

  if (!response.ok) {
    return {
      status: "queued",
      message: "The server rejected the order; it remains staged for retry.",
    };
  }

  const summary = body?.summary;
  const result = summary?.results?.[0];
  const validSummary =
    summary?.received === 1 &&
    ["imported", "duplicates", "excluded", "failed"].every(
      (field) => Number.isInteger(summary[field]) && summary[field] >= 0,
    ) &&
    summary.imported +
      summary.duplicates +
      summary.excluded +
      summary.failed ===
      1 &&
    Array.isArray(summary.errors) &&
    Array.isArray(summary.results) &&
    summary.results.length === 1 &&
    result?.index === 0 &&
    ["imported", "duplicate", "excluded", "failed"].includes(result.status) &&
    (summary.failed === 1
      ? summary.errors.length === 1 && summary.errors[0].index === 0
      : summary.errors.length === 0);

  if (!validSummary) {
    return {
      status: "queued",
      message: "The server response was incomplete; the order remains staged.",
    };
  }

  if (result.status === "failed") {
    return {
      status: "failed",
      message: `${result.message || "The server could not process this order."} It remains staged for retry.`,
    };
  }

  const orderKey = getOrderKey(order);
  const remaining = await mutatePendingOrders((current) => {
    const orders = current.filter((item) => getOrderKey(item) !== orderKey);
    return { orders, result: orders.length };
  });

  return {
    status: result.status === "imported" ? "success" : result.status,
    message:
      result.status === "imported"
        ? "Amazon confirmed order was saved."
        : result.status === "duplicate"
          ? "This Amazon order already exists."
          : "This Amazon order was excluded from expenditure.",
    remaining,
  };
};

const importPendingOrders = async () => {
  const [auth, stored] = await Promise.all([
    chrome.storage.session.get(AUTH_STORAGE_KEY),
    chrome.storage.local.get(PENDING_ORDERS_STORAGE_KEY),
  ]);
  const token = auth[AUTH_STORAGE_KEY]?.token;
  const pendingOrders = stored[PENDING_ORDERS_STORAGE_KEY] || [];

  if (typeof token !== "string" || !token) {
    return { status: "unauthorized", message: "Sign in before importing." };
  }

  if (pendingOrders.length === 0) {
    return {
      status: "error",
      message: "There are no staged orders to import.",
    };
  }

  const orders = pendingOrders.slice(0, 50);
  let response;
  let body;

  try {
    response = await fetch(`${API_BASE_URL}/api/import/history`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ orders }),
    });

    body = await response.json();
  } catch {
    return {
      status: "error",
      message: "Could not reach the SpendWise server. Staged orders were kept.",
    };
  }

  if (response.status === 401) {
    await chrome.storage.session.remove(AUTH_STORAGE_KEY);
    return {
      status: "unauthorized",
      message: "Your session expired. Sign in again; staged orders were kept.",
    };
  }

  if (!response.ok) {
    return {
      status: "error",
      message:
        typeof body?.message === "string"
          ? body.message
          : `Import failed with HTTP ${response.status}. Staged orders were kept.`,
    };
  }

  const summary = body?.summary;
  const summaryFields = [
    "received",
    "imported",
    "duplicates",
    "excluded",
    "failed",
  ];
  if (
    !summary ||
    summaryFields.some(
      (field) => !Number.isInteger(summary[field]) || summary[field] < 0,
    ) ||
    summary.received !== orders.length ||
    !Array.isArray(summary.errors) ||
    !Array.isArray(summary.results) ||
    summary.results.length !== orders.length
  ) {
    return {
      status: "error",
      message:
        "The server returned an invalid import response. Staged orders were kept.",
    };
  }

  const resolvedStatuses = new Set(["imported", "duplicate", "excluded"]);
  const resultsByIndex = new Map();
  for (const result of summary.results) {
    if (
      !Number.isInteger(result?.index) ||
      result.index < 0 ||
      result.index >= orders.length ||
      resultsByIndex.has(result.index) ||
      ![...resolvedStatuses, "failed"].includes(result.status)
    ) {
      return {
        status: "error",
        message:
          "The server returned invalid order results. Staged orders were kept.",
      };
    }
    resultsByIndex.set(result.index, result);
  }

  if (
    resultsByIndex.size !== orders.length ||
    summary.results.filter((result) => result.status === "failed").length !==
      summary.failed ||
    summary.errors.length !== summary.failed
  ) {
    return {
      status: "error",
      message:
        "The server returned incomplete order results. Staged orders were kept.",
    };
  }

  const failedIndexes = new Set();
  for (const failure of summary.errors) {
    if (
      !Number.isInteger(failure?.index) ||
      failure.index < 0 ||
      failure.index >= orders.length ||
      failedIndexes.has(failure.index) ||
      resultsByIndex.get(failure.index)?.status !== "failed" ||
      typeof failure.code !== "string" ||
      typeof failure.message !== "string"
    ) {
      return {
        status: "error",
        message:
          "The server returned invalid failure details. Staged orders were kept.",
      };
    }
    failedIndexes.add(failure.index);
  }

  const resolvedOrderKeys = new Set(
    summary.results
      .filter((result) => resolvedStatuses.has(result.status))
      .map((result) => getOrderKey(orders[result.index])),
  );
  const remaining = await mutatePendingOrders((current) => {
    const unresolved = current.filter(
      (order) => !resolvedOrderKeys.has(getOrderKey(order)),
    );
    return { orders: unresolved, result: unresolved.length };
  });

  return {
    status: summary.failed === 0 ? "success" : "partial",
    summary,
    remaining,
  };
};

chrome.runtime.onInstalled.addListener(() => {
  console.log("SpendWise installed");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Message received:", message?.type);

  if (message?.type === "HISTORICAL_ORDERS_EXTRACTED") {
    const orders = message.payload;

    if (
      !Array.isArray(orders) ||
      orders.some((order) => !isValidOrder(order))
    ) {
      sendResponse({
        status: "error",
        message: "Invalid historical order data",
      });
      return;
    }

    stageHistoricalOrders(orders)
      .then((staged) => {
        sendResponse({
          status: "staged",
          received: orders.length,
          staged,
          message:
            "Orders staged. Review and import them from the SpendWise popup.",
        });
      })
      .catch((error) => {
        console.error("Could not stage historical orders:", error.message);
        sendResponse({
          status: "error",
          message: "Could not save extracted orders in extension storage.",
        });
      });

    console.log("Historical orders received:", orders.length);
    console.log(
      "Wallet top-ups excluded:",
      orders.filter((order) => order.excludedFromExpenditure).length,
    );
    return true;
  }

  if (message?.type === "IMPORT_HISTORICAL_ORDERS") {
    importPendingOrders()
      .then(sendResponse)
      .catch((error) => {
        console.error("Historical import request failed:", error.message);
        sendResponse({
          status: "error",
          message: "Import failed unexpectedly. Staged orders were kept.",
        });
      });
    return true;
  }

  if (message?.type === "AMAZON_PURCHASE_CONFIRMED") {
    if (
      !isAmazonContentSender(sender) ||
      !isValidRealtimeOrder(message.payload)
    ) {
      sendResponse({
        status: "error",
        message: "Invalid or incomplete confirmed Amazon order.",
      });
      return;
    }

    submitRealtimeOrder(message.payload)
      .then(sendResponse)
      .catch((error) => {
        console.error("Could not queue confirmed Amazon order:", error.message);
        sendResponse({
          status: "error",
          message: "The confirmed order could not be queued safely.",
        });
      });
    return true;
  }

  if (message?.type === "PURCHASE_DETECTED") {
    const purchase = message.payload;

    if (
      !purchase ||
      typeof purchase.platform !== "string" ||
      typeof purchase.productName !== "string" ||
      typeof purchase.amount !== "number" ||
      purchase.amount <= 0 ||
      typeof purchase.currency !== "string"
    ) {
      sendResponse({
        status: "error",
        message: "Invalid purchase data",
      });
      return;
    }

    console.log("Purchase data received successfully");
    console.log("Platform:", purchase.platform);
    console.log("Product:", purchase.productName);
    console.log("Amount:", purchase.amount);
    console.log("Currency:", purchase.currency);
    console.log("Page URL:", sender.tab?.url ?? "Unknown");

    sendResponse({
      status: "success",
      message: "Purchase data received successfully",
    });

    return;
  }

  sendResponse({
    status: "ignored",
    message: "Unknown message type",
  });
});
