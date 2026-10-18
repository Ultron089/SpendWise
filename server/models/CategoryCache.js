const mongoose = require("mongoose");

const categoryCacheSchema = new mongoose.Schema(
  {
    normalizedProductName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      enum: [
        "Groceries",
        "Personal Care",
        "Clothing",
        "Footwear",
        "Electronics",
        "Books & Education",
        "Home & Kitchen",
        "Health & Wellness",
        "Beauty",
        "quick commerce",
        "Uncategorized",
      ],
    },
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("CategoryCache", categoryCacheSchema);
