import { ValidationError } from "../errors/index.js";

export function validate(schema) {
  return (req, res, next) => {
    const data = {
      body: req.body ?? {},
      query: req.query ?? {},
      params: req.params ?? {},
    };

    const result = schema.safeParse(data);

    if (!result.success) {
      const issues = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        code: issue.code,
        message: issue.message,
      }));

      return next(new ValidationError("Invalid request data", issues));
    }

    req.validated = result.data;
    if (result.data.body !== undefined) {
      req.body = result.data.body;
    }
    if (result.data.query !== undefined && req.query && typeof req.query === "object") {
      Object.assign(req.query, result.data.query);
    }
    if (result.data.params !== undefined && req.params && typeof req.params === "object") {
      Object.assign(req.params, result.data.params);
    }

    return next();
  };
}

export default validate;
