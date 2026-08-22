import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import bcrypt from "bcrypt";
import app from "../src/app/app.js";
import prisma from "../src/lib/prisma.js";
import { authService } from "../src/modules/auth/auth.service.js";
import { inboxService } from "../src/modules/inbox/inbox.service.js";
import { disconnectRedis } from "../src/config/redis.js";

describe("Module 11 — Unified Inbox / Support Integration Tests", () => {
  let server;
  let baseUrl;
  let tenantA;
  let branchA;
  let agentToken;
  let noChatsToken;
  let ownerToken;
  let ownerId;
  let ownerBToken;
  let waConversation;
  let inboxConv;
  let agentId;

  before(async () => {
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, () => {
        const address = server.address();
        baseUrl = `http://localhost:${address.port}`;
        resolve();
      });
    });

    const uniq = Date.now();
    const regA = await authService.register({
      name: "Owner Inbox A",
      email: `inboxa-${uniq}@test.com`,
      password: "Password123!",
      restaurantName: "Inbox Rest A",
      restaurantSlug: `inbox-a-${uniq}`,
    });
    tenantA = regA.restaurant;
    ownerId = regA.employee.id;
    branchA = await prisma.branch.findFirst({ where: { restaurantId: tenantA.id, isMain: true } });

    const loginA = await authService.login({ email: regA.employee.email, password: "Password123!", device: "A", ipAddress: "127.0.0.1" });
    ownerToken = loginA.accessToken;

    const passwordHash = await bcrypt.hash("Password123!", 10);

    const waConn = await prisma.whatsAppConnection.create({
      data: {
        restaurantId: tenantA.id,
        provider: "MOCK",
        providerAccountId: `waba_${uniq}`,
        providerPhoneNumberId: `+201${uniq.toString().slice(-9)}`,
        webhookSecret: "secret_inbox_1234567890",
      },
    });

    waConversation = await prisma.whatsAppConversation.create({
      data: {
        restaurantId: tenantA.id,
        connectionId: waConn.id,
        customerPhone: "+201055551111",
        state: "WELCOME",
        status: "WAITING_AGENT",
      },
    });

    const chatPerms = await prisma.permission.findMany({
      where: { key: { in: ["chats.view", "chats.reply", "chats.assign", "chats.close"] } },
    });
    const agentRole = await prisma.role.create({
      data: {
        restaurantId: tenantA.id,
        name: "Support Agent",
        permissions: { create: chatPerms.map((p) => ({ restaurantId: tenantA.id, permissionId: p.id })) },
      },
    });
    const agentEmp = await prisma.employee.create({
      data: { restaurantId: tenantA.id, branchId: branchA.id, roleId: agentRole.id, name: "Agent", email: `agent-${uniq}@test.com`, passwordHash },
    });
    agentId = agentEmp.id;
    const agentLogin = await authService.login({ email: agentEmp.email, password: "Password123!", device: "Agent", ipAddress: "127.0.0.1" });
    agentToken = agentLogin.accessToken;

    const noChatsRole = await prisma.role.create({ data: { restaurantId: tenantA.id, name: "No Chats" } });
    const noChatsEmp = await prisma.employee.create({
      data: { restaurantId: tenantA.id, branchId: branchA.id, roleId: noChatsRole.id, name: "No Chats", email: `nochats-${uniq}@test.com`, passwordHash },
    });
    const noChatsLogin = await authService.login({ email: noChatsEmp.email, password: "Password123!", device: "NoChats", ipAddress: "127.0.0.1" });
    noChatsToken = noChatsLogin.accessToken;

    const regB = await authService.register({
      name: "Owner Inbox B",
      email: `inboxb-${uniq}@test.com`,
      password: "Password123!",
      restaurantName: "Inbox Rest B",
      restaurantSlug: `inbox-b-${uniq}`,
    });
    const loginB = await authService.login({ email: regB.employee.email, password: "Password123!", device: "B", ipAddress: "127.0.0.1" });
    ownerBToken = loginB.accessToken;

    inboxConv = await inboxService.createFromWhatsApp({ restaurantId: tenantA.id }, waConversation, waConversation.customerPhone);
  });

  after(async () => {
    const ids = [tenantA?.id].filter(Boolean);
    if (ids.length > 0) {
      await prisma.inboxMessage.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.inboxConversation.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.whatsAppConversation.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.whatsAppMessage.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.whatsAppConnection.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.webhookEvent.deleteMany({ where: { restaurantId: { in: ids } } });
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

  test("1. Handoff hook creates inbox conversation (status WAITING + link)", async () => {
    assert.ok(inboxConv.id);
    assert.equal(inboxConv.status, "WAITING");
    assert.equal(inboxConv.whatsappConversationId, waConversation.id);
  });

  test("2. GET /api/v1/inbox/conversations lists the queue", async () => {
    const res = await fetch(`${baseUrl}/api/v1/inbox/conversations`, { headers: { Authorization: `Bearer ${agentToken}` } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.data.some((c) => c.id === inboxConv.id));
  });

  test("3. GET /api/v1/inbox/conversations/:id returns detail with messages", async () => {
    const res = await fetch(`${baseUrl}/api/v1/inbox/conversations/${inboxConv.id}`, { headers: { Authorization: `Bearer ${agentToken}` } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.id, inboxConv.id);
    assert.ok(Array.isArray(body.data.messages));
  });

  test("4. POST /:id/assign assigns agent (status ACTIVE)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/inbox/conversations/${inboxConv.id}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${agentToken}` },
      body: JSON.stringify({ agentId }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.assignedAgentId, agentId);
    assert.equal(body.data.status, "ACTIVE");
  });

  test("5. POST /:id/reply sends WhatsApp + records AGENT message", async () => {
    const res = await fetch(`${baseUrl}/api/v1/inbox/conversations/${inboxConv.id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${agentToken}` },
      body: JSON.stringify({ content: "أهلاً بك! كيف نقدر نساعدك؟" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    const agentMsg = body.data.messages.find((m) => m.content === "أهلاً بك! كيف نقدر نساعدك؟");
    assert.ok(agentMsg);
    assert.equal(agentMsg.senderType, "AGENT");
    assert.equal(agentMsg.isInternal, false);

    const outbound = await prisma.whatsAppMessage.count({ where: { restaurantId: tenantA.id, direction: "OUTBOUND" } });
    assert.ok(outbound >= 1);
  });

  test("6. POST /:id/note adds internal note WITHOUT sending to customer", async () => {
    const before = await prisma.whatsAppMessage.count({ where: { restaurantId: tenantA.id, direction: "OUTBOUND" } });
    const res = await fetch(`${baseUrl}/api/v1/inbox/conversations/${inboxConv.id}/note`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${agentToken}` },
      body: JSON.stringify({ content: "عميل VIP — يفضل الاتصال مساءً" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    const note = body.data.messages.find((m) => m.content === "عميل VIP — يفضل الاتصال مساءً");
    assert.ok(note);
    assert.equal(note.isInternal, true);

    const after = await prisma.whatsAppMessage.count({ where: { restaurantId: tenantA.id, direction: "OUTBOUND" } });
    assert.equal(after, before); // Internal note NOT sent to customer
  });

  test("7. recordCustomerMessage captures CUSTOMER inbound as PENDING", async () => {
    const conv = await inboxService.recordCustomerMessage({ restaurantId: tenantA.id }, waConversation.id, waConversation.customerPhone, "باقي كم ثمن الوجبة؟");
    assert.equal(conv.status, "PENDING");
    const msg = await prisma.inboxMessage.findFirst({ where: { restaurantId: tenantA.id, conversationId: inboxConv.id, content: "باقي كم ثمن الوجبة؟" } });
    assert.ok(msg);
    assert.equal(msg.senderType, "CUSTOMER");
    assert.equal(msg.isInternal, false);
  });

  test("8. POST /:id/resolve marks RESOLVED", async () => {
    const res = await fetch(`${baseUrl}/api/v1/inbox/conversations/${inboxConv.id}/resolve`, { method: "POST", headers: { Authorization: `Bearer ${agentToken}` } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.status, "RESOLVED");
  });

  test("9. POST /:id/close marks CLOSED", async () => {
    const res = await fetch(`${baseUrl}/api/v1/inbox/conversations/${inboxConv.id}/close`, { method: "POST", headers: { Authorization: `Bearer ${agentToken}` } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.status, "CLOSED");
  });

  test("10. Cross-Tenant: Tenant B cannot access Tenant A conversation (404)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/inbox/conversations/${inboxConv.id}`, { headers: { Authorization: `Bearer ${ownerBToken}` } });
    assert.equal(res.status, 404);
  });

  test("11. RBAC: without chats.view -> 403", async () => {
    const res = await fetch(`${baseUrl}/api/v1/inbox/conversations`, { headers: { Authorization: `Bearer ${noChatsToken}` } });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, "AUTHORIZATION_ERROR");
  });

  test("12. RBAC: without chats.reply -> 403 on reply", async () => {
    const res = await fetch(`${baseUrl}/api/v1/inbox/conversations/${inboxConv.id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${noChatsToken}` },
      body: JSON.stringify({ content: "غير مصرح" }),
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, "AUTHORIZATION_ERROR");
  });

  // ==================== MODULE 12 — MANAGER TAKEOVER ====================

  test("13. Takeover: manager locks the conversation on themselves", async () => {
    // Use the owner (manager) token — owner has chats.takeover via bypass
    const res = await fetch(`${baseUrl}/api/v1/inbox/conversations/${inboxConv.id}/takeover`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.lockedById, ownerId);
    assert.ok(body.data.lockedAt);
  });

  test("14. Locked conversation: the assigned agent cannot reply (422)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/inbox/conversations/${inboxConv.id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${agentToken}` },
      body: JSON.stringify({ content: "محاولة رد من الوكيل وهو مقفول" }),
    });
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error.code, "BUSINESS_RULE_ERROR");
  });

  test("15. Locked conversation: the manager who took over can still reply (200)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/inbox/conversations/${inboxConv.id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ content: "رد المدير بعد الـTakeover" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    const msg = body.data.messages.find((m) => m.content === "رد المدير بعد الـTakeover");
    assert.ok(msg);
    assert.equal(msg.isInternal, false);
  });

  test("16. Return to Agent clears the lock", async () => {
    const res = await fetch(`${baseUrl}/api/v1/inbox/conversations/${inboxConv.id}/return`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.lockedById, null);
  });

  test("17. Agent can reply again after lock is cleared (200)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/inbox/conversations/${inboxConv.id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${agentToken}` },
      body: JSON.stringify({ content: "الوكيل رجع يرد" }),
    });
    assert.equal(res.status, 200);
  });

  test("18. Reassign moves the conversation to another agent", async () => {
    const res = await fetch(`${baseUrl}/api/v1/inbox/conversations/${inboxConv.id}/reassign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ agentId: ownerId }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.assignedAgentId, ownerId);
  });

  test("19. Reassign without agentId -> 400 validation", async () => {
    const res = await fetch(`${baseUrl}/api/v1/inbox/conversations/${inboxConv.id}/reassign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, "VALIDATION_ERROR");
  });

  test("20. Cross-Tenant: Tenant B takeover on Tenant A conversation -> 404", async () => {
    const res = await fetch(`${baseUrl}/api/v1/inbox/conversations/${inboxConv.id}/takeover`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerBToken}` },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 404);
  });
});
