import { randomUUID } from "crypto";
import logger from "../../config/logger.js";

/**
 * Express middleware to generate or accept request IDs for correlation tracking.
 */
export function requestIdMiddleware(req, res, next) {
  const requestId = req.headers["x-request-id"] || `req_${randomUUID().replace(/-/g, "")}`;

  req.id = requestId;
  req.requestId = requestId;

  // Set header on outgoing response
  res.setHeader("X-Request-Id", requestId);

  // Attach child logger scoped to this requestId
  req.log = logger.child({ requestId });

  next();
}

export default requestIdMiddleware;
