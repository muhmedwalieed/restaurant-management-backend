import authService from "./auth.service.js";
import { sendSuccess } from "../../shared/utils/response.js";

export class AuthController {
  async register(req, res, next) {
    try {
      const data = await authService.register(req.validated?.body ?? req.body ?? {});
      return sendSuccess(res, {
        statusCode: 201,
        message: "Restaurant and owner registered successfully",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async login(req, res, next) {
    try {
      const userAgent = req.headers["user-agent"] || "Unknown Device";
      const ipAddress = req.ip || req.socket.remoteAddress || "127.0.0.1";

      const body = req.validated?.body ?? req.body ?? {};
      const data = await authService.login({
        email: body.email,
        password: body.password,
        device: userAgent,
        ipAddress,
      });

      // Optionally set HttpOnly cookie
      res.cookie("accessToken", data.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 15 * 60 * 1000,
      });

      res.cookie("refreshToken", data.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return sendSuccess(res, {
        message: "Login successful",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async refresh(req, res, next) {
    try {
      const token = (req.validated?.body ?? req.body ?? {}).refreshToken || req.cookies?.refreshToken;
      const data = await authService.refresh({ refreshToken: token });

      res.cookie("accessToken", data.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 15 * 60 * 1000,
      });

      res.cookie("refreshToken", data.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return sendSuccess(res, {
        message: "Tokens refreshed successfully",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async logout(req, res, next) {
    try {
      await authService.logout(req.tenantContext);

      res.clearCookie("accessToken");
      res.clearCookie("refreshToken");

      return sendSuccess(res, {
        message: "Logged out successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async forceLogout(req, res, next) {
    try {
      const { employeeId } = req.validated?.body ?? req.body ?? {};
      await authService.forceLogout(req.tenantContext, employeeId);

      return sendSuccess(res, {
        message: "Employee force logged out successfully",
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
export default authController;
