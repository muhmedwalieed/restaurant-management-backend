import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import bcrypt from "bcrypt";
import app from "../src/app/app.js";
import prisma from "../src/lib/prisma.js";
import { authService } from "../src/modules/auth/auth.service.js";
import { disconnectRedis } from "../src/config/redis.js";

describe("Customer Management & CRM Module Integration Tests", () => {
  let server;
  let baseUrl;

  let tenantA;
  let branchA;
  let ownerAToken;
  let viewOnlyStaffToken;
  let noCustomersStaffToken;

  let tenantB;
  let branchB;
  let ownerBToken;

  let createdCustomerA;
  let createdAddressA;
  let customerOrderA;

  before(async () => {
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, () => {
        const address = server.address();
        baseUrl = `http://localhost:${address.port}`;
        resolve();
      });
    });

    // Setup Tenant A
    const regA = await authService.register({
      name: "Owner Customer A",
      email: `ownercustomera-${Date.now()}@test.com`,
      password: "Password123!",
      restaurantName: "Customer Rest A",
      restaurantSlug: `cust-rest-a-${Date.now()}`,
    });
    tenantA = regA.restaurant;

    branchA = await prisma.branch.findFirst({
      where: { restaurantId: tenantA.id, isMain: true },
    });

    const loginA = await authService.login({
      email: regA.employee.email,
      password: "Password123!",
      device: "Test-Runner-CustA",
      ipAddress: "127.0.0.1",
    });
    ownerAToken = loginA.accessToken;

    const passwordHash = await bcrypt.hash("Password123!", 10);

    // Staff with view only permission for Tenant A
    const viewPermission = await prisma.permission.findFirst({
      where: { key: "customers.view" },
    });

    const viewOnlyRole = await prisma.role.create({
      data: {
        restaurantId: tenantA.id,
        name: "Customer View Only Staff Role",
        description: "View customers permission only",
        permissions: {
          create: [{ restaurantId: tenantA.id, permissionId: viewPermission.id }],
        },
      },
    });

    const viewOnlyEmp = await prisma.employee.create({
      data: {
        restaurantId: tenantA.id,
        branchId: branchA.id,
        roleId: viewOnlyRole.id,
        name: "Staff View Only",
        email: `staffviewonly-${Date.now()}@test.com`,
        passwordHash,
      },
    });

    const viewOnlyLogin = await authService.login({
      email: viewOnlyEmp.email,
      password: "Password123!",
      device: "Test-Runner-ViewOnlyStaff",
      ipAddress: "127.0.0.1",
    });
    viewOnlyStaffToken = viewOnlyLogin.accessToken;

    // Staff without any customer permissions
    const noCustomerRole = await prisma.role.create({
      data: {
        restaurantId: tenantA.id,
        name: "No Customers Staff Role",
        description: "Staff without customer permissions",
      },
    });

    const noCustEmp = await prisma.employee.create({
      data: {
        restaurantId: tenantA.id,
        branchId: branchA.id,
        roleId: noCustomerRole.id,
        name: "Staff No Customers",
        email: `staffnocustomers-${Date.now()}@test.com`,
        passwordHash,
      },
    });

    const noCustLogin = await authService.login({
      email: noCustEmp.email,
      password: "Password123!",
      device: "Test-Runner-NoCustStaff",
      ipAddress: "127.0.0.1",
    });
    noCustomersStaffToken = noCustLogin.accessToken;

    // Setup Tenant B
    const regB = await authService.register({
      name: "Owner Customer B",
      email: `ownercustomerb-${Date.now()}@test.com`,
      password: "Password123!",
      restaurantName: "Customer Rest B",
      restaurantSlug: `cust-rest-b-${Date.now()}`,
    });
    tenantB = regB.restaurant;

    branchB = await prisma.branch.findFirst({
      where: { restaurantId: tenantB.id, isMain: true },
    });

    const loginB = await authService.login({
      email: regB.employee.email,
      password: "Password123!",
      device: "Test-Runner-CustB",
      ipAddress: "127.0.0.1",
    });
    ownerBToken = loginB.accessToken;
  });

  after(async () => {
    const ids = [tenantA?.id, tenantB?.id].filter(Boolean);
    if (ids.length > 0) {
      await prisma.customerAddress.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.orderStatusHistory.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.orderItem.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.order.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.customer.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.session.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.employeeBranchAccess.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.employee.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.rolePermission.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.role.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.workingHours.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.branchSettings.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.branch.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.auditLog.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.restaurant.deleteMany({ where: { id: { in: ids } } });
    }

    await new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(resolve);
    });

    await disconnectRedis();
  });

  test("1. POST /api/v1/customers creates a new customer profile (201 Created)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/customers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        firstName: "John",
        lastName: "Doe",
        phone: "+201012345678",
        notes: "VIP Customer",
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.ok(body.data.id);
    assert.equal(body.data.firstName, "John");
    assert.equal(body.data.lastName, "Doe");
    assert.equal(body.data.name, "John Doe");
    assert.equal(body.data.phone, "+201012345678");
    assert.equal(body.data.email, undefined);

    createdCustomerA = body.data;
  });

  test("1a. POST /customers supports multiple phone numbers", async () => {
    const res = await fetch(`${baseUrl}/api/v1/customers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        firstName: "Multi",
        lastName: "Phone",
        phone: "+201011110001",
        phones: ["+201011110001", "+201011110002"],
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.data.firstName, "Multi");
    assert.equal(body.data.name, "Multi Phone");
    assert.equal(body.data.phones.length, 2);
    assert.ok(body.data.phones.some((ph) => ph.isDefault));
  });

  test("2. Duplicate Phone: Creating customer with existing phone in same tenant returns 409 ConflictError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/customers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        name: "Jane Doe",
        phone: "+201012345678", // Same phone!
      }),
    });

    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error.code, "CONFLICT_ERROR");
  });

  test("3. Same phone number in Tenant B is allowed (201 Created)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/customers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerBToken}`,
      },
      body: JSON.stringify({
        name: "Tenant B Customer",
        phone: "+201012345678", // Same phone in different tenant
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
  });

  test("4. GET /api/v1/customers lists customers with search & pagination", async () => {
    const res = await fetch(`${baseUrl}/api/v1/customers?q=John`, {
      headers: {
        Authorization: `Bearer ${ownerAToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].id, createdCustomerA.id);
  });

  test("5. GET /api/v1/customers/:id returns customer profile with addresses & order count", async () => {
    const res = await fetch(`${baseUrl}/api/v1/customers/${createdCustomerA.id}`, {
      headers: {
        Authorization: `Bearer ${ownerAToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.id, createdCustomerA.id);
    assert.ok(Array.isArray(body.data.addresses));
    assert.ok(body.data._count);
  });

  test("6. PATCH /api/v1/customers/:id updates customer profile", async () => {
    const res = await fetch(`${baseUrl}/api/v1/customers/${createdCustomerA.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        firstName: "Johnathan",
        lastName: "Doe",
        notes: "Updated VIP notes",
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.firstName, "Johnathan");
    assert.equal(body.data.name, "Johnathan Doe");
    assert.equal(body.data.notes, "Updated VIP notes");
  });

  test("7. POST /api/v1/customers/:id/addresses adds a customer address (201 Created)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/customers/${createdCustomerA.id}/addresses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        label: "HOME",
        street: "123 Main St",
        city: "Cairo",
        isDefault: true,
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.ok(body.data.id);
    assert.equal(body.data.street, "123 Main St");
    assert.equal(body.data.isDefault, true);

    createdAddressA = body.data;
  });

  test("8. GET /api/v1/customers/:id/addresses lists customer addresses", async () => {
    const res = await fetch(`${baseUrl}/api/v1/customers/${createdCustomerA.id}/addresses`, {
      headers: {
        Authorization: `Bearer ${ownerAToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].id, createdAddressA.id);
  });

  test("9. PATCH /api/v1/customers/:id/addresses/:addressId updates address", async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/customers/${createdCustomerA.id}/addresses/${createdAddressA.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ownerAToken}`,
        },
        body: JSON.stringify({
          city: "New Cairo",
        }),
      }
    );

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.city, "New Cairo");
  });

  test("10. GET /api/v1/customers/:id/orders returns customer order history", async () => {
    // Create an order linked to createdCustomerA
    customerOrderA = await prisma.order.create({
      data: {
        orderNumber: 2001,
        restaurantId: tenantA.id,
        branchId: branchA.id,
        customerId: createdCustomerA.id,
        subtotal: 50.0,
        total: 50.0,
      },
    });

    const res = await fetch(`${baseUrl}/api/v1/customers/${createdCustomerA.id}/orders`, {
      headers: {
        Authorization: `Bearer ${ownerAToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].id, customerOrderA.id);
  });

  test("11. Cross-Tenant Protection: Tenant B cannot access Tenant A's customer or addresses (404 Not Found)", async () => {
    const resCustomer = await fetch(`${baseUrl}/api/v1/customers/${createdCustomerA.id}`, {
      headers: {
        Authorization: `Bearer ${ownerBToken}`, // Token B
      },
    });

    assert.equal(resCustomer.status, 404);

    const resAddress = await fetch(
      `${baseUrl}/api/v1/customers/${createdCustomerA.id}/addresses/${createdAddressA.id}`,
      {
        headers: {
          Authorization: `Bearer ${ownerBToken}`, // Token B
        },
      }
    );

    assert.equal(resAddress.status, 404);
  });

  test("12. RBAC Protection: Staff with customers.view ONLY receives 403 on POST /customers", async () => {
    const res = await fetch(`${baseUrl}/api/v1/customers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${viewOnlyStaffToken}`, // Token with customers.view ONLY
      },
      body: JSON.stringify({
        name: "Unauthorized Create",
        phone: "+201099999999",
      }),
    });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, "AUTHORIZATION_ERROR");
  });

  test("13. RBAC Protection: Staff without customer permissions receives 403 on GET /customers", async () => {
    const res = await fetch(`${baseUrl}/api/v1/customers`, {
      headers: {
        Authorization: `Bearer ${noCustomersStaffToken}`, // Token without customer permissions
      },
    });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, "AUTHORIZATION_ERROR");
  });

  test("14. DELETE /api/v1/customers/:id/addresses/:addressId soft deletes address", async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/customers/${createdCustomerA.id}/addresses/${createdAddressA.id}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${ownerAToken}`,
        },
      }
    );

    assert.equal(res.status, 200);

    const listRes = await fetch(`${baseUrl}/api/v1/customers/${createdCustomerA.id}/addresses`, {
      headers: {
        Authorization: `Bearer ${ownerAToken}`,
      },
    });

    const listBody = await listRes.json();
    assert.equal(listBody.data.length, 0); // Excluded after soft delete
  });

  test("15. DELETE /api/v1/customers/:id soft deletes customer profile", async () => {
    const res = await fetch(`${baseUrl}/api/v1/customers/${createdCustomerA.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${ownerAToken}`,
      },
    });

    assert.equal(res.status, 200);

    // Re-fetch customer — should return 404 Not Found
    const getRes = await fetch(`${baseUrl}/api/v1/customers/${createdCustomerA.id}`, {
      headers: {
        Authorization: `Bearer ${ownerAToken}`,
      },
    });

    assert.equal(getRes.status, 404);
  });

  test("16. Fix 4: Re-creating customer with soft-deleted phone returns 409 ConflictError", async () => {
    // Phone of createdCustomerA was "+201012345678" and it is now soft-deleted!
    const res = await fetch(`${baseUrl}/api/v1/customers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        name: "Reuse Soft Deleted Phone",
        phone: "+201012345678",
      }),
    });

    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error.code, "CONFLICT_ERROR");
  });

  test("17. Fix 5: Mass Assignment Protection: Injected restaurantId/id fields in body are ignored", async () => {
    const res = await fetch(`${baseUrl}/api/v1/customers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`, // Tenant A Token
      },
      body: JSON.stringify({
        name: "Mass Assignment Test",
        phone: "+201055554444",
        restaurantId: tenantB.id, // Injected Tenant B ID!
        id: "injected_custom_id_123",
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.restaurantId, tenantA.id); // Created under Tenant A!
    assert.notEqual(body.data.id, "injected_custom_id_123"); // ID generated safely!
  });

  test("18. Fix 5: 401 Unauthorized when requesting /customers without Authorization header", async () => {
    const res = await fetch(`${baseUrl}/api/v1/customers`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, "AUTHENTICATION_ERROR");
  });

  test("19. Fix 5: Cross-Tenant Order History: GET /customers/:idA/orders from Tenant B returns 404 NotFoundError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/customers/${createdCustomerA.id}/orders`, {
      headers: {
        Authorization: `Bearer ${ownerBToken}`, // Token B
      },
    });

    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error.code, "NOT_FOUND");
  });

  test("20. Fix 5: Cross-Tenant Address Actions: PATCH/DELETE on Tenant A address from Tenant B returns 404", async () => {
    // Create new customer & address for test
    const custTemp = await prisma.customer.create({
      data: {
        restaurantId: tenantA.id,
        name: "Temp Customer A",
        phone: "+201077778888",
      },
    });

    const addrTemp = await prisma.customerAddress.create({
      data: {
        restaurantId: tenantA.id,
        customerId: custTemp.id,
        street: "Temp St",
      },
    });

    // Patch attempt from Tenant B
    const patchRes = await fetch(`${baseUrl}/api/v1/customers/${custTemp.id}/addresses/${addrTemp.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerBToken}`,
      },
      body: JSON.stringify({ street: "Hacked St" }),
    });
    assert.equal(patchRes.status, 404);

    // Delete attempt from Tenant B
    const deleteRes = await fetch(`${baseUrl}/api/v1/customers/${custTemp.id}/addresses/${addrTemp.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${ownerBToken}`,
      },
    });
    assert.equal(deleteRes.status, 404);
  });

  test("21. Fix 6: Default Address Auto-Creation & Auto-Promotion on Soft-Delete", async () => {
    // 1. Create fresh customer
    const cust = await prisma.customer.create({
      data: {
        restaurantId: tenantA.id,
        name: "Auto Default Customer",
        phone: "+201066667777",
      },
    });

    // 2. First address created without specifying isDefault -> should automatically be isDefault: true
    const resAddr1 = await fetch(`${baseUrl}/api/v1/customers/${cust.id}/addresses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        label: "HOME",
        street: "First Address",
      }),
    });

    assert.equal(resAddr1.status, 201);
    const bodyAddr1 = await resAddr1.json();
    assert.equal(bodyAddr1.data.isDefault, true);

    // 3. Second address created with isDefault: true -> becomes default
    const resAddr2 = await fetch(`${baseUrl}/api/v1/customers/${cust.id}/addresses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        label: "WORK",
        street: "Second Address",
        isDefault: true,
      }),
    });

    assert.equal(resAddr2.status, 201);
    const bodyAddr2 = await resAddr2.json();
    assert.equal(bodyAddr2.data.isDefault, true);

    // 4. Soft delete second address (which is default) -> first address should be promoted to isDefault: true
    const delRes = await fetch(`${baseUrl}/api/v1/customers/${cust.id}/addresses/${bodyAddr2.data.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${ownerAToken}`,
      },
    });

    assert.equal(delRes.status, 200);

    // 5. Verify remaining address list -> Addr1 is now default!
    const listRes = await fetch(`${baseUrl}/api/v1/customers/${cust.id}/addresses`, {
      headers: {
        Authorization: `Bearer ${ownerAToken}`,
      },
    });

    const listBody = await listRes.json();
    assert.equal(listBody.data.length, 1);
    assert.equal(listBody.data[0].id, bodyAddr1.data.id);
    assert.equal(listBody.data[0].isDefault, true);
  });

  test("22. Fix B: Disabling the only default address promotes the latest remaining address", async () => {
    const custRes = await fetch(`${baseUrl}/api/v1/customers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        name: "Fix B Customer",
        phone: "+201055556666",
      }),
    });
    assert.equal(custRes.status, 201);
    const cust = (await custRes.json()).data;

    const addr1Res = await fetch(`${baseUrl}/api/v1/customers/${cust.id}/addresses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({ label: "HOME", street: "Promote St" }),
    });
    assert.equal(addr1Res.status, 201);
    const addr1 = (await addr1Res.json()).data;
    assert.equal(addr1.isDefault, true);

    const addr2Res = await fetch(`${baseUrl}/api/v1/customers/${cust.id}/addresses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({ label: "WORK", street: "Promote St 2" }),
    });
    assert.equal(addr2Res.status, 201);
    const addr2 = (await addr2Res.json()).data;
    assert.equal(addr2.isDefault, false);

    const disableRes = await fetch(`${baseUrl}/api/v1/customers/${cust.id}/addresses/${addr1.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({ isDefault: false }),
    });
    assert.equal(disableRes.status, 200);
    const disabled = (await disableRes.json()).data;
    assert.equal(disabled.isDefault, false);

    const listRes = await fetch(`${baseUrl}/api/v1/customers/${cust.id}/addresses`, {
      headers: {
        Authorization: `Bearer ${ownerAToken}`,
      },
    });
    const listBody = await listRes.json();
    const promoted = listBody.data.find((a) => a.id === addr2.id);
    assert.equal(promoted.isDefault, true);
    assert.equal(listBody.data.find((a) => a.id === addr1.id).isDefault, false);
  });

  test("23. Fix B: Sole default address cannot be un-defaulted", async () => {
    const custRes = await fetch(`${baseUrl}/api/v1/customers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({
        name: "Fix B Sole Customer",
        phone: "+201055557777",
      }),
    });
    assert.equal(custRes.status, 201);
    const cust = (await custRes.json()).data;

    const addrRes = await fetch(`${baseUrl}/api/v1/customers/${cust.id}/addresses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({ label: "HOME", street: "Sole St" }),
    });
    assert.equal(addrRes.status, 201);
    const addr = (await addrRes.json()).data;
    assert.equal(addr.isDefault, true);

    const disableRes = await fetch(`${baseUrl}/api/v1/customers/${cust.id}/addresses/${addr.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerAToken}`,
      },
      body: JSON.stringify({ isDefault: false }),
    });
    assert.equal(disableRes.status, 200);
    const disabled = (await disableRes.json()).data;
    assert.equal(disabled.isDefault, true);
  });
});
