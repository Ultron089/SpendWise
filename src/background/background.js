console.log("SpendWise background service worker started");

chrome.runtime.onInstalled.addListener(() => {
  console.log("SpendWise installed");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log("Purchase data received:", message);

  if (message?.platform) {
    console.log("Platform:", message.platform);
  }

  if (message?.productName) {
    console.log("Product:", message.productName);
  }

  if (message?.amount) {
    console.log("Amount:", message.amount);
  }

  if (message?.currency) {
    console.log("Currency:", message.currency);
  }

  sendResponse({
    status: "success",
    message: "Purchase data received successfully",
  });

  return true;
});
