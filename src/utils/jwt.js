import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import env from "../config/env.js";

export function signAccessToken(payload, options = {}) {
  return jwt.sign(
    {
      ...payload,
      jti: randomUUID(),
    },
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
      ...options,
    }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

export function signRefreshToken(payload, options = {}) {
  return jwt.sign(
    {
      ...payload,
      jti: randomUUID(),
    },
    env.JWT_REFRESH_SECRET,
    {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN,
      ...options,
    }
  );
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
}
