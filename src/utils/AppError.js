// Ye class har jagah use hogi jab bhi hume ek "expected" error throw karni ho
// e.g. "Listing not found" ya "KYC verified nahi hai"
// Isse hum normal bugs aur intentional errors me farq kar payenge
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true; // matlab ye ek "planned" error hai, crash nahi

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
