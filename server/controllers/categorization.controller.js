const { categorizeProduct } = require("../services/geminiService");

const categorize = async (req, res) => {
  try {
    const { productName } = req.body;

    if (typeof productName !== "string" || productName.trim().length === 0) {
      return res.status(400).json({
        message: "A valid productName is required",
      });
    }

    if (productName.trim().length > 300) {
      return res.status(400).json({
        message: "Product name must be 300 characters or fewer",
      });
    }

    const result = await categorizeProduct(productName);

    return res.status(200).json(result);
  } catch (error) {
    console.error("Categorization error:", error.message);

    return res.status(502).json({
      message: "Product categorization failed",
    });
  }
};

module.exports = { categorize };
