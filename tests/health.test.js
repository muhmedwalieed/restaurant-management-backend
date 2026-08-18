import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import app from "../src/app/app.js";
import { disconnectRedis } from "../src/config/redis.js";

describe("Health Check Endpoints Tests (/health & /ready)", () => {
  let server;
  let baseUrl;

  before(async () => {
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, () => {
        const address = server.address();
        baseUrl = `http://localhost:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await disconnectRedis();
    await new Promise((resolve) => {
      server.close(resolve);
    });
  });

  test("GET /health returns 200 OK with success status and requestId in body", async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.notEqual(body.requestId, undefined);
    assert.equal(typeof body.data.timestamp, "string");
  });

  test("GET /ready returns valid status, backing services structure, and requestId", async () => {
    const res = await fetch(`${baseUrl}/ready`);
    assert.ok(res.status === 200 || res.status === 503);

    const body = await res.json();
    assert.notEqual(body.requestId, undefined);

    const services = body.data?.services || body.services;
    assert.notEqual(services, undefined);
    assert.ok("database" in services);
    assert.ok("redis" in services);
  });
});
