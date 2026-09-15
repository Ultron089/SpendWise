const express = require("express");

const router = express.Router();

const {
  createPurchase,
  getPurchases,
  getPurchaseById,
  updatePurchase,
  deletePurchase,
} = require("../controllers/purchase.controller.js");

router.post("/", createPurchase);

router.get("/", getPurchases);

router.get("/:id", getPurchaseById);

router.patch("/:id", updatePurchase);

router.delete("/:id", deletePurchase);

module.exports = router;
