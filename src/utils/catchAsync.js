// Express me async function ke andar error aaye to wo automatically
// error handler tak nahi pahunchta - ise manually catch karna padta hai
// Ye function har controller ko wrap kar dega taaki try/catch baar baar na likhna pade
function catchAsync(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = catchAsync;
