const ApiError = require('../utils/ApiError');

function formatIssues(error) {
  return error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
}

/**
 * Validates req.body / req.query / req.params against zod schemas.
 * Parsed (coerced, stripped) values are written to req.body and req.valid.{query,params}
 * (Express 5 makes req.query read-only).
 */
function validate(schemas) {
  return (req, _res, next) => {
    req.valid = req.valid || {};
    for (const part of ['params', 'query', 'body']) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (!result.success) {
        const details = formatIssues(result.error);
        const first = details[0];
        return next(ApiError.badRequest(first ? `${first.field ? `${first.field}: ` : ''}${first.message}` : 'Invalid request', details));
      }
      req.valid[part] = result.data;
      if (part === 'body') req.body = result.data;
    }
    return next();
  };
}

module.exports = { validate };
