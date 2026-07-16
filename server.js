const http = require("http");
const os = require("os");
const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");

const FIELD = { w: 1100, h: 660 };
const PLAYER_RADIUS = 18;
const BALL_RADIUS = 10;
const PLAYER_SPEED = 245;
const KICK_RANGE = 58;
const KICK_POWER = 630;
const FRICTION = 0.986;
const GOAL_Y1 = FIELD.h / 2 - 92;
const GOAL_Y2 = FIELD.h / 2 + 92;

const players = Array.from({ length: 6 }, (_, i) => ({
  id: null,
  slot: i,
  name: `P${i + 1}`,
  team: i < 3 ? "blue" : "red",
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  dx: 0,
  dy: 0,
  connected: false,
  lastSeen: 0,
}));

let ball = { x: FIELD.w / 2, y: FIELD.h / 2, vx: 0, vy: 0 };
let score = { blue: 0, red: 0 };
let phase = "waiting";
let goalFlash = "";
const clients = new Map();
let flashTimer = null;

function lanAddress() {
  const nets = os.networkInterfaces();
  for (const infos of Object.values(nets)) {
    for (const info of infos || []) {
      if (info.family === "IPv4" && !info.internal) return info.address;
    }
  }
  return "localhost";
}

function publicHost(req) {
  const host = req.headers.host || `localhost:${PORT}`;
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
    return `${lanAddress()}:${PORT}`;
  }
  return host;
}

function resetPositions() {
  const blueX = FIELD.w * 0.27;
  const redX = FIELD.w * 0.73;
  const ys = [FIELD.h * 0.28, FIELD.h * 0.5, FIELD.h * 0.72];
  players.forEach((p, i) => {
    p.x = i < 3 ? blueX : redX;
    p.y = ys[i % 3];
    p.vx = 0;
    p.vy = 0;
    p.dx = 0;
    p.dy = 0;
  });
  ball = { x: FIELD.w / 2, y: FIELD.h / 2, vx: 0, vy: 0 };
}

resetPositions();

function showFlash(text, ms = 1400) {
  goalFlash = text;
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    goalFlash = "";
    flashTimer = null;
  }, ms);
}

function restartMatch() {
  score = { blue: 0, red: 0 };
  resetPositions();
  phase = players.every((p) => p.connected) ? "playing" : "waiting";
  showFlash(phase === "playing" ? "重新开球！" : "已重置，等待玩家", 1600);
}

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function broadcast(payload) {
  const text = JSON.stringify(payload);
  for (const ws of clients.keys()) {
    if (ws.readyState === ws.OPEN) ws.send(text);
  }
}

function stateForClient() {
  return {
    type: "state",
    field: FIELD,
    phase,
    score,
    goalFlash,
    connectedCount: players.filter((p) => p.connected).length,
    players: players.map(({ id, dx, dy, lastSeen, ...rest }) => rest),
    ball,
  };
}

function joinPlayer(ws, name) {
  let player = players.find((p) => p.id === clients.get(ws)?.playerId);
  if (!player) player = players.find((p) => !p.connected);
  if (!player) {
    send(ws, { type: "full" });
    return;
  }

  player.id = clients.get(ws).id;
  player.name = String(name || `P${player.slot + 1}`).slice(0, 16);
  player.connected = true;
  player.lastSeen = Date.now();
  clients.get(ws).playerId = player.id;
  send(ws, {
    type: "joined",
    slot: player.slot,
    team: player.team,
    name: player.name,
  });

  if (players.every((p) => p.connected) && phase === "waiting") {
    phase = "playing";
    showFlash("开球！");
  }
}

function disconnect(ws) {
  const meta = clients.get(ws);
  clients.delete(ws);
  if (!meta?.playerId) return;
  const player = players.find((p) => p.id === meta.playerId);
  if (!player) return;
  player.connected = false;
  player.dx = 0;
  player.dy = 0;
  if (phase === "playing") {
    phase = "waiting";
    resetPositions();
    showFlash("有玩家离开，等待补位", 1800);
  }
}

function kick(player) {
  const dx = ball.x - player.x;
  const dy = ball.y - player.y;
  const dist = Math.hypot(dx, dy);
  if (dist > KICK_RANGE || dist === 0) return;
  const aimX = player.dx || dx / dist;
  const aimY = player.dy || dy / dist;
  const aimLen = Math.max(0.001, Math.hypot(aimX, aimY));
  ball.vx = (aimX / aimLen) * KICK_POWER;
  ball.vy = (aimY / aimLen) * KICK_POWER;
}

