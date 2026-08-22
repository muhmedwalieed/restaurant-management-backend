import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import app from "../src/app/app.js";
import prisma from "../src/lib/prisma.js";
import { authService } from "../src/modules/auth/auth.service.js";
import { MockProvider } from "../src/modules/whatsapp/providers/mock_provider.js";
import { disconnectRedis } from "../src/config/redis.js";

describe("Module 9 — WhatsApp Integration Module Tests", () => {
  let server;
  let baseUrl;

  let tenantA;
  let ownerAToken;
  let managerAToken;
  let viewOnlyToken;

  let tenantB;
  let ownerBToken;

  const phoneIdA = `+201${Date.now().toString().slice(-9)}`;
  const accountIdA = `waba_acc_${Date.now()}`;
  const webhookSecretA = "secret_key_tenant_a_123";

  let connectionA;
  let outboundMsgA;

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
      name: "Owner WA A",
      email: `ownerwaa-${Date.now()}@test.com`,
      password: "Password123!",
      restaurantName: "WA Rest A",
      restaurantSlug: `wa-rest-a-${Date.now()}`,
    });
    tenantA = regA.restaurant;

    const loginA = await authService.login({
      email: regA.employee.email,
      password: "Password123!",
      device: "Test-Runner-WAA",
      ipAddress: "127.0.0.1",
    });
    ownerAToken = loginA.accessToken;

    const branchA = await prisma.branch.findFirst({
      where: { restaurantId: tenantA.id, isMain: true },
    });

    const passwordHash = await bcrypt.hash("Password123!", 10);

    // Manager A Role (whatsapp.manage + whatsapp.view)
    const waPerms = await prisma.permission.findMany({
      where: { key: { in: ["whatsapp.manage", "whatsapp.view"] } },
    });

    const managerRole = await prisma.role.create({
      data: {
        restaurantId: tenantA.id,
        name: "WA Manager Role",
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
        name: "WA Manager",
        email: `wamanager-${Date.now()}@test.com`,
        passwordHash,
      },
    });

    const managerLogin = await authService.login({
      email: managerEmp.email,
      password: "Password123!",
      device: "Test-Runner-WAManager",
      ipAddress: "127.0.0.1",
    });
    managerAToken = managerLogin.accessToken;

    // View-Only Role (whatsapp.view only)
    const viewPerm = await prisma.permission.findFirst({
      where: { key: "whatsapp.view" },
    });

    const viewRole = await prisma.role.create({
      data: {
        restaurantId: tenantA.id,
        name: "WA View Role",
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
        name: "WA View Staff",
        email: `waview-${Date.now()}@test.com`,
        passwordHash,
      },
    });

    const viewLogin = await authService.login({
      email: viewEmp.email,
      password: "Password123!",
      device: "Test-Runner-WAView",
      ipAddress: "127.0.0.1",
    });
    viewOnlyToken = viewLogin.accessToken;

    // Setup Tenant B
    const regB = await authService.register({
      name: "Owner WA B",
      email: `ownerwab-${Date.now()}@test.com`,
      password: "Password123!",
      restaurantName: "WA Rest B",
      restaurantSlug: `wa-rest-b-${Date.now()}`,
    });
    tenantB = regB.restaurant;

    const loginB = await authService.login({
      email: regB.employee.email,
      password: "Password123!",
      device: "Test-Runner-WAB",
      ipAddress: "127.0.0.1",
    });
    ownerBToken = loginB.accessToken;
  });

  after(async () => {
    MockProvider.setSimulateOutage(false);

    const ids = [tenantA?.id, tenantB?.id].filter(Boolean);
    if (ids.length > 0) {
      await prisma.inboxMessage.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.inboxConversation.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.webhookEvent.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.whatsAppMessage.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.whatsAppConversation.deleteMany({ where: { restaurantId: { in: ids } } });
      await prisma.whatsAppConnection.deleteMany({ where: { restaurantId: { in: ids } } });
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

  test("1. POST /api/v1/whatsapp/connection connects WhatsApp account (201 Created)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/whatsapp/connection`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerAToken}`,
      },
      body: JSON.stringify({
        provider: "MOCK",
        providerAccountId: accountIdA,
        providerPhoneNumberId: phoneIdA,
        displayName: "Main Branch WA",
        webhookSecret: webhookSecretA,
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.providerAccountId, accountIdA);
    assert.equal(body.data.providerPhoneNumberId, phoneIdA);
    assert.equal(body.data.status, "ACTIVE");

    connectionA = body.data;
  });

  test("2. Duplicate providerAccountId under same tenant returns 409 ConflictError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/whatsapp/connection`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerAToken}`,
      },
      body: JSON.stringify({
        providerAccountId: accountIdA, // Duplicate!
        providerPhoneNumberId: phoneIdA,
      }),
    });

    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error.code, "CONFLICT_ERROR");
  });

  test("3. GET /api/v1/whatsapp/connection returns active connection details", async () => {
    const res = await fetch(`${baseUrl}/api/v1/whatsapp/connection`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${managerAToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.id, connectionA.id);
  });

  test("4. PATCH /api/v1/whatsapp/connection updates connection settings", async () => {
    const res = await fetch(`${baseUrl}/api/v1/whatsapp/connection`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerAToken}`,
      },
      body: JSON.stringify({
        displayName: "Updated Branch WA",
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.displayName, "Updated Branch WA");
  });

  test("5. POST /api/v1/whatsapp/messages sends outgoing WhatsApp message (201 Created)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/whatsapp/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerAToken}`,
      },
      body: JSON.stringify({
        to: "+201099998888",
        text: "Hello from Restaurant POS!",
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.direction, "OUTBOUND");
    assert.equal(body.data.status, "SENT");
    assert.ok(body.data.providerMessageId);

    outboundMsgA = body.data;
  });

  test("6. Provider Outage Simulation: Outage flag returns 502 ExternalServiceError and marks message FAILED", async () => {
    MockProvider.setSimulateOutage(true);

    const res = await fetch(`${baseUrl}/api/v1/whatsapp/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerAToken}`,
      },
      body: JSON.stringify({
        to: "+201099998888",
        text: "Testing outage failure",
      }),
    });

    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.error.code, "EXTERNAL_SERVICE_ERROR");

    MockProvider.setSimulateOutage(false);
  });

  test("7. Soft Deactivation FK Protection (ADR-017): DELETE /connection deactivates status to DISCONNECTED without FK error", async () => {
    const res = await fetch(`${baseUrl}/api/v1/whatsapp/connection`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${managerAToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);

    const connInDb = await prisma.whatsAppConnection.findFirst({
      where: { id: connectionA.id, restaurantId: tenantA.id },
    });
    assert.equal(connInDb.status, "DISCONNECTED");
  });

  test("8. Sending message on DISCONNECTED account returns 422 BusinessRuleError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/whatsapp/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerAToken}`,
      },
      body: JSON.stringify({
        to: "+201099998888",
        text: "Should fail on disconnected account",
      }),
    });

    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error.code, "BUSINESS_RULE_ERROR");
  });

  test("9. Single Active Connection Policy: Re-connecting or PATCH status ACTIVE activates connection", async () => {
    const patchRes = await fetch(`${baseUrl}/api/v1/whatsapp/connection`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerAToken}`,
      },
      body: JSON.stringify({
        status: "ACTIVE",
      }),
    });

    assert.equal(patchRes.status, 200);

    const connInDb = await prisma.whatsAppConnection.findFirst({
      where: { id: connectionA.id, restaurantId: tenantA.id },
    });
    assert.equal(connInDb.status, "ACTIVE");
  });

  test("10. 401 Unauthorized Protection: Admin endpoints without token return 401 AuthenticationError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/whatsapp/connection`, {
      method: "GET",
    });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, "AUTHENTICATION_ERROR");
  });

  test("11. RBAC Protection: Staff without whatsapp.manage receives 403 AuthorizationError on POST /messages", async () => {
    const res = await fetch(`${baseUrl}/api/v1/whatsapp/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${viewOnlyToken}`,
      },
      body: JSON.stringify({
        to: "+201099998888",
        text: "Unauthorized send attempt",
      }),
    });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, "AUTHORIZATION_ERROR");
  });

  test("12. Cross-Tenant Protection: Tenant B accessing Tenant A connection returns 404 NotFoundError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/whatsapp/connection`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${ownerBToken}`,
      },
    });

    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error.code, "NOT_FOUND");
  });

  test("13. Public Webhook HMAC Verification (POST /api/webhooks/whatsapp) processes INBOUND message", async () => {
    const webhookPayload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba_entry_1",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  phone_number_id: phoneIdA,
                },
                messages: [
                  {
                    from: "+201055554444",
                    id: "wamid_inbound_1001",
                    timestamp: `${Date.now()}`,
                    text: { body: "I would like to ask about opening hours" },
                    type: "text",
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const rawBodyStr = JSON.stringify(webhookPayload);
    const validHmac = crypto
      .createHmac("sha256", webhookSecretA)
      .update(rawBodyStr)
      .digest("hex");

    const res = await fetch(`${baseUrl}/api/webhooks/whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": `sha256=${validHmac}`,
      },
      body: rawBodyStr,
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);

    const savedMsg = await prisma.whatsAppMessage.findFirst({
      where: {
        restaurantId: tenantA.id,
        providerMessageId: "wamid_inbound_1001",
      },
    });

    assert.ok(savedMsg);
    assert.equal(savedMsg.direction, "INBOUND");
    assert.equal(savedMsg.content, "I would like to ask about opening hours");
  });

  test("14. Public Webhook Invalid HMAC Signature returns 401 AuthenticationError", async () => {
    const webhookPayload = {
      entry: [{ changes: [{ value: { metadata: { phone_number_id: phoneIdA } } }] }],
    };

    const res = await fetch(`${baseUrl}/api/webhooks/whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": "sha256=invalid_hmac_signature",
      },
      body: JSON.stringify(webhookPayload),
    });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, "AUTHENTICATION_ERROR");
  });

  test("15. Replay Protection / Idempotency Check: Duplicate eventId returns 200 OK without duplicate message", async () => {
    const webhookPayload = {
      eventId: "evt_idempotent_test_1001",
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: phoneIdA },
                messages: [
                  {
                    from: "+201077776666",
                    id: "wamid_idempotent_msg_1001",
                    text: { body: "Idempotent test message" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const rawBodyStr = JSON.stringify(webhookPayload);
    const validHmac = crypto
      .createHmac("sha256", webhookSecretA)
      .update(rawBodyStr)
      .digest("hex");

    // First request
    const res1 = await fetch(`${baseUrl}/api/webhooks/whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": `sha256=${validHmac}`,
      },
      body: rawBodyStr,
    });
    assert.equal(res1.status, 200);

    // Second request (Duplicate replay attempt)
    const res2 = await fetch(`${baseUrl}/api/webhooks/whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": `sha256=${validHmac}`,
      },
      body: rawBodyStr,
    });
    assert.equal(res2.status, 200);
    const body2 = await res2.json();
    assert.equal(body2.isDuplicate, true);

    const count = await prisma.whatsAppMessage.count({
      where: { restaurantId: tenantA.id, providerMessageId: "wamid_idempotent_msg_1001" },
    });
    assert.equal(count, 1); // Only 1 message saved!
  });

  test("16. Delivery Status Webhook Updates: Update target message status to READ", async () => {
    const webhookPayload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: phoneIdA },
                statuses: [
                  {
                    id: outboundMsgA.providerMessageId,
                    status: "read",
                    timestamp: `${Date.now()}`,
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const rawBodyStr = JSON.stringify(webhookPayload);
    const validHmac = crypto
      .createHmac("sha256", webhookSecretA)
      .update(rawBodyStr)
      .digest("hex");

    const res = await fetch(`${baseUrl}/api/webhooks/whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": `sha256=${validHmac}`,
      },
      body: rawBodyStr,
    });

    assert.equal(res.status, 200);

    const updatedMsg = await prisma.whatsAppMessage.findFirst({
      where: { id: outboundMsgA.id, restaurantId: tenantA.id },
    });
    assert.equal(updatedMsg.status, "READ");
  });

  test("17. Webhook Retry Pipeline: POST /api/v1/whatsapp/webhooks/retry processes FAILED events", async () => {
    // Manually insert a FAILED WebhookEvent
    const failedEventPayload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: "+201088889999",
                    id: "wamid_retry_msg_1001",
                    text: { body: "Retry message test" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    await prisma.webhookEvent.create({
      data: {
        restaurantId: tenantA.id,
        eventId: "evt_failed_1001",
        provider: "MOCK",
        rawPayload: failedEventPayload,
        status: "FAILED",
        attempts: 1,
        lastError: "Simulated processing timeout",
      },
    });

    const res = await fetch(`${baseUrl}/api/v1/whatsapp/webhooks/retry`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${managerAToken}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.retriedCount, 1);

    const eventInDb = await prisma.webhookEvent.findFirst({
      where: { restaurantId: tenantA.id, eventId: "evt_failed_1001" },
    });
    assert.equal(eventInDb.status, "PROCESSED");
  });

  test("18. GET /api/webhooks/whatsapp verification handshake (hub.mode=subscribe)", async () => {
    const challengeStr = "challenge_token_123456";
    const res = await fetch(
      `${baseUrl}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=default_verify_token&hub.challenge=${challengeStr}`
    );

    assert.equal(res.status, 200);
    const text = await res.text();
    assert.equal(text, challengeStr);
  });

  test("19. Reconnecting a previously disconnected account returns 409 ConflictError (not 500)", async () => {
    // Disconnect (soft deactivation)
    const disconnectRes = await fetch(`${baseUrl}/api/v1/whatsapp/connection`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${managerAToken}`,
      },
    });
    assert.equal(disconnectRes.status, 200);

    // Re-POST same providerAccountId while a DISCONNECTED row exists
    const reconnectRes = await fetch(`${baseUrl}/api/v1/whatsapp/connection`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerAToken}`,
      },
      body: JSON.stringify({
        providerAccountId: accountIdA,
        providerPhoneNumberId: phoneIdA,
      }),
    });

    assert.equal(reconnectRes.status, 409);
    const body = await reconnectRes.json();
    assert.equal(body.error.code, "CONFLICT_ERROR");

    // Restore ACTIVE for any subsequent state assumptions
    const restoreRes = await fetch(`${baseUrl}/api/v1/whatsapp/connection`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerAToken}`,
      },
      body: JSON.stringify({ status: "ACTIVE" }),
    });
    assert.equal(restoreRes.status, 200);
  });

  test("20. Cross-Tenant Phone Collision: Tenant B connecting Tenant A's active phone returns 409 ConflictError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/whatsapp/connection`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerBToken}`, // Token B!
      },
      body: JSON.stringify({
        providerAccountId: "waba_acc_tenant_b_999",
        providerPhoneNumberId: phoneIdA, // Already active under Tenant A!
      }),
    });

    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error.code, "CONFLICT_ERROR");
  });

  test("21. Inbound duplicate providerMessageId does not create a duplicate message (retry safety)", async () => {
    // wamid_inbound_1001 already exists from Test 13
    const webhookPayload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: phoneIdA },
                messages: [
                  {
                    from: "+201055554444",
                    id: "wamid_inbound_1001", // Existing message id!
                    text: { body: "Duplicate inbound body" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const rawBodyStr = JSON.stringify(webhookPayload);
    const validHmac = crypto
      .createHmac("sha256", webhookSecretA)
      .update(rawBodyStr)
      .digest("hex");

    const res = await fetch(`${baseUrl}/api/webhooks/whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": `sha256=${validHmac}`,
      },
      body: rawBodyStr,
    });

    assert.equal(res.status, 200);

    const count = await prisma.whatsAppMessage.count({
      where: { restaurantId: tenantA.id, providerMessageId: "wamid_inbound_1001" },
    });
    assert.equal(count, 1); // No duplicate!
  });
});
