const express = require("express");
const app = express();

const importRoutes = require("./routes/import.routes");
const authRoutes = require("./routes/auth.routes");
const purchaseRoutes = require("./routes/purchase.routes");
const errorHandler = require("./middleware/error.middleware");
const categorizationRoutes = require("./routes/categorization.routes");

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "Spendwise API is running....",
  });
});
app.use("/api/categorize", categorizationRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/import", importRoutes);
app.use(errorHandler);

module.exports = app;
