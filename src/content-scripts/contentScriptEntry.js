console.log("SpendWise content script loaded");

const purchaseData = {
  platform: "amazon",
  productName: "Sony Headphones",
  amount: 2999,
  currency: "INR",
};

chrome.runtime.sendMessage(purchaseData, (response) => {
  console.log("Response from background:", response);
});
