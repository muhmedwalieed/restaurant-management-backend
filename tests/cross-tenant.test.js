import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/lib/prisma.js";
import branchRepository from "../src/modules/branches/branch.repository.js";
import branchService from "../src/modules/branches/branch.service.js";
import { NotFoundError } from "../src/shared/errors/index.js";

describe("Cross-Tenant Isolation & IDOR Security Tests (Real DB & Repository)", () => {
  let restaurantA;
  let branchA;
  let tenantContextA;

  let restaurantB;
  let branchB;
  let tenantContextB;

  before(async () => {
    // 1. Create Test Fixtures in real DB
    restaurantA = await prisma.restaurant.create({
      data: {
        name: "Test Restaurant Alpha",
        slug: `test-alpha-${Date.now()}`,
        email: `alpha-${Date.now()}@test.com`,
      },
    });

    tenantContextA = {
      restaurantId: restaurantA.id,
    };

    branchA = await branchRepository.createBranch(tenantContextA, {
      name: "Alpha Main Branch",
      code: "MAIN",
      isMain: true,
    });

    restaurantB = await prisma.restaurant.create({
      data: {
        name: "Test Restaurant Beta",
        slug: `test-beta-${Date.now()}`,
        email: `beta-${Date.now()}@test.com`,
      },
    });

    tenantContextB = {
      restaurantId: restaurantB.id,
    };

    branchB = await branchRepository.createBranch(tenantContextB, {
      name: "Beta Main Branch",
      code: "MAIN",
      isMain: true,
    });
  });

  after(async () => {
    // Cleanup created test records from database to maintain a clean DB state
    if (restaurantA?.id || restaurantB?.id) {
      const ids = [restaurantA?.id, restaurantB?.id].filter(Boolean);
      await prisma.auditLog.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.branch.deleteMany({
        where: { restaurantId: { in: ids } },
      });
      await prisma.restaurant.deleteMany({
        where: { id: { in: ids } },
      });
    }
  });

  test("Tenant A can successfully access Tenant A's branch", async () => {
    const fetchedBranch = await branchRepository.findBranchById(tenantContextA, branchA.id);

    assert.equal(fetchedBranch.id, branchA.id);
    assert.equal(fetchedBranch.restaurantId, restaurantA.id);
    assert.equal(fetchedBranch.name, "Alpha Main Branch");
  });

  test("Tenant B attempting to access Tenant A's branch is denied with NotFoundError (404)", async () => {
    const result = await branchRepository.findBranchById(tenantContextB, branchA.id);
    assert.equal(result, null);

    await assert.rejects(
      async () => {
        await branchService.getBranchById(tenantContextB, branchA.id);
      },
      (err) => {
        return err instanceof NotFoundError && err.statusCode === 404;
      }
    );
  });

  test("Tenant Safety-Net Extension throws when query executed without restaurantId", async () => {
    // Attempting a raw findFirst on Branch without restaurantId should trigger safety net violation in test mode
    await assert.rejects(
      async () => {
        await prisma.branch.findFirst({
          where: {
            id: branchA.id, // Missing restaurantId!
          },
        });
      },
      (err) => {
        return err.message.includes("[Tenant Safety-Net Violation]");
      }
    );
  });
});
