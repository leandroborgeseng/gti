/**
 * Espera o Nest embutido: porta TCP e resposta HTTP em /api/auth/me
 * (401 sem token é esperado — só confirma que o Express responde).
 */
const net = require("net");
const http = require("http");

const port = Number(process.env.NEST_PORT || 4000);
const maxMs = Number(process.env.NEST_WAIT_MAX_MS || 90000);
const deadline = Date.now() + maxMs;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function tcpReady() {
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const s = net.createConnection(port, "127.0.0.1");
      s.on("connect", () => {
        s.end();
        resolve(true);
      });
      s.on("error", () => resolve(false));
    });
    if (ok) return;
    await sleep(300);
  }
  throw new Error(`Nest não abriu TCP na porta ${port} em ${maxMs} ms`);
}

async function httpReady() {
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/api/auth/me",
          method: "GET",
          timeout: 8000
        },
        (res) => {
          res.resume();
          resolve(true);
        }
      );
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    });
    if (ok) return;
    await sleep(400);
  }
  throw new Error(`Nest não respondeu HTTP em /api dentro do limite (${maxMs} ms)`);
}

tcpReady()
  .then(httpReady)
  .then(() => {
    console.log(`[wait-nest] OK http://127.0.0.1:${port}/api`);
    process.exit(0);
  })
  .catch((e) => {
    console.error("[wait-nest]", e?.message || e);
    process.exit(1);
  });
