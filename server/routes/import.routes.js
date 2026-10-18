const express = require("express");
const protect = require("../middleware/auth.middleware");
const { importHistoricalOrders } = require("../controllers/import.controller");

const router = express.Router();

router.post("/history", protect, importHistoricalOrders);

module.exports = router;
