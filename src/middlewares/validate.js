// Generic validation middleware. Har route pe alag-alag if/else likhne ke
// bajaye, ek hi middleware jo koi bhi Zod schema le kar check kar sake.
//
// Usage: router.post('/signup', validate(signupSchema), authController.signup)

const AppError = require('../utils/AppError');

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      // Zod ki error list se sirf pehla, sabse zaroori message uthate hain —
      // user ko ek saath 10 errors dikhana confusing hota hai
      const firstError = result.error.errors[0];
      return next(new AppError(firstError.message, 400));
    }

    // Validated (aur cleaned — trim/lowercase ho chuka) data se body replace
    req.body = result.data;
    next();
  };
}

module.exports = validate;
