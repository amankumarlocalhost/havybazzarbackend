const mongoose = require("mongoose");

// MongoDB se connect karne ka function
// Ye server start hote hi ek baar call hoga
async function connectDB() {
  try {
    const uri = process.env.MONGO_URI;

    if (!uri) {
      throw new Error("MONGO_URI .env file me set nahi hai");
    }

    await mongoose.connect(uri);

    console.log("MongoDB connected successfully");

    // Connection drop hone pe log dikhega (production debugging ke liye)
    mongoose.connection.on("disconnected", () => {
      console.error("MongoDB disconnected");
    });

    mongoose.connection.on("error", (err) => {
      console.error("MongoDB connection error:", err.message);
    });
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    // DB connect nahi hui to server ko chalne ka koi matlab nahi
    process.exit(1);
  }
}

module.exports = connectDB;
