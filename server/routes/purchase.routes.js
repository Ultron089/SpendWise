const express = require("express");

const router = express.Router();

const protect = require("../middleware/auth.middleware");

const {
  createPurchase,
  getPurchases,
  getPurchaseById,
  updatePurchase,
  deletePurchase,
} = require("../controllers/purchase.controller");

router.post("/", protect, createPurchase);

router.get("/", protect, getPurchases);

router.get("/:id", protect, getPurchaseById);

router.patch("/:id", protect, updatePurchase);

router.delete("/:id", protect, deletePurchase);

module.exports = router;
