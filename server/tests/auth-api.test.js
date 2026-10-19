const assert = require("node:assert/strict");
const test = require("node:test");
const bcrypt = require("bcrypt");
const User = require("../models/User");
const app = require("../app");

const originalFindOne = User.findOne;
const originalFindById = User.findById;
const originalCreate = User.create;
const originalJwtSecret = process.env.JWT_SECRET;
const jwtSecret = "spendwise-auth-route-test-secret";
const testEmail = "popup-signup@example.invalid";
const testPassword = "spendwise-test-password";
const users = [];

let server;
let baseUrl;
let simulateDuplicateRace = false;

const post = (path, body) =>
  fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

test.before(async () => {
  process.env.JWT_SECRET = jwtSecret;
  User.findOne = async ({ email }) =>
    users.find((user) => user.email === email) || null;
  User.findById = (id) => ({
    select: async () => {
      const user = users.find((candidate) => candidate._id === String(id));
      if (!user) return null;
      return {
        _id: user._id,
        email: user.email,
        name: user.name,
      };
    },
  });
  User.create = async (details) => {
    if (simulateDuplicateRace) {
      const error = new Error("duplicate key");
      error.code = 11000;
      throw error;
    }
    const user = { ...details, _id: `test-user-${users.length + 1}` };
    users.push(user);
    return user;
  };

  server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  server.closeAllConnections();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  User.findOne = originalFindOne;
  User.findById = originalFindById;
  User.create = originalCreate;
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});

test.beforeEach(() => {
  users.length = 0;
  simulateDuplicateRace = false;
});

test("registration validates fields and email format through the Express route", async () => {
  const missing = await post("/api/auth/register", {});
  const invalidEmail = await post("/api/auth/register", {
    email: "not-an-email",
    password: testPassword,
  });
  const invalidPassword = await post("/api/auth/register", {
    email: testEmail,
    password: 123,
  });

  assert.equal(missing.status, 400);
  assert.equal(invalidEmail.status, 400);
  assert.equal(invalidPassword.status, 400);
  assert.deepEqual(users, []);
});

test("registration normalizes email, hashes password, and supports sign-in and protected account access", async () => {
  const registration = await post("/api/auth/register", {
    name: " Popup Tester ",
    email: ` ${testEmail.toUpperCase()} `,
    password: testPassword,
  });
  const registeredBody = await registration.json();

  assert.equal(registration.status, 201);
  assert.equal(registeredBody.user.email, testEmail);
  assert.equal(registeredBody.user.name, "Popup Tester");
  assert.equal("token" in registeredBody, false);
  assert.equal("passwordHash" in registeredBody.user, false);
  assert.equal(users.length, 1);
  assert.notEqual(users[0].passwordHash, testPassword);
  assert.equal(await bcrypt.compare(testPassword, users[0].passwordHash), true);

  const failedLogin = await post("/api/auth/login", {
    email: testEmail,
    password: "incorrect password",
  });
  assert.equal(failedLogin.status, 401);

  const login = await post("/api/auth/login", {
    email: testEmail,
    password: testPassword,
  });
  const loginBody = await login.json();
  assert.equal(login.status, 200);
  assert.equal(typeof loginBody.token, "string");
  assert.equal(loginBody.user.email, testEmail);

  const currentUser = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${loginBody.token}` },
  });
  const currentUserBody = await currentUser.json();
  assert.equal(currentUser.status, 200);
  assert.equal(currentUserBody.user.email, testEmail);
  assert.equal("passwordHash" in currentUserBody.user, false);
});

test("registration rejects duplicate email regardless of case and handles concurrent duplicate writes", async () => {
  users.push({
    _id: "existing-test-user",
    email: testEmail,
    passwordHash: "not-used",
  });

  const duplicate = await post("/api/auth/register", {
    email: testEmail.toUpperCase(),
    password: testPassword,
  });
  assert.equal(duplicate.status, 409);
  assert.deepEqual(await duplicate.json(), { message: "User already exists" });

  simulateDuplicateRace = true;
  const concurrentDuplicate = await post("/api/auth/register", {
    email: "another-popup-signup@example.invalid",
    password: testPassword,
  });
  assert.equal(concurrentDuplicate.status, 409);
  assert.deepEqual(await concurrentDuplicate.json(), {
    message: "User already exists",
  });
});
