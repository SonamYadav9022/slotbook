import { ApiError } from "../utils/ApiError.js";

export const notFound = (req, res, next) => next(new ApiError(404, "Route not found"));

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ message: err.message, errors: err.errors });
  }
  if (err.name === "CastError") {
    return res.status(400).json({ message: "Invalid id" });
  }
  if (err.code === 11000) {
    return res.status(409).json({ message: "That record already exists" });
  }
  if (process.env.NODE_ENV !== "test") console.error(err);
  res.status(500).json({ message: "Something went wrong on our side. Please try again." });
};
