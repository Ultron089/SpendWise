const express = require("express");

const router = express.Router();
const protect = require("../middleware/auth.middleware");

const {
  register,
  login,
  getCurrentUser,
} = require("../controllers/auth.controller.js");

router.post("/register", register);
router.post("/login", login);
router.get("/me", protect, getCurrentUser);

module.exports = router;
