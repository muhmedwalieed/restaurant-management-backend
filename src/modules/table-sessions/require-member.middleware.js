import { AuthenticationError } from "../../shared/errors/index.js";
import { verifyAccessToken } from "../../utils/jwt.js";

export function requireMember(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw new AuthenticationError("A table session join token is required");
    const payload = verifyAccessToken(token);
    if (payload.type !== "table-member" || !payload.restaurantId || !payload.sessionId || !payload.memberId) {
      throw new AuthenticationError("Invalid table session token");
    }
    req.memberContext = {
      restaurantId: payload.restaurantId,
      sessionId: payload.sessionId,
      memberId: payload.memberId,
    };
    next();
  } catch (err) {
    next(err instanceof AuthenticationError ? err : new AuthenticationError("Invalid or expired table session token"));
  }
}

export default requireMember;