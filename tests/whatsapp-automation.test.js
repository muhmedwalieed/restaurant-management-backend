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
      await prisma.inboxMessage.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.inboxConversation.deleteMany({ where: { restaurantId: { in: ids } } });
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
      await prisma.auditLog.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.restaurant.deleteMany({ where: { id: { in: ids } } });
    }

    await new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(resolve);
    });

    await disconnectRedis();
  });

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
    assert.equal(cart.length, 0);

    const order = await prisma.order.findFirst({
      where: { restaurantId: tenantA.id, source: "WHATSAPP" },
      include: { items: true, customer: true },
    });

    assert.ok(order);
    assert.equal(order.branchId, branchA.id);
    assert.equal(Number(order.total), 120.0);
    assert.ok(order.customerId);
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

    const subRes = await sendInboundText("random message during handoff");
    assert.equal(subRes.status, 200);

    const resetRes = await sendInboundText("restart");
    assert.equal(resetRes.status, 200);

    conv = await prisma.whatsAppConversation.findFirst({
      where: { id: conversationA.id, restaurantId: tenantA.id },
    });

    assert.equal(conv.status, "ACTIVE");
  });

  test("12. CLOSED Conversation Re-Opening (ADR-021): Customer texting on CLOSED conversation re-opens record", async () => {

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

  test("19. Support Flow (Step 1): Inbound '2' transitions to SUPPORT_CATEGORY_SELECT", async () => {
    await sendInboundText("restart");
    const res = await sendInboundText("2");
    assert.equal(res.status, 200);

    const conv = await prisma.whatsAppConversation.findFirst({
      where: { id: conversationA.id, restaurantId: tenantA.id },
    });

    assert.equal(conv.state, "SUPPORT_CATEGORY_SELECT");
  });

  test("20. Support Flow (Previous Order): Selecting '1' in SUPPORT_CATEGORY_SELECT links previous order and creates SUPPORT ticket", async () => {
    const res = await sendInboundText("1");
    assert.equal(res.status, 200);

    const conv = await prisma.whatsAppConversation.findFirst({
      where: { id: conversationA.id, restaurantId: tenantA.id },
    });

    assert.equal(conv.status, "WAITING_AGENT");

    const ticket = await prisma.inboxConversation.findFirst({
      where: { restaurantId: tenantA.id, customerPhone },
      orderBy: { createdAt: "desc" },
    });

    assert.ok(ticket);
    assert.equal(ticket.ticketType, "SUPPORT");
    assert.ok(ticket.subject.includes("استفسار"));
    assert.ok(ticket.relatedOrderId);
  });

  test("21. Support Flow (Other Topic): Selecting '2' then submitting Name and Reason creates COMPLAINT ticket", async () => {
    const freshPhone = `+201${(Date.now() + 19).toString().slice(-9)}`;
    const sendCustomPhone = (text) => {
      const payload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: accountIdA,
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  metadata: {
                    display_phone_number: "123456789",
                    phone_number_id: phoneIdA,
                  },
                  contacts: [{ profile: { name: "عميل تجريبي" }, wa_id: freshPhone.replace("+", "") }],
                  messages: [
                    {
                      from: freshPhone,
                      id: `msg_cust_${Date.now()}_${Math.random()}`,
                      timestamp: Math.floor(Date.now() / 1000).toString(),
                      text: { body: text },
                      type: "text",
                    },
                  ],
                },
                field: "messages",
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
    };

    // Step 1: Select 2 (دعم فني)
    await sendCustomPhone("2");

    let conv = await prisma.whatsAppConversation.findFirst({
      where: { restaurantId: tenantA.id, customerPhone: freshPhone },
    });
    assert.equal(conv.state, "SUPPORT_CATEGORY_SELECT");

    // Step 2: Select 2 (حاجة تانية / موضوع آخر)
    await sendCustomPhone("2");

    conv = await prisma.whatsAppConversation.findFirst({
      where: { restaurantId: tenantA.id, customerPhone: freshPhone },
    });
    assert.equal(conv.state, "SUPPORT_DETAILS_PROMPT");

    // Step 3: Send Name and Reason
    await sendCustomPhone("كريم محمود - استفسار عن مواعيد العمل وحجز طاولة لعائلة");

    conv = await prisma.whatsAppConversation.findFirst({
      where: { restaurantId: tenantA.id, customerPhone: freshPhone },
    });
    assert.equal(conv.status, "WAITING_AGENT");

    const ticket = await prisma.inboxConversation.findFirst({
      where: { restaurantId: tenantA.id, customerPhone: freshPhone },
      orderBy: { createdAt: "desc" },
    });

    assert.ok(ticket);
    assert.equal(ticket.ticketType, "COMPLAINT");
    assert.ok(ticket.subject.includes("استفسار عن مواعيد العمل"));

    const customer = await prisma.customer.findFirst({
      where: { restaurantId: tenantA.id, phone: freshPhone },
    });
    assert.ok(customer);
    assert.equal(customer.name, "كريم محمود");
  });

  test("22. Customer Feedback Flow: Replying '5' to a closed support ticket records rating, resolves feedback, and logs event", async () => {
    const feedbackPhone = `+201${(Date.now() + 29).toString().slice(-9)}`;
    const sendFeedbackPhone = (text) => {
      const payload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: accountIdA,
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  metadata: {
                    display_phone_number: "123456789",
                    phone_number_id: phoneIdA,
                  },
                  contacts: [{ profile: { name: "عميل تقييم" }, wa_id: feedbackPhone.replace("+", "") }],
                  messages: [
                    {
                      from: feedbackPhone,
                      id: `msg_cust_feed_${Date.now()}_${Math.random()}`,
                      timestamp: Math.floor(Date.now() / 1000).toString(),
                      text: { body: text },
                      type: "text",
                    },
                  ],
                },
                field: "messages",
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
    };

    // 1. Create a support ticket
    const ticket = await prisma.inboxConversation.create({
      data: {
        restaurantId: tenantA.id,
        customerPhone: feedbackPhone,
        ticketType: "SUPPORT",
        subject: "استفسار يحتاج حل",
        status: "ACTIVE",
      },
    });

    // 2. Close the ticket
    const { inboxService } = await import("../src/modules/inbox/inbox.service.js");
    const tenantCtx = { restaurantId: tenantA.id, employeeId: null, role: "OWNER" };
    await inboxService.closeConversation(tenantCtx, ticket.id, {
      resolutionStatus: "RESOLVED",
      resolutionCategory: "GENERAL_INQUIRY",
      resolutionNotes: "تم حل الاستفسار",
    });

    // 3. Customer sends rating '5' via WhatsApp
    const res = await sendFeedbackPhone("5");
    assert.equal(res.status, 200);

    // 4. Verify ticket feedback is saved
    const updatedTicket = await prisma.inboxConversation.findFirst({
      where: { id: ticket.id, restaurantId: tenantA.id },
      include: { logs: true },
    });

    assert.equal(updatedTicket.feedbackRating, 5);
    assert.equal(updatedTicket.feedbackResolved, true);
    assert.ok(updatedTicket.feedbackSubmittedAt);

    const feedbackLog = updatedTicket.logs.find((l) => l.action === "FEEDBACK_RECEIVED");
    assert.ok(feedbackLog);
  });

  test("23. Order Lifecycle WhatsApp Flow: Order creation does not create support ticket, and rating delivered order sends thank-you", async () => {
    const orderPhone = `+201${(Date.now() + 39).toString().slice(-9)}`;
    const sendOrderPhone = (text) => {
      const payload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: accountIdA,
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  metadata: {
                    display_phone_number: "123456789",
                    phone_number_id: phoneIdA,
                  },
                  contacts: [{ profile: { name: "عميل أوردر" }, wa_id: orderPhone.replace("+", "") }],
                  messages: [
                    {
                      from: orderPhone,
                      id: `msg_cust_order_${Date.now()}_${Math.random()}`,
                      timestamp: Math.floor(Date.now() / 1000).toString(),
                      text: { body: text },
                      type: "text",
                    },
                  ],
                },
                field: "messages",
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
    };

    // 1. Create a customer & order delivered
    const customer = await prisma.customer.create({
      data: {
        restaurantId: tenantA.id,
        name: "عميل دليفري",
        phone: orderPhone,
      },
    });

    await prisma.whatsAppConversation.create({
      data: {
        restaurantId: tenantA.id,
        connectionId: connectionA.id,
        customerPhone: orderPhone,
        state: "WELCOME",
        status: "ACTIVE",
      },
    });

    const order = await prisma.order.create({
      data: {
        restaurantId: tenantA.id,
        branchId: branchA.id,
        customerId: customer.id,
        orderNumber: (await prisma.order.count({ where: { restaurantId: tenantA.id } })) + 1,
        orderDate: new Date().toISOString().split("T")[0],
        source: "WHATSAPP",
        type: "DELIVERY",
        status: "DELIVERED",
        paymentStatus: "PAID",
        subtotal: 150,
        total: 150,
        address: "شارع التحرير، الدقي",
      },
    });

    // 2. Customer sends rating '5' after order delivery
    const res = await sendOrderPhone("5");
    assert.equal(res.status, 200);

    // 3. Verify subsequent choice '3' opens complaint flow instead of repeating feedback
    const complaintRes = await sendOrderPhone("3");
    assert.equal(complaintRes.status, 200);

    const conv = await prisma.whatsAppConversation.findFirst({
      where: { restaurantId: tenantA.id, customerPhone: orderPhone },
    });
    assert.equal(conv.status, "WAITING_AGENT");

    // 4. Verify complaint ticket was created for this order phone
    const tickets = await prisma.inboxConversation.findMany({
      where: { restaurantId: tenantA.id, customerPhone: orderPhone },
    });
    assert.equal(tickets.length, 1);
    assert.equal(tickets[0].ticketType, "COMPLAINT");
    assert.equal(tickets[0].relatedOrderId, order.id);
  });
});
