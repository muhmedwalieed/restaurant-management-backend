import { AuthenticationError } from "../../shared/errors/index.js";
import { verifyAccessToken } from "../../utils/jwt.js";
import prisma from "../../lib/prisma.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

export const authenticate = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    throw new AuthenticationError("Authentication token required");
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    throw new AuthenticationError("Invalid or expired authentication token");
  }

  if (!payload || !payload.restaurantId || !payload.employeeId || !payload.sessionId) {
    throw new AuthenticationError("Invalid token payload structure");
  }

  const session = await prisma.session.findFirst({
    where: {
      id: payload.sessionId,
      restaurantId: payload.restaurantId,
      employeeId: payload.employeeId,
      status: "ACTIVE",
    },
  });

  if (!session) {
    throw new AuthenticationError("Session expired or force logged out");
  }

  req.tenantContext = {
    restaurantId: payload.restaurantId,
    branchId: payload.branchId || null,
    employeeId: payload.employeeId,
    role: payload.role || null,
    sessionId: payload.sessionId,
  };

  req.user = {
    id: payload.employeeId,
    restaurantId: payload.restaurantId,
    branchId: payload.branchId,
    role: payload.role,
  };

  next();
});

export default authenticate;
