import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import app from "../src/app/app.js";
import prisma from "../src/lib/prisma.js";
import redis, { disconnectRedis } from "../src/config/redis.js";
import { authService } from "../src/modules/auth/auth.service.js";
import { renderTemplate } from "../src/modules/templates/template.engine.js";
import { templateService } from "../src/modules/templates/template.service.js";
import { parseFeedbackRating, isExplicitFeedbackText } from "../src/modules/whatsapp-automation/feedback.parser.js";
import { invalidateEmployeePermissions } from "../src/modules/auth/authorize.middleware.js";

describe("Templates & Softcoding Engine Integration Tests", () => {
  let server;
  let baseUrl;
  let restaurantA;
  let restaurantB;
  let tokenA;
  let tokenB;

  before(async () => {
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, () => {
        const address = server.address();
        baseUrl = `http://localhost:${address.port}`;
        resolve();
      });
    });

    // Register Tenant A
    const regA = await authService.register({
      name: "Owner A",
      email: `owner-templ-a-${Date.now()}@test.com`,
      password: "Password123!",
      restaurantName: "Template Test Rest A",
      restaurantSlug: `templ-rest-a-${Date.now()}`,
    });
    restaurantA = regA.restaurant;

    const loginA = await authService.login({
      email: regA.employee.email,
      password: "Password123!",
      device: "Test-Runner-Templ",
      ipAddress: "127.0.0.1",
    });
    tokenA = loginA.accessToken;

    // Register Tenant B
    const regB = await authService.register({
      name: "Owner B",
      email: `owner-templ-b-${Date.now()}@test.com`,
      password: "Password123!",
      restaurantName: "Template Test Rest B",
      restaurantSlug: `templ-rest-b-${Date.now()}`,
    });
    restaurantB = regB.restaurant;

    const loginB = await authService.login({
      email: regB.employee.email,
      password: "Password123!",
      device: "Test-Runner-Templ",
      ipAddress: "127.0.0.1",
    });
    tokenB = loginB.accessToken;
  });

  after(async () => {
    for (const r of [restaurantA, restaurantB]) {
      if (r?.id) {
        await prisma.session.deleteMany({ where: { restaurantId: r.id } });
        await prisma.employeeBranchAccess.deleteMany({ where: { restaurantId: r.id } });
        await prisma.employee.deleteMany({ where: { restaurantId: r.id } });
        await prisma.rolePermission.deleteMany({ where: { restaurantId: r.id } });
        await prisma.role.deleteMany({ where: { restaurantId: r.id } });
        await prisma.workingHours.deleteMany({ where: { restaurantId: r.id } });
        await prisma.branchSettings.deleteMany({ where: { restaurantId: r.id } });
        await prisma.branch.deleteMany({ where: { restaurantId: r.id } });
        await prisma.auditLog.deleteMany({ where: { restaurantId: r.id } });
        await prisma.restaurant.deleteMany({ where: { id: r.id } });
      }
    }

    await new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(resolve);
    });

    await disconnectRedis();
  });

  // 1. Template Engine Unit Tests
  test("1. Template Engine: Interpolates variables and handles missing variables safely", () => {
    const raw = "Hello {{customerName}}, your order #{{orderNumber}} is {{status}}!";
    const rendered = renderTemplate(raw, {
      customerName: "Mohamed",
      orderNumber: 104,
      status: "CONFIRMED",
    });
    assert.equal(rendered, "Hello Mohamed, your order #104 is CONFIRMED!");

    // Missing variables replaced with empty string without crashing
    const partial = renderTemplate(raw, { customerName: "Ali" });
    assert.equal(partial, "Hello Ali, your order # is !");

    // Non-string input safety
    assert.equal(renderTemplate(null), "");
    assert.equal(renderTemplate(undefined), "");
  });

  // 2. Feedback Rating Parser Unit Tests
  test("2. Feedback Parser: Parses various rating formats correctly", () => {
    assert.equal(parseFeedbackRating("5"), 5);
    assert.equal(parseFeedbackRating("١"), 1);
    assert.equal(parseFeedbackRating("٤"), 4);
    assert.equal(parseFeedbackRating("5/5"), 5);
    assert.equal(parseFeedbackRating("4 نجوم"), 4);
    assert.equal(parseFeedbackRating("⭐⭐⭐⭐⭐"), 5);
    assert.equal(parseFeedbackRating("⭐⭐⭐"), 3);
    assert.equal(parseFeedbackRating("ممتاز جداً"), 5);
    assert.equal(parseFeedbackRating("جيد جدا"), 4);
    assert.equal(parseFeedbackRating("مقبول"), 3);
    assert.equal(parseFeedbackRating("سيء"), 2);
    assert.equal(parseFeedbackRating("سيء جدا"), 1);
    assert.equal(parseFeedbackRating("عايز اكلم موظف"), null);

    assert.equal(isExplicitFeedbackText("⭐⭐⭐⭐"), true);
    assert.equal(isExplicitFeedbackText("ممتاز"), true);
    assert.equal(isExplicitFeedbackText("البيتزا فين"), false);
  });

  // 3. Permission Cache Invalidation Unit Test
  test("3. Permission Invalidation: Handles single ID and array of IDs", async () => {
    await redis.set("permissions:emp_test_1", "cache_val");
    await redis.set("permissions:emp_test_2", "cache_val");

    await invalidateEmployeePermissions("emp_test_1");
    const val1 = await redis.get("permissions:emp_test_1");
    assert.equal(val1, null);

    await invalidateEmployeePermissions(["emp_test_2"]);
    const val2 = await redis.get("permissions:emp_test_2");
    assert.equal(val2, null);
  });

  // 4. GET /api/v1/restaurant/templates
  test("4. GET /api/v1/restaurant/templates returns default templates initially", async () => {
    const res = await fetch(`${baseUrl}/api/v1/restaurant/templates`, {
      headers: {
        Authorization: `Bearer ${tokenA}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length >= 10);

    const welcome = body.data.find((t) => t.key === "WHATSAPP_WELCOME");
    assert.ok(welcome);
    assert.equal(welcome.isCustom, false);
    assert.ok(welcome.activeText.includes("أهلاً بك في مطعمنا"));
  });

  // 5. PATCH /api/v1/restaurant/templates updates template and render() uses it immediately
  test("5. PATCH /api/v1/restaurant/templates customizes template and applies immediately", async () => {
    const customWelcome = "أهلاً وسهلاً بك في فرعنا الجديد! اختر من القائمة التالية:";
    const res = await fetch(`${baseUrl}/api/v1/restaurant/templates`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${tokenA}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        templates: {
          WHATSAPP_WELCOME: customWelcome,
        },
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);

    const welcome = body.data.find((t) => t.key === "WHATSAPP_WELCOME");
    assert.ok(welcome);
    assert.equal(welcome.isCustom, true);
    assert.equal(welcome.activeText, customWelcome);

    // Verify templateService.render uses the customized template for Tenant A
    const rendered = await templateService.render("WHATSAPP_WELCOME", {
      restaurantId: restaurantA.id,
    });
    assert.equal(rendered, customWelcome);
  });

  // 6. Cross-Tenant Isolation: Tenant B still receives the default template
  test("6. Multi-Tenant Isolation: Tenant B is unaffected by Tenant A custom template", async () => {
    const renderedB = await templateService.render("WHATSAPP_WELCOME", {
      restaurantId: restaurantB.id,
    });
    assert.ok(renderedB.includes("أهلاً بك في مطعمنا"));
    assert.ok(!renderedB.includes("فرعنا الجديد"));

    const resB = await fetch(`${baseUrl}/api/v1/restaurant/templates`, {
      headers: {
        Authorization: `Bearer ${tokenB}`,
      },
    });
    const bodyB = await resB.json();
    const welcomeB = bodyB.data.find((t) => t.key === "WHATSAPP_WELCOME");
    assert.equal(welcomeB.isCustom, false);
  });

  // 7. POST /api/v1/restaurant/templates/reset restores default
  test("7. POST /api/v1/restaurant/templates/reset resets template to system default", async () => {
    const res = await fetch(`${baseUrl}/api/v1/restaurant/templates/reset`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenA}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        templateKey: "WHATSAPP_WELCOME",
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);

    const welcome = body.data.find((t) => t.key === "WHATSAPP_WELCOME");
    assert.equal(welcome.isCustom, false);

    // Verify rendered output is now back to default
    const renderedA = await templateService.render("WHATSAPP_WELCOME", {
      restaurantId: restaurantA.id,
    });
    assert.ok(renderedA.includes("أهلاً بك في مطعمنا"));
  });

  // 8. Validation: Rejects invalid template key
  test("8. Validation: Rejects unrecognized template keys", async () => {
    const res = await fetch(`${baseUrl}/api/v1/restaurant/templates`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${tokenA}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        templates: {
          UNKNOWN_MALICIOUS_KEY: "malicious code",
        },
      }),
    });

    assert.equal(res.status, 400);
  });

  // 9. Unauthorized protection: Missing token returns 401
  test("9. Security: Unauthorized request returns 401 AuthenticationError", async () => {
    const res = await fetch(`${baseUrl}/api/v1/restaurant/templates`);
    assert.equal(res.status, 401);
  });

  // 10. POST /api/v1/restaurant/templates creates a new custom template
  let createdCustomKey;
  test("10. POST /api/v1/restaurant/templates creates a custom template", async () => {
    const payload = {
      title: "قالب تأخير تحضير الطلب",
      key: "DELAY_NOTICE",
      category: "INBOX_SUPPORT",
      description: "إشعار العميل عند وجود ضغط في المطبخ",
      text: "نعتذر منك يا {{customerName}}، طلبك رقم #{{orderNumber}} سيستغرق بضع دقائق إضافية.",
      allowedVariables: ["customerName", "orderNumber"],
    };

    const res = await fetch(`${baseUrl}/api/v1/restaurant/templates`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenA}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.key.startsWith("CUSTOM_"));
    createdCustomKey = body.data.key;
    assert.equal(body.data.title, payload.title);
    assert.equal(body.data.isCustom, true);
    assert.equal(body.data.isUserCreated, true);

    // Verify it appears in GET /api/v1/restaurant/templates
    const getRes = await fetch(`${baseUrl}/api/v1/restaurant/templates`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const getBody = await getRes.json();
    const found = getBody.data.find((t) => t.key === createdCustomKey);
    assert.ok(found);
    assert.equal(found.title, payload.title);
  });

  // 11. Custom Template Rendering
  test("11. Template Engine renders custom template with variables", async () => {
    assert.ok(createdCustomKey);
    const rendered = await templateService.render(createdCustomKey, {
      restaurantId: restaurantA.id,
    }, {
      customerName: "كريم",
      orderNumber: 777,
    });

    assert.equal(rendered, "نعتذر منك يا كريم، طلبك رقم #777 سيستغرق بضع دقائق إضافية.");
  });

  // 12. DELETE /api/v1/restaurant/templates/:key deletes the custom template
  test("12. DELETE /api/v1/restaurant/templates/:key removes the custom template", async () => {
    assert.ok(createdCustomKey);
    const res = await fetch(`${baseUrl}/api/v1/restaurant/templates/${createdCustomKey}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${tokenA}`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);

    // Verify it is no longer in GET list
    const found = body.data.find((t) => t.key === createdCustomKey);
    assert.equal(found, undefined);
  });
});

