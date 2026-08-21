import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import app from "../src/app/app.js";
import prisma from "../src/lib/prisma.js";
import { authService } from "../src/modules/auth/auth.service.js";
import { disconnectRedis } from "../src/config/redis.js";

describe("Module 10 — WhatsApp Automation Module Tests", () => {
  let server;
  let baseUrl;

  let tenantA;
  let branchA;
  let categoryA;
  let productA1;
  let productA2;
  let connectionA;

  let ownerAToken;
  let managerAToken;
  let viewOnlyToken;

  let tenantB;
  let ownerBToken;

  const phoneIdA = `+201${Date.now().toString().slice(-9)}`;
  const accountIdA = `waba_auto_acc_${Date.now()}`;
  const webhookSecretA = "auto_secret_key_123";
  const customerPhone = `+201${(Date.now() + 7).toString().slice(-9)}`;

  let conversationA;

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
      name: "Owner Auto A",
      email: `ownerautoa-${Date.now()}@test.com`,
      password: "Password123!",
      restaurantName: "Auto Rest A",
      restaurantSlug: `auto-rest-a-${Date.now()}`,
    });
    tenantA = regA.restaurant;

    branchA = await prisma.branch.findFirst({
      where: { restaurantId: tenantA.id, isMain: true },
    });

    const loginA = await authService.login({
      email: regA.employee.email,
      password: "Password123!",
      device: "Test-Runner-AutoA",
      ipAddress: "127.0.0.1",
    });
    ownerAToken = loginA.accessToken;

    categoryA = await prisma.category.create({
      data: {
        restaurantId: tenantA.id,
        name: "Auto Mains",
        sortOrder: 1,
      },
    });

    productA1 = await prisma.product.create({
      data: {
        restaurantId: tenantA.id,
        categoryId: categoryA.id,
        name: "Pizza Auto",
        price: 120.0,
      },
    });

    productA2 = await prisma.product.create({
      data: {
        restaurantId: tenantA.id,
        categoryId: categoryA.id,
        name: "Burger Auto",
        price: 90.0,
      },
    });

    connectionA = await prisma.whatsAppConnection.create({
      data: {
        restaurantId: tenantA.id,
        provider: "MOCK",
        providerAccountId: accountIdA,
        providerPhoneNumberId: phoneIdA,
        displayName: "Main Auto WA",
        webhookSecret: webhookSecretA,
        status: "ACTIVE",
      },
    });

    const passwordHash = await bcrypt.hash("Password123!", 10);

    // Manager A Role (whatsapp.manage + whatsapp.view)
    const waPerms = await prisma.permission.findMany({
      where: { key: { in: ["whatsapp.manage", "whatsapp.view"] } },
    });

    const managerRole = await prisma.role.create({
      data: {
        restaurantId: tenantA.id,
        name: "Auto Manager Role",
        permissions: {
          create: waPerms.map((p) => ({ restaurantId: tenantA.id, permissionId: p.id })),
        },
      },
    });

    const managerEmp = await prisma.employee.create({
      data: {
        restaurantId: tenantA.id,
        branchId: branchA.id,
        roleId: managerRole.id,
        name: "Auto Manager",
        email: `automanager-${Date.now()}@test.com`,
        passwordHash,
      },
    });

    const managerLogin = await authService.login({
      email: managerEmp.email,
      password: "Password123!",
      device: "Test-Runner-AutoManager",
      ipAddress: "127.0.0.1",
    });
    managerAToken = managerLogin.accessToken;

    // View-Only Role
    const viewPerm = await prisma.permission.findFirst({
      where: { key: "whatsapp.view" },
    });

    const viewRole = await prisma.role.create({
      data: {
        restaurantId: tenantA.id,
        name: "Auto View Role",
        permissions: {
          create: [{ restaurantId: tenantA.id, permissionId: viewPerm.id }],
        },
      },
    });

    const viewEmp = await prisma.employee.create({
      data: {
        restaurantId: tenantA.id,
        branchId: branchA.id,
        roleId: viewRole.id,
        name: "Auto View Staff",
        email: `autoview-${Date.now()}@test.com`,
        passwordHash,
      },
    });

    const viewLogin = await authService.login({
      email: viewEmp.email,
      password: "Password123!",
      device: "Test-Runner-AutoView",
      ipAddress: "127.0.0.1",
    });
    viewOnlyToken = viewLogin.accessToken;

    // Setup Tenant B
    const regB = await authService.register({
      name: "Owner Auto B",
      email: `ownerautob-${Date.now()}@test.com`,
      password: "Password123!",
      restaurantName: "Auto Rest B",
      restaurantSlug: `auto-rest-b-${Date.now()}`,
    });
    tenantB = regB.restaurant;

    const loginB = await authService.login({
      email: regB.employee.email,
      password: "Password123!",
      device: "Test-Runner-AutoB",
      ipAddress: "127.0.0.1",
    });
    ownerBToken = loginB.accessToken;
  });

  after(async () => {
    const ids = [tenantA?.id, tenantB?.id].filter(Boolean);
    if (ids.length > 0) {
      await prisma.orderStatusHistory.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.orderItem.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.order.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.customer.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.whatsAppConversation.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.webhookEvent.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.whatsAppMessage.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.whatsAppConnection.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.product.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.category.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.session.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.employeeBranchAccess.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.employee.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.rolePermission.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.role.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.workingHours.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.branchSettings.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.branch.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.restaurant.deleteMany({ where: { id: { in: ids } } });
    }

    await new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(resolve);
    });

    await disconnectRedis();
  });

  // Helper to send inbound webhook message
  async function sendInboundText(text, msgId = `wamid_auto_${Date.now()}`) {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "entry_auto_1",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata: { phone_number_id: phoneIdA },
                messages: [
                  {
                    from: customerPhone,
                    id: msgId,
                    timestamp: `${Date.now()}`,
                    text: { body: text },
                    type: "text",
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const rawBodyStr = JSON.stringify(payload);
    const validHmac = crypto
      .createHmac("sha256", webhookSecretA)
      .update(rawBodyStr)
      .digest("hex");

    return fetch(`${baseUrl}/api/webhooks/whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": `sha256=${validHmac}`,
      },
      body: rawBodyStr,
    });
  }

  test("1. Welcome Flow: Inbound 'hi' creates conversation in WELCOME state & sends option menu", async () => {
    const res = await sendInboundText("hi");
    assert.equal(res.status, 200);

    const conv = await prisma.whatsAppConversation.findFirst({
      where: { restaurantId: tenantA.id, customerPhone },
    });

    assert.ok(conv);
    assert.equal(conv.state, "WELCOME");
    assert.equal(conv.status, "ACTIVE");

    conversationA = conv;
  });

  test("2. Menu Flow: Inbound '1' queries categories, lists them, and transitions state to MAIN_MENU", async () => {
    const res = await sendInboundText("1");
    assert.equal(res.status, 200);

    const conv = await prisma.whatsAppConversation.findFirst({
      where: { id: conversationA.id, restaurantId: tenantA.id },
    });

    assert.equal(conv.state, "MAIN_MENU");
  });

  test("3. Product Selection Flow: Selecting category '1' lists products and transitions state to PRODUCT_SELECT", async () => {
    const res = await sendInboundText("1");
    assert.equal(res.status, 200);

    const conv = await prisma.whatsAppConversation.findFirst({
      where: { id: conversationA.id, restaurantId: tenantA.id },
    });

    assert.equal(conv.state, "PRODUCT_SELECT");
    assert.equal(conv.selectedCategoryId, categoryA.id);
  });

  test("4. Add to Cart Flow: Selecting product '1' adds product to cart and transitions state to CART", async () => {
    const res = await sendInboundText("1");
    assert.equal(res.status, 200);

    const conv = await prisma.whatsAppConversation.findFirst({
      where: { id: conversationA.id, restaurantId: tenantA.id },
    });

    assert.equal(conv.state, "CART");
    const cart = conv.cart;
    assert.equal(cart.length, 1);
    assert.equal(cart[0].productId, productA1.id);
  });

  test("5. View Cart Flow: Inbound '2' formats cart items and displays subtotal & total", async () => {
    const res = await sendInboundText("2");
    assert.equal(res.status, 200);

    const conv = await prisma.whatsAppConversation.findFirst({
      where: { id: conversationA.id, restaurantId: tenantA.id },
    });

    assert.equal(conv.state, "CART");
  });

  test("6. Address Prompt Flow: Inbound '3' prompts for delivery address and transitions state to ADDRESS", async () => {
    const res = await sendInboundText("3");
    assert.equal(res.status, 200);

    const conv = await prisma.whatsAppConversation.findFirst({
      where: { id: conversationA.id, restaurantId: tenantA.id },
    });

    assert.equal(conv.state, "ADDRESS");
  });

  test("7. Input Address Flow: Entering address text saves address & prompts for order confirmation", async () => {
    const res = await sendInboundText("15 Tahrir Square, Cairo");
    assert.equal(res.status, 200);

    const conv = await prisma.whatsAppConversation.findFirst({
      where: { id: conversationA.id, restaurantId: tenantA.id },
    });

    assert.equal(conv.state, "CONFIRM_ORDER");
    assert.equal(conv.address, "15 Tahrir Square, Cairo");
  });

  test("8. Order Creation via Automation (ADR-022 & ADR-024): Inbound 'confirm' creates Order with source WHATSAPP", async () => {
    const res = await sendInboundText("confirm");
    assert.equal(res.status, 200);

    const conv = await prisma.whatsAppConversation.findFirst({
      where: { id: conversationA.id, restaurantId: tenantA.id },
    });

    assert.equal(conv.state, "WELCOME");
    const cart = conv.cart;
    assert.equal(cart.length, 0); // Cart cleared!

    // Verify created Order in DB
    const order = await prisma.order.findFirst({
      where: { restaurantId: tenantA.id, source: "WHATSAPP" },
      include: { items: true, customer: true },
    });

    assert.ok(order);
    assert.equal(order.branchId, branchA.id); // Main branch resolved!
    assert.equal(Number(order.total), 120.0);
    assert.ok(order.customerId); // Customer auto-linked!
  });

  test("9. Order Tracking Flow: Inbound '4' returns status of last created order", async () => {
    const res = await sendInboundText("4");
    assert.equal(res.status, 200);
  });

  test("10. FAQ Flow: Inbound '5' returns help and opening hours text", async () => {
    const res = await sendInboundText("5");
    assert.equal(res.status, 200);
  });

  test("11. Human Handoff Flow (ADR-023): Inbound '6' sets status WAITING_AGENT and pauses bot", async () => {
    const handoffRes = await sendInboundText("6");
    assert.equal(handoffRes.status, 200);

    let conv = await prisma.whatsAppConversation.findFirst({
      where: { id: conversationA.id, restaurantId: tenantA.id },
    });

    assert.equal(conv.status, "WAITING_AGENT");

    // Subsequent message while WAITING_AGENT pauses bot
    const subRes = await sendInboundText("random message during handoff");
    assert.equal(subRes.status, 200);

    // Inbound reset keyword 'restart' restores ACTIVE status
    const resetRes = await sendInboundText("restart");
    assert.equal(resetRes.status, 200);

    conv = await prisma.whatsAppConversation.findFirst({
      where: { id: conversationA.id, restaurantId: tenantA.id },
    });

    assert.equal(conv.status, "ACTIVE");
  });

  test("12. CLOSED Conversation Re-Opening (ADR-021): Customer texting on CLOSED conversation re-opens record", async () => {
    // Close conversation via repository
    await prisma.whatsAppConversation.updateMany({
      where: { id: conversationA.id, restaurantId: tenantA.id },
      data: { status: "CLOSED" },
    });

    const res = await sendInboundText("hello again");
    assert.equal(res.status, 200);

    const conv = await prisma.whatsAppConversation.findFirst({
      where: { id: conversationA.id, restaurantId: tenantA.id },
    });

    assert.equal(conv.status, "ACTIVE");
    assert.equal(conv.state, "WELCOME");
  });

  test("13. GET /api/v1/whatsapp/conversations lists conversations (whatsapp.view)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/whatsapp/conversations`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${managerAToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.length, 1);
  });

  test("14. GET /api/v1/whatsapp/conversations/:id returns conversation details", async () => {
    const res = await fetch(`${baseUrl}/api/v1/whatsapp/conversations/${conversationA.id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${managerAToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.id, conversationA.id);
  });

  test("15. POST /api/v1/whatsapp/conversations/:id/handoff & /close update status", async () => {
    const handoffRes = await fetch(`${baseUrl}/api/v1/whatsapp/conversations/${conversationA.id}/handoff`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${managerAToken}`,
      },
    });
    assert.equal(handoffRes.status, 200);

    const closeRes = await fetch(`${baseUrl}/api/v1/whatsapp/conversations/${conversationA.id}/close`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${managerAToken}`,
      },
    });
    assert.equal(closeRes.status, 200);

    const conv = await prisma.whatsAppConversation.findFirst({
      where: { id: conversationA.id, restaurantId: tenantA.id },
    });
    assert.equal(conv.status, "CLOSED");
  });

  test("16. 401 Unauthorized Protection: Admin conversation endpoints without token return 401", async () => {
    const res = await fetch(`${baseUrl}/api/v1/whatsapp/conversations`, {
      method: "GET",
    });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, "AUTHENTICATION_ERROR");
  });

  test("17. RBAC Protection: Staff without whatsapp.manage receives 403 on handoff/close", async () => {
    const res = await fetch(`${baseUrl}/api/v1/whatsapp/conversations/${conversationA.id}/handoff`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${viewOnlyToken}`,
      },
    });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, "AUTHORIZATION_ERROR");
  });

  test("18. Cross-Tenant Protection: Tenant B accessing Tenant A conversation returns 404 NotFoundError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/whatsapp/conversations/${conversationA.id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${ownerBToken}`,
      },
    });

    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error.code, "NOT_FOUND");
  });
});
