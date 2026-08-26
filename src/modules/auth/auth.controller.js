import authService from "./auth.service.js";
import { sendSuccess } from "../../shared/utils/response.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

export class AuthController {
  register = asyncHandler(async (req, res) => {
    const data = await authService.register(req.body);
    return sendSuccess(res, {
      statusCode: 201,
      message: "Restaurant and owner registered successfully",
      data,
    });
  });

  login = asyncHandler(async (req, res) => {
    const userAgent = req.headers["user-agent"] || "Unknown Device";
    const ipAddress = req.ip || req.socket.remoteAddress || "127.0.0.1";

    const data = await authService.login({
      email: req.body.email,
      password: req.body.password,
      device: userAgent,
      ipAddress,
      forceLogout: req.body.forceLogout,
    });

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
  });

  refresh = asyncHandler(async (req, res) => {
    const token = req.body.refreshToken || req.cookies?.refreshToken;
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
  });

  logout = asyncHandler(async (req, res) => {
    await authService.logout(req.tenantContext);

    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");

    return sendSuccess(res, {
      message: "Logged out successfully",
    });
  });

  me = asyncHandler(async (req, res) => {
    const profile = await authService.me(req.tenantContext);
    return sendSuccess(res, { data: profile });
  });

  forceLogout = asyncHandler(async (req, res) => {
    const { employeeId } = req.body;
    await authService.forceLogout(req.tenantContext, employeeId);

    return sendSuccess(res, {
      message: "Employee force logged out successfully",
    });
  });
}

export const authController = new AuthController();
export default authController;
