const express = require("express");
const protect = require("../middleware/auth.middleware");
const { categorize } = require("../controllers/categorization.controller");

const router = express.Router();

router.post("/", protect, categorize);

module.exports = router;
