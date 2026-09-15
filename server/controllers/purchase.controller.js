const createPurchase = (req, res) => {
  res.status(200).json({
    message: "Create purchase controller reached",
  });
};

const getPurchases = (req, res) => {
  res.status(200).json({
    message: "Get purchases controller reached",
  });
};

const getPurchaseById = (req, res) => {
  res.status(200).json({
    message: "Get purchase by ID controller reached",
    id: req.params.id,
  });
};

const updatePurchase = (req, res) => {
  res.status(200).json({
    message: "Update purchase controller reached",
    id: req.params.id,
  });
};

const deletePurchase = (req, res) => {
  res.status(200).json({
    message: "Delete purchase controller reached",
    id: req.params.id,
  });
};

module.exports = {
  createPurchase,
  getPurchases,
  getPurchaseById,
  updatePurchase,
  deletePurchase,
};
