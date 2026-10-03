import prisma from "../../src/lib/prisma.js";
import { authService } from "../../src/modules/auth/auth.service.js";

/**
 * Staff login is restaurant-scoped: the service only ever matches an account
 * inside one restaurant. In production the restaurant comes from the host the
 * login was made on; in tests we derive it from the account itself, which is the
 * same thing since each test account belongs to exactly one restaurant.
 */
export const staffLogin = async ({ email, password, device, ipAddress, forceLogout = false }) => {
  // Restaurant is the tenant root, so it is the one model that can be queried
  // without a restaurantId (the tenant safety-net forbids the reverse on Employee).
  const restaurant = await prisma.restaurant.findFirst({
    where: {
      employees: { some: { email, deletedAt: null } },
    },
    select: { slug: true },
  });

  if (!restaurant?.slug) {
    throw new Error(`staffLogin: no staff account found for ${email}`);
  }

  return authService.login({
    email,
    password,
    restaurantSlug: restaurant.slug,
    device,
    ipAddress,
    forceLogout,
  });
};

export default staffLogin;
