import { ApiError } from "../utils/ApiError.js";

export const validate = (schema, source = "body") => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
    return next(new ApiError(400, errors[0]?.message || "Validation failed", errors));
  }
  req[source] = result.data;
  next();
};
