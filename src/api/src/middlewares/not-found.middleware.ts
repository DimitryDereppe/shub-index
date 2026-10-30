import { NotFoundError } from "../lib/errors.ts";

export function notFoundMiddleware() {
  throw new NotFoundError("Resource not found");
}
