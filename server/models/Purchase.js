const mongoose = require("mongoose");

const purchaseSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    platform: {
      type: String,
      required: true,
      trim: true,
    },

    productName: {
      type: String,
      required: true,
      trim: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      default: "INR",
      trim: true,
    },

    category: {
      type: String,
      default: "Uncategorized",
      trim: true,
    },

    purchaseDate: {
      type: Date,
      required: true,
    },

    orderId: {
      type: String,
      trim: true,
    },

    productUrl: {
      type: String,
      trim: true,
    },

    detectionMethod: {
      type: String,
      enum: ["auto", "manual"],
      default: "auto",
    },

    rawExtractedText: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
);

const Purchase = mongoose.model("Purchase", purchaseSchema);

module.exports = Purchase;
