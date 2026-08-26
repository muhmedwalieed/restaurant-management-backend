import { randomUUID } from "crypto";
import logger from "../../config/logger.js";

export function requestIdMiddleware(req, res, next) {
  const requestId = req.headers["x-request-id"] || `req_${randomUUID().replace(/-/g, "")}`;

  req.id = requestId;
  req.requestId = requestId;

  res.setHeader("X-Request-Id", requestId);

  req.log = logger.child({ requestId });

  next();
}

export default requestIdMiddleware;
