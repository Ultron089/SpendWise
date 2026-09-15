const express = require("express");
const app = express();

const authRoutes = require("./routes/auth.routes");
const purchaseRoutes = require("./routes/purchase.routes");
const errorHandler = require("./middleware/error.middleware");

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "Spendwise API is running....",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use(errorHandler);

module.exports = app;
