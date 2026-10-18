const PLATFORM_DOMAINS = {
  "amazon.in": "amazon",
  "amazon.com": "amazon",
  "flipkart.com": "flipkart",
  "myntra.com": "myntra",
  "ajio.com": "ajio",
  "blinkit.com": "blinkit",
  "zepto.com": "zepto",
  "zeptonow.com": "zepto",
};

function getPlatform(hostname) {
  const host = hostname.toLowerCase();

  return (
    Object.entries(PLATFORM_DOMAINS).find(
      ([domain]) => host === domain || host.endsWith(`.${domain}`),
    )?.[1] ?? null
  );
}

function parseAmount(text) {
  if (!text) return null;

  const match = text.match(/(?:₹|Rs\.?\s*)\s*([\d,]+(?:\.\d{1,2})?)/i);

  if (!match) return null;

  const amount = Number(match[1].replace(/,/g, ""));

  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function cleanProductName(value) {
  return (value || "")
    .replace(/\s+/g, " ")
    .replace(
      /\b(view your item|buy it again|add all items to cart|view order details|problem with order|write a product review|track package)\b/gi,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function detectAmazonStore(card) {
  const evidence = [
    card.innerText || "",
    ...[...card.querySelectorAll("a[href]")].map(
      (link) => link.getAttribute("href") || "",
    ),
    ...[...card.querySelectorAll("img")].map(
      (img) => `${img.alt || ""} ${img.title || ""}`,
    ),
  ]
    .join(" ")
    .toLowerCase();

  if (/\bamazon[\s_-]*fresh\b/.test(evidence)) {
    return { store: "amazon-fresh", category: "Groceries" };
  }

  if (/\bamazon[\s_-]*now\b/.test(evidence)) {
    return { store: "amazon-now", category: "Miscellaneous" };
  }

  return { store: "amazon", category: "Uncategorized" };
}

function extractAmazonProducts(card) {
  const products = [];
  const seen = new Set();

  const links = card.querySelectorAll(
    'a[href*="/dp/"], a[href*="/gp/product/"]',
  );

  for (const link of links) {
    const href = link.getAttribute("href") || "";
    const canonicalPath = href.split("?")[0];

    if (!canonicalPath || seen.has(canonicalPath)) continue;

    const imageNames = [...link.querySelectorAll("img")]
      .map((img) => img.alt?.trim() || img.title?.trim() || "")
      .filter(Boolean);

    const rawName = link.innerText?.trim() || imageNames[0] || "";

    const productName = cleanProductName(rawName);

    if (
      !productName ||
      /amazon pay balance|problem with order|add all items to cart|buy it again/i.test(
        productName,
      )
    ) {
      continue;
    }

    seen.add(canonicalPath);

    products.push({
      productName,
      productUrl: href,
      unitPrice: null,
    });
  }

  return products;
}

function extractAmazonOrderHistory() {
  const cards = document.querySelectorAll(".order-card.js-order-card");

  return [...cards]
    .map((card) => {
      const text = card.innerText || "";

      const orderId = text.match(/ORDER\s*#?\s*([0-9-]+)/i)?.[1] ?? null;

      const orderDateText =
        text.match(/ORDER PLACED\s*\n?\s*([^\n]+)/i)?.[1]?.trim() ?? null;

      const totalText = text.match(/TOTAL\s*\n?\s*(₹[\d,.]+)/i)?.[1] ?? null;

      const amount = parseAmount(totalText);

      // Detect wallet top-ups using the product label, not order ID.
      const isWalletTopUp = [...card.querySelectorAll("a[href]")].some(
        (link) =>
          /amazon pay balance\s*:\s*credits/i.test(link.innerText.trim()) ||
          [...link.querySelectorAll("img")].some((img) =>
            /amazon pay balance\s*:\s*credits/i.test(
              `${img.alt || ""} ${img.title || ""}`,
            ),
          ),
      );

      const { store } = detectAmazonStore(card);

      // Wallet top-ups are not purchases.
      const extractedProducts = isWalletTopUp
        ? []
        : extractAmazonProducts(card);

      // Categorize each extracted product independently.
      const products = extractedProducts.map((product) => ({
        ...product,
        category: null,
      }));

      // Individual prices are unavailable until price extraction
      // has actually been implemented.
      const individualPricesAvailable =
        products.length > 0 &&
        products.every(
          (product) =>
            Number.isFinite(product.unitPrice) && product.unitPrice > 0,
        );

      let category = "Uncategorized";

      if (isWalletTopUp) {
        category = "Uncategorized";
      } else if (store === "amazon-fresh") {
        category = "Groceries";
      } else if (store === "amazon-now" && !individualPricesAvailable) {
        category = "quick commerce";
      }

      return {
        platform: "amazon",
        store,
        orderId,
        orderDateText,
        amount,
        currency: "INR",
        products,
        category,
        individualPricesAvailable,
        source: "history",
        excludedFromExpenditure: isWalletTopUp,
        exclusionReason: isWalletTopUp
          ? "Wallet top-up is not a purchase"
          : null,
      };
    })
    .filter((order) => order.orderId && order.amount !== null);
}

function extractAmazonRealtimeOrder() {
  const hostname = window.location.hostname.toLowerCase();
  const isAmazonHost = ["amazon.in", "amazon.com"].some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
  const isConfirmationPath = /^\/gp\/buy\/thankyou(?:\/|$)/i.test(
    window.location.pathname,
  );

  if (!isAmazonHost || !isConfirmationPath || !document.body) return null;

  const text = document.body.innerText || "";
  const confirmsCompletedOrder =
    /(?:your order has been placed|order placed[,! ]+thanks|thank you[,!]?\s+(?:your\s+)?order(?:\s+has been)?\s+placed)/i.test(
      text,
    );
  if (!confirmsCompletedOrder) return null;

  const orderId =
    text.match(/ORDER\s*#?\s*([0-9-]+)/i)?.[1] ??
    text.match(/ORDER\s+NUMBER\s*:?\s*([0-9-]+)/i)?.[1] ??
    null;
  const orderDateText =
    text.match(/ORDER PLACED(?:\s+ON)?\s*:?\s*([^\n]+)/i)?.[1]?.trim() ?? null;
  const totalText = text.match(/TOTAL\s*:?\s*(₹[\d,.]+)/i)?.[1] ?? null;
  const amount = parseAmount(totalText);

  if (!orderId || !orderDateText || !amount) return null;

  const isWalletTopUp = [...document.body.querySelectorAll("a[href]")].some(
    (link) =>
      /amazon pay balance\s*:\s*credits/i.test(link.innerText.trim()) ||
      [...link.querySelectorAll("img")].some((img) =>
        /amazon pay balance\s*:\s*credits/i.test(
          `${img.alt || ""} ${img.title || ""}`,
        ),
      ),
  );
  const store = detectAmazonStore(document.body).store;

  return {
    platform: "amazon",
    store,
    orderId,
    orderDateText,
    amount,
    currency: "INR",
    products: [],
    category: isWalletTopUp
      ? "Uncategorized"
      : store === "amazon-fresh"
        ? "Groceries"
        : store === "amazon-now"
          ? "quick commerce"
          : "Uncategorized",
    individualPricesAvailable: false,
    source: "realtime",
    excludedFromExpenditure: isWalletTopUp,
    exclusionReason: isWalletTopUp ? "Wallet top-up is not a purchase" : null,
  };
}

export function extractSitePurchaseData() {
  const platform = getPlatform(window.location.hostname);

  if (!platform) return null;

  if (
    platform === "amazon" &&
    /\/(?:gp\/css\/order-history|your-orders\/orders)/i.test(
      window.location.pathname,
    )
  ) {
    return extractAmazonOrderHistory();
  }

  return extractAmazonRealtimeOrder();
}
