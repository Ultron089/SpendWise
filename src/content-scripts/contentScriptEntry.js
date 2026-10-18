import { extractSitePurchaseData } from "./extractors/generic.js";

console.log("SpendWise content script loaded");

const extractedData = extractSitePurchaseData();

console.log("SpendWise extracted data:", extractedData);
console.log(
  "SpendWise extracted count:",
  Array.isArray(extractedData) ? extractedData.length : "Not an array",
);

if (Array.isArray(extractedData)) {
  console.log("SpendWise: Historical orders extracted", extractedData);

  chrome.runtime.sendMessage(
    {
      type: "HISTORICAL_ORDERS_EXTRACTED",
      payload: extractedData,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error(
          "SpendWise: Could not send historical orders:",
          chrome.runtime.lastError.message,
        );
        return;
      }

      console.log("SpendWise: Background response", response);
    },
  );
} else if (extractedData) {
  chrome.runtime.sendMessage(
    {
      type: "AMAZON_PURCHASE_CONFIRMED",
      payload: extractedData,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error(
          "SpendWise: Could not send confirmed Amazon order:",
          chrome.runtime.lastError.message,
        );
        return;
      }

      console.log("SpendWise: Confirmed-order response", response);
    },
  );
} else if (extractedData) {
  console.log("SpendWise: No completed Amazon order detected.");
} else {
  console.log("SpendWise: No supported purchase page detected.");
}
