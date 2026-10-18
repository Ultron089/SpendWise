const buildDeduplicationKey = (userId, platform, orderId, productName) => {
  const normalizedProductName = productName?.trim().toLowerCase();

  if (!userId || !platform || !orderId || !normalizedProductName) {
    return null;
  }

  return [userId.toString(), platform, orderId, normalizedProductName].join(
    ":",
  );
};

module.exports = { buildDeduplicationKey };
