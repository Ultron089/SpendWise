require("dotenv").config();

const connectDB = require("./config/db");
const { categorizeProduct } = require("./services/geminiService");

const testProducts = [
  "Nivea Men Deep Impact Face Cleanser",
  "Philips Wired Headphones",
  "Zero to One by Peter Thiel",
  "Stainless Steel Insulated Water Bottle",
  "Organic Whole Wheat Flour",
  "Unusual Multipurpose Travel Organizer",
];

async function runTests() {
  try {
    // Connect to MongoDB before querying the cache.
    await connectDB();
    console.log("MongoDB connected for testing.");

    for (const productName of testProducts) {
      try {
        const result = await categorizeProduct(productName);

        console.log("\nProduct:", result.productName);
        console.log("Category:", result.category);
        console.log("Confidence:", result.confidence);
        console.log("Source:", result.cached ? "MongoDB cache" : "Gemini");
      } catch (error) {
        console.error(
          `\nFailed to categorize "${productName}":`,
          error.message,
        );
      }
    }
  } catch (error) {
    console.error("Test setup failed:", error.message);
  } finally {
    // Close the test connection so Node.js can exit.
    const mongoose = require("mongoose");
    await mongoose.disconnect();
  }
}

runTests();
