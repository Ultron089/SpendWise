const Purchase = require("../models/Purchase");
const { categorizeProduct } = require("../services/geminiService");
const { buildDeduplicationKey } = require("../services/deduplicationService");

const importHistoricalOrders = async (req, res) => {
  try {
    const { orders } = req.body;

    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({
        message: "A non-empty orders array is required",
      });
    }

    if (orders.length > 50) {
      return res.status(400).json({
        message: "Import at most 50 orders per request",
      });
    }

    const summary = {
      received: orders.length,
      imported: 0,
      duplicates: 0,
      excluded: 0,
      failed: 0,
      errors: [],
      results: [],
    };

    for (let orderIndex = 0; orderIndex < orders.length; orderIndex++) {
      const order = orders[orderIndex];
      const failOrder = (code, message) => {
        summary.failed++;
        summary.errors.push({ index: orderIndex, code, message });
        summary.results.push({
          index: orderIndex,
          status: "failed",
          code,
          message,
        });
      };

      try {
        if (
          !order ||
          order.platform !== "amazon" ||
          typeof order.orderId !== "string" ||
          typeof order.amount !== "number" ||
          order.amount <= 0 ||
          !Array.isArray(order.products) ||
          typeof order.currency !== "string"
        ) {
          failOrder("INVALID_ORDER_DATA", "Order data failed validation.");
          continue;
        }

        // Wallet top-ups are transfers, not expenditure.
        if (order.excludedFromExpenditure === true) {
          summary.excluded++;
          summary.results.push({ index: orderIndex, status: "excluded" });
          continue;
        }

        if (order.source === "realtime") {
          const existingOrder = await Purchase.findOne({
            userId: req.userId,
            platform: order.platform,
            orderId: order.orderId,
          }).lean();

          if (existingOrder) {
            summary.duplicates++;
            summary.results.push({ index: orderIndex, status: "duplicate" });
            continue;
          }
        } else {
          const existingRealtimeOrder = await Purchase.findOne({
            userId: req.userId,
            platform: order.platform,
            orderId: order.orderId,
            rawExtractedText: { $regex: '"source":"realtime"' },
          }).lean();

          if (existingRealtimeOrder) {
            summary.duplicates++;
            summary.results.push({ index: orderIndex, status: "duplicate" });
            continue;
          }
        }

        const purchaseDate = new Date(order.orderDateText);

        if (Number.isNaN(purchaseDate.getTime())) {
          failOrder(
            "INVALID_ORDER_DATE",
            "The extracted order date could not be parsed.",
          );
          continue;
        }

        // Until individual prices are available, save the order once.
        // Never assign the order total to each product.
        const orderLevelExpense =
          order.store === "amazon-now" ||
          order.individualPricesAvailable !== true ||
          order.products.length === 0;

        const expenses = [];

        if (orderLevelExpense) {
          let category = "Uncategorized";
          let productName = "Amazon order";

          if (order.store === "amazon-now") {
            category = "quick commerce";
            productName = "Amazon Now";
          } else if (order.store === "amazon-fresh") {
            category = "Groceries";
            productName = "Amazon Fresh";
          } else if (
            order.products.length === 1 &&
            order.products[0].productName
          ) {
            productName = order.products[0].productName;
            const result = await categorizeProduct(productName);
            category = result.category;
          }

          expenses.push({
            productName,
            amount: order.amount,
            category,
            productUrl: order.products[0]?.productUrl,
          });
        } else {
          for (const product of order.products) {
            if (
              typeof product.productName !== "string" ||
              !product.productName.trim() ||
              typeof product.unitPrice !== "number" ||
              product.unitPrice <= 0
            ) {
              throw new Error(
                "Individually priced products require a name and positive unitPrice",
              );
            }

            const result = await categorizeProduct(product.productName);

            expenses.push({
              productName: product.productName.trim(),
              amount: product.unitPrice,
              category: result.category,
              productUrl: product.productUrl,
            });
          }
        }

        let importedExpenses = 0;
        for (const expense of expenses) {
          const deduplicationKey = buildDeduplicationKey(
            req.userId,
            order.platform,
            order.orderId,
            expense.productName,
          );

          const existing = await Purchase.findOne({
            userId: req.userId,
            deduplicationKey,
          }).lean();

          if (existing) {
            summary.duplicates++;
            continue;
          }

          try {
            await Purchase.create({
              userId: req.userId,
              platform: order.platform,
              productName: expense.productName,
              amount: expense.amount,
              currency: order.currency,
              category: expense.category,
              purchaseDate,
              orderId: order.orderId,
              productUrl: expense.productUrl,
              detectionMethod: "auto",
              deduplicationKey,
              rawExtractedText: JSON.stringify({
                store: order.store,
                products: order.products.map((product) => product.productName),
                source: order.source,
              }),
            });

            summary.imported++;
            importedExpenses++;
          } catch (error) {
            if (error.code !== 11000) throw error;

            const duplicate = await Purchase.findOne({
              userId: req.userId,
              deduplicationKey,
            }).lean();
            if (!duplicate) throw error;

            summary.duplicates++;
          }
        }

        summary.results.push({
          index: orderIndex,
          status: importedExpenses > 0 ? "imported" : "duplicate",
        });
      } catch (error) {
        const invalidProductPrice =
          error.message ===
          "Individually priced products require a name and positive unitPrice";
        const code = invalidProductPrice
          ? "INVALID_PRODUCT_PRICE"
          : "ORDER_PROCESSING_FAILED";
        const message = invalidProductPrice
          ? "An individually priced product is missing a valid name or price."
          : "The server could not finish processing this order; it is safe to retry.";

        console.error("Historical order processing failed", {
          index: orderIndex,
          errorName: error.name,
          errorCode: error.code,
        });
        failOrder(code, message);
      }
    }

    return res.status(200).json({
      message: "Historical import processed",
      summary,
    });
  } catch (error) {
    console.error("Historical import error:", error.message);

    return res.status(500).json({
      message: "Historical import failed",
    });
  }
};

module.exports = { importHistoricalOrders };
