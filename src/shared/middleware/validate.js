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
    return next();
  };
}

export default validate;
