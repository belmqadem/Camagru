module.exports = (handler) => (req, res, next) => {
  try {
    return Promise.resolve(handler(req, res, next)).catch(next);
  } catch (error) {
    return next(error);
  }
};
