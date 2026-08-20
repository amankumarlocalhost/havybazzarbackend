const AppError = require("../utils/AppError");

// Express ke error middleware me 4 arguments zaroori hain (err, req, res, next)
// Iske bina Express ise error handler nahi maanega
function globalErrorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Something went wrong. Please try again.";

  // Mongoose ke "invalid id format" error ko readable banate hain
  if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  }

  // Mongoose duplicate key error (e.g. email already exists)
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue)[0];
    message = `This ${field} is already registered.`;
  }

  // Mongoose validation error (schema rules break hui)
  if (err.name === "ValidationError") {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(", ");
  }

  // Production me hum stack trace user ko kabhi nahi dikhate - security risk hai
  const response = {
    success: false,
    message,
  };

  if (process.env.NODE_ENV === "development") {
    response.stack = err.stack;
  }

  // Agar ye ek "unexpected" error hai (hamara AppError nahi), to server console me
  // poora log karo taaki debug kar sakein
  if (!err.isOperational) {
    console.error("UNEXPECTED ERROR:", err);
  }

  res.status(statusCode).json(response);
}

module.exports = globalErrorHandler;
