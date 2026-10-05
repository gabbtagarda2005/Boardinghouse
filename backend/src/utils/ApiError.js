class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
    this.expose = true;
  }

  static badRequest(msg = 'Bad request', details) {
    return new ApiError(400, msg, details);
  }
  static unauthorized(msg = 'Authentication required') {
    return new ApiError(401, msg);
  }
  static forbidden(msg = 'You do not have permission to perform this action') {
    return new ApiError(403, msg);
  }
  static notFound(msg = 'Resource not found') {
    return new ApiError(404, msg);
  }
  static tooMany(msg = 'Too many requests. Please try again later.') {
    return new ApiError(429, msg);
  }

  static conflict(msg = 'Conflict', details) {
    return new ApiError(409, msg, details);
  }
}

module.exports = ApiError;
