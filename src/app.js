const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const mongoSanitize = require("express-mongo-sanitize");
const hpp = require("hpp");

const globalErrorHandler = require("./middlewares/errorHandler");
const AppError = require("./utils/AppError");

const app = express();

// ---- Security & utility middlewares ----
app.use(helmet()); // common security headers set karta hai
app.use(
  cors({
    origin: process.env.CLIENT_URL || "*",
    credentials: true,
  })
);
app.use(compression()); // responses ko gzip karta hai, faster load
/**
 * IMPORTANT: `verify` callback se raw request body ka buffer bhi capture
 * kar lete hain (`req.rawBody`). Razorpay WEBHOOK signature isi raw
 * buffer pe calculate hoti hai — agar hum sirf parsed JSON object pe
 * signature verify karte, to bytes-level formatting (spacing, key order)
 * badalne se signature match hi nahi hoti. Ye ek chhota sa addition hai
 * jo poore webhook flow ko sahi banata hai — `payment.controller.js`
 * ka `webhook` handler isi `req.rawBody` ko use karta hai.
 */
app.use(
  express.json({
    limit: "10mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); // refresh token httpOnly cookie padhne ke liye

/**
 * NoSQL injection se bachaata hai — agar koi request body me
 * `{"email": {"$gt": ""}}` jaisa MongoDB operator bhejne ki koshish
 * kare (jo login bypass kar sakta hai), ye usko strip kar deta hai.
 */
app.use(mongoSanitize());

/**
 * HTTP Parameter Pollution se bachaata hai — agar koi `?role=buyer&role=admin`
 * jaisa duplicate query param bheje, Express confusion me kaam kar sakta
 * hai. `hpp()` sirf aakhri value rakhta hai.
 */
app.use(hpp());

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev")); // console me requests dikhega (dev me kaam ka hai)
}

// ---- Health check ----
// Deployment ke baad ye check karne ke liye ki server zinda hai
app.get("/health", (req, res) => {
  res.status(200).json({ success: true, message: "Heavy Bazar API is running" });
});

// ---- Routes ----
// Jaise jaise modules banenge, yahan register honge
app.use("/api/v1/auth", require("./routes/auth.routes"));
app.use("/api/v1/kyc", require("./routes/kyc.routes"));
app.use("/api/v1/categories", require("./routes/category.routes"));
app.use("/api/v1/listings", require("./routes/listing.routes"));
app.use("/api/v1/admin", require("./routes/admin.routes"));
app.use("/api/v1/cms", require("./routes/cms.routes"));
app.use("/api/v1/auctions", require("./routes/auction.routes"));
app.use("/api/v1/payments", require("./routes/payment.routes"));
app.use("/api/v1/withdrawals", require("./routes/withdrawal.routes"));
app.use("/api/v1/wallet", require("./routes/wallet.routes"));
app.use("/api/v1/orders", require("./routes/order.routes"));
app.use("/api/v1/notifications", require("./routes/notification.routes"));
app.use("/api/v1/support-tickets", require("./routes/supportTicket.routes"));
app.use("/api/v1/reports", require("./routes/report.routes"));

// ---- Unknown route handler ----
app.all("*", (req, res, next) => {
  next(new AppError(`Route ${req.originalUrl} does not exist`, 404));
});

// ---- Global error handler (hamesha sabse aakhir me) ----
app.use(globalErrorHandler);

module.exports = app;
