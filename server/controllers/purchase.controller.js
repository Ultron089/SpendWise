const Purchase = require("../models/Purchase");
const { buildDeduplicationKey } = require("../services/deduplicationService");

const createPurchase = async (req, res) => {
  try {
    const {
      platform,
      productName,
      amount,
      currency,
      purchaseDate,
      orderId,
      productUrl,
      detectionMethod,
    } = req.body;

    // Validate required fields
    if (!platform || !productName || amount === undefined || !purchaseDate) {
      return res.status(400).json({
        message:
          "Platform, product name, amount and purchase date are required",
      });
    }

    const deduplicationKey = buildDeduplicationKey(
      req.userId,
      platform,
      orderId,
      productName,
    );

    if (deduplicationKey) {
      const existing = await Purchase.findOne({
        userId: req.userId,
        deduplicationKey,
      });

      if (existing) {
        return res.status(200).json({
          message: "Purchase already exists",
          duplicate: true,
          purchase: existing,
        });
      }
    }

    let purchase;
    try {
      purchase = await Purchase.create({
        userId: req.userId,
        platform,
        productName,
        amount,
        currency,
        purchaseDate,
        orderId,
        productUrl,
        detectionMethod,
        deduplicationKey,
      });
    } catch (error) {
      if (error.code !== 11000 || !deduplicationKey) throw error;
      purchase = await Purchase.findOne({
        userId: req.userId,
        deduplicationKey,
      });
      if (!purchase) throw error;

      return res.status(200).json({
        message: "Purchase already exists",
        duplicate: true,
        purchase,
      });
    }

    res.status(201).json({
      message: "Purchase created successfully",
      purchase,
    });
  } catch (error) {
    console.error("Create purchase error:", error.message);

    res.status(500).json({
      message: "Server error",
    });
  }
};

const getPurchases = async (req, res) => {
  try {
    const purchases = await Purchase.find({
      userId: req.userId,
    }).sort({
      purchaseDate: -1,
    });

    res.status(200).json({
      count: purchases.length,
      purchases,
    });
  } catch (error) {
    console.error("Get purchases error:", error.message);

    res.status(500).json({
      message: "Server error",
    });
  }
};

const getPurchaseById = async (req, res) => {
  try {
    const purchase = await Purchase.findOne({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!purchase) {
      return res.status(404).json({
        message: "Purchase not found",
      });
    }

    res.status(200).json({
      purchase,
    });
  } catch (error) {
    console.error("Get purchase error:", error.message);

    res.status(500).json({
      message: "Server error",
    });
  }
};

const updatePurchase = async (req, res) => {
  try {
    const allowedUpdates = [
      "platform",
      "productName",
      "amount",
      "currency",
      "category",
      "purchaseDate",
      "orderId",
      "productUrl",
    ];

    const updates = {};

    for (const field of allowedUpdates) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    const purchase = await Purchase.findOneAndUpdate(
      {
        _id: req.params.id,
        userId: req.userId,
      },
      updates,
      {
        new: true,
        runValidators: true,
      },
    );

    if (!purchase) {
      return res.status(404).json({
        message: "Purchase not found",
      });
    }

    res.status(200).json({
      message: "Purchase updated successfully",
      purchase,
    });
  } catch (error) {
    console.error("Update purchase error:", error.message);

    res.status(500).json({
      message: "Server error",
    });
  }
};

const deletePurchase = async (req, res) => {
  try {
    const purchase = await Purchase.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!purchase) {
      return res.status(404).json({
        message: "Purchase not found",
      });
    }

    res.status(200).json({
      message: "Purchase deleted successfully",
    });
  } catch (error) {
    console.error("Delete purchase error:", error.message);

    res.status(500).json({
      message: "Server error",
    });
  }
};

module.exports = {
  createPurchase,
  getPurchases,
  getPurchaseById,
  updatePurchase,
  deletePurchase,
};