function clampPlayer(p) {
  p.x = Math.max(PLAYER_RADIUS, Math.min(FIELD.w - PLAYER_RADIUS, p.x));
  p.y = Math.max(PLAYER_RADIUS, Math.min(FIELD.h - PLAYER_RADIUS, p.y));
}

function step(dt) {
  if (phase !== "playing") return;

  for (const p of players) {
    if (!p.connected) continue;
    p.x += p.dx * PLAYER_SPEED * dt;
    p.y += p.dy * PLAYER_SPEED * dt;
    clampPlayer(p);
  }

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.vx *= FRICTION;
  ball.vy *= FRICTION;

  for (const p of players) {
    const dx = ball.x - p.x;
    const dy = ball.y - p.y;
    const dist = Math.hypot(dx, dy);
    const min = PLAYER_RADIUS + BALL_RADIUS;
    if (dist > 0 && dist < min) {
      const nx = dx / dist;
      const ny = dy / dist;
      ball.x = p.x + nx * min;
      ball.y = p.y + ny * min;
      ball.vx += nx * 95;
      ball.vy += ny * 95;
    }
  }

  if (ball.y < BALL_RADIUS || ball.y > FIELD.h - BALL_RADIUS) {
    ball.y = Math.max(BALL_RADIUS, Math.min(FIELD.h - BALL_RADIUS, ball.y));
    ball.vy *= -0.72;
  }

  const inGoalMouth = ball.y > GOAL_Y1 && ball.y < GOAL_Y2;
  if (ball.x <= BALL_RADIUS && inGoalMouth) return scoreGoal("red");
  if (ball.x >= FIELD.w - BALL_RADIUS && inGoalMouth) return scoreGoal("blue");

  if (ball.x < BALL_RADIUS || ball.x > FIELD.w - BALL_RADIUS) {
    ball.x = Math.max(BALL_RADIUS, Math.min(FIELD.w - BALL_RADIUS, ball.x));
    ball.vx *= -0.72;
  }
}

function scoreGoal(team) {
  score[team] += 1;
  showFlash(`${team === "blue" ? "蓝队" : "红队"}进球！`, 2200);
  phase = "goal";
  setTimeout(() => {
    resetPositions();
    phase = players.every((p) => p.connected) ? "playing" : "waiting";
  }, 2200);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/api/info") {
    const host = publicHost(req);
    const joinUrl = `http://${host}/controller`;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ joinUrl, displayUrl: `http://${host}/` }));
    return;
  }

  if (url.pathname === "/qr.svg") {
    const host = publicHost(req);
    const joinUrl = `http://${host}/controller`;
    const svg = await QRCode.toString(joinUrl, {
      type: "svg",
      margin: 1,
      width: 360,
      color: { dark: "#10281e", light: "#ffffff" },
    });
    res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "no-store" });
    res.end(svg);
    return;
  }

  let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
  if (filePath === "/controller") filePath = "/controller.html";
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "");
  const fullPath = path.join(PUBLIC_DIR, filePath);
  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(fullPath);
    const contentType = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".svg": "image/svg+xml",
    }[ext] || "application/octet-stream";
    res.writeHead(200, { "content-type": contentType });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
wss.on("connection", (ws) => {
  clients.set(ws, {
    id: crypto.randomUUID(),
    role: "spectator",
    playerId: null,
  });
  send(ws, stateForClient());

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const meta = clients.get(ws);
    if (!meta) return;
    if (msg.type === "display") {
      meta.role = "display";
      return;
    }
    if (msg.type === "restart" && meta.role === "display") {
      restartMatch();
      return;
    }
    if (msg.type === "join") {
      meta.role = "player";
      joinPlayer(ws, msg.name);
      return;
    }
    const player = players.find((p) => p.id === meta.playerId);
    if (!player) return;
    player.lastSeen = Date.now();
    if (msg.type === "input") {
      const dx = Number(msg.dx) || 0;
      const dy = Number(msg.dy) || 0;
      const len = Math.max(1, Math.hypot(dx, dy));
      player.dx = Math.max(-1, Math.min(1, dx / len));
      player.dy = Math.max(-1, Math.min(1, dy / len));
    }
    if (msg.type === "kick") kick(player);
  });

  ws.on("close", () => disconnect(ws));
});

let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.04, (now - last) / 1000);
  last = now;
  step(dt);
  broadcast(stateForClient());
}, 1000 / 30);

server.listen(PORT, "0.0.0.0", () => {
  const host = lanAddress();
  console.log(`Display: http://localhost:${PORT}`);
  console.log(`Phone join: http://${host}:${PORT}/controller`);
});
