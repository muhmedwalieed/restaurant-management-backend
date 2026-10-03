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

  // A request that says which restaurant host it came from must belong to the
  // restaurant that issued the token — a token from one tenant is never usable
  // on another tenant's host.
  const requestedSlug = String(req.headers["x-restaurant-slug"] || "").trim().toLowerCase();
  if (requestedSlug) {
    const hostRestaurant = await prisma.restaurant.findUnique({
      where: { slug: requestedSlug },
      select: { id: true, status: true },
    });

    if (!hostRestaurant || hostRestaurant.status !== "ACTIVE" || hostRestaurant.id !== payload.restaurantId) {
      throw new AuthenticationError("This session does not belong to this restaurant");
    }
  }

  const requestedBranchId = req.headers["x-branch-id"] || req.headers["x-branchid"] || null;
  const activeBranchId = requestedBranchId || payload.branchId || null;

  req.tenantContext = {
    restaurantId: payload.restaurantId,
    branchId: activeBranchId,
    employeeId: payload.employeeId,
    role: payload.role || null,
    sessionId: payload.sessionId,
  };

  req.user = {
    id: payload.employeeId,
    restaurantId: payload.restaurantId,
    branchId: activeBranchId,
    role: payload.role,
  };

  next();
});

export default authenticate;
