import crypto from "crypto";
import authRepository from "./auth.repository.js";
import { hashPassword, verifyPassword } from "./keychain.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../utils/jwt.js";
import { AuthenticationError, BusinessRuleError } from "../../shared/errors/index.js";
import redis from "../../config/redis.js";
import logger from "../../config/logger.js";

/**
 * Computes SHA-256 hash of a refresh token.
 */
function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export class AuthService {
  /**
   * Registers a new Restaurant + Owner Employee in a single transaction.
   */
  async register(data) {
    const ownerPasswordHash = await hashPassword(data.password);

    const result = await authRepository.registerRestaurantTransaction({
      name: data.restaurantName,
      slug: data.restaurantSlug.toLowerCase(),
      email: data.email.toLowerCase(),
      phone: data.phone || null,
      branchName: data.branchName,
      ownerName: data.name,
      ownerEmail: data.email.toLowerCase(),
      ownerPasswordHash,
    });

    const { employee, restaurant } = result;

    return {
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
      },
      employee: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        role: employee.role.name,
      },
    };
  }

  /**
   * Handles Employee Login with Single Active Session enforcement.
   */
  async login({ email, password, device, ipAddress }) {
    const employee = await authRepository.findEmployeeByEmailForLogin(email);

    if (!employee) {
      logger.warn({ email, ipAddress }, "Login failed: employee not found or inactive");
      throw new AuthenticationError("Invalid email or password");
    }

    const passwordValid = await verifyPassword(password, employee.passwordHash);
    if (!passwordValid) {
      logger.warn({ email, employeeId: employee.id, ipAddress }, "Login failed: invalid password");
      throw new AuthenticationError("Invalid email or password");
    }

    const restaurantId = employee.restaurantId;
    const employeeId = employee.id;

    // Single Active Session Check (Fix #5):
    // Check if an active session exists on a DIFFERENT device fingerprint
    const otherDeviceSession = await authRepository.findActiveSessionOnDifferentDevice(
      restaurantId,
      employeeId,
      device
    );

    if (otherDeviceSession) {
      throw new BusinessRuleError("This account is already active on another device.", {
        forceLogoutRequired: true,
        sessionDevice: otherDeviceSession.device,
      });
    }

    // Check if session exists on SAME device fingerprint
    let session = await authRepository.findActiveSessionByDevice(restaurantId, employeeId, device);

    const dummyRefreshToken = signRefreshToken({ employeeId, restaurantId });
    const refreshTokenHash = hashRefreshToken(dummyRefreshToken);

    if (session) {
      await authRepository.updateSessionRefreshHash(restaurantId, session.id, refreshTokenHash);
    } else {
      session = await authRepository.createSession({
        restaurantId,
        employeeId,
        device,
        ipAddress,
        refreshTokenHash,
      });
    }

    // Generate JWT Tokens with sessionId in payload
    const tokenPayload = {
      sessionId: session.id,
      restaurantId: employee.restaurantId,
      branchId: employee.branchId,
      employeeId: employee.id,
      role: employee.role.name,
    };

    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken({
      sessionId: session.id,
      restaurantId: employee.restaurantId,
      employeeId: employee.id,
    });

    // Update DB with actual refresh token hash
    const finalHash = hashRefreshToken(refreshToken);
    await authRepository.updateSessionRefreshHash(restaurantId, session.id, finalHash);

    logger.info({ employeeId: employee.id, restaurantId, ipAddress }, "Login successful");

    return {
      accessToken,
      refreshToken,
      employee: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        role: employee.role.name,
        branchId: employee.branchId,
        restaurantId: employee.restaurantId,
      },
    };
  }

  /**
   * Handles Token Refresh with Rotation & Employee re-validation (Fix #4).
   */
  async refresh({ refreshToken }) {
    if (!refreshToken) {
      throw new AuthenticationError("Refresh token is required");
    }

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (err) {
      throw new AuthenticationError("Invalid or expired refresh token");
    }

    const incomingHash = hashRefreshToken(refreshToken);
    const session = await authRepository.findActiveSessionByRefreshHash(
      incomingHash,
      payload.restaurantId
    );

    if (!session || session.status !== "ACTIVE") {
      throw new AuthenticationError("Invalid or revoked refresh token");
    }

    // Employee Re-validation (Fix #4):
    const employee = session.employee;
    if (!employee || employee.status !== "ACTIVE" || employee.deletedAt !== null) {
      await authRepository.endSession(session.restaurantId, session.id);
      throw new AuthenticationError("Employee account is inactive or deleted");
    }

    // Token Rotation: Generate new Access & Refresh tokens, invalidate old hash
    const newAccessToken = signAccessToken({
      sessionId: session.id,
      restaurantId: session.restaurantId,
      branchId: employee.branchId,
      employeeId: employee.id,
      role: employee.role.name,
    });

    const newRefreshToken = signRefreshToken({
      sessionId: session.id,
      restaurantId: session.restaurantId,
      employeeId: employee.id,
    });

    const newHash = hashRefreshToken(newRefreshToken);
    await authRepository.updateSessionRefreshHash(session.restaurantId, session.id, newHash);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Handles normal Logout for current session.
   */
  async logout(tenantContext) {
    if (!tenantContext || !tenantContext.sessionId) {
      return;
    }
    await authRepository.endSession(tenantContext.restaurantId, tenantContext.sessionId);
  }

  /**
   * Force logouts target employee & invalidates Redis permission cache (Fix #2).
   */
  async forceLogout(tenantContext, targetEmployeeId) {
    if (!tenantContext || !tenantContext.restaurantId) {
      throw new AuthenticationError("TenantContext required");
    }

    // Self force-logout check (Fix #2):
    if (tenantContext.employeeId === targetEmployeeId) {
      throw new BusinessRuleError("You cannot force logout your active session");
    }

    await authRepository.forceLogoutEmployee(tenantContext.restaurantId, targetEmployeeId);

    // Immediate Redis Permission Cache Invalidation
    try {
      await redis.del(`permissions:${targetEmployeeId}`);
    } catch (err) {
      logger.warn({ err: err.message }, "Redis cache deletion failed on forceLogout");
    }
  }
}

export const authService = new AuthService();
export default authService;
