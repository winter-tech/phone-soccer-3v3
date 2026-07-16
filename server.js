const http = require("http");
const os = require("os");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const QRCode = require("qrcode");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_PLAYERS = 20;

const FIELD = { w: 1100, h: 660 };
const PLAYER_RADIUS = 18;
const BALL_RADIUS = 10;
const PLAYER_SPEED = 245;
const KICK_RANGE = 58;
const KICK_POWER = 630;
const FRICTION = 0.986;
const GOAL_Y1 = FIELD.h / 2 - 92;
const GOAL_Y2 = FIELD.h / 2 + 92;

/** @type {Array<{id:string,slot:number,name:string,team:'blue'|'red',x:number,y:number,vx:number,vy:number,dx:number,dy:number,connected:boolean,lastSeen:number}>} */
let players = [];
let nextSlot = 1;

let ball = { x: FIELD.w / 2, y: FIELD.h / 2, vx: 0, vy: 0 };
let score = { blue: 0, red: 0 };
/** @type {'waiting'|'playing'|'paused'|'goal'} */
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

function teamCounts() {
  let blue = 0;
  let red = 0;
  for (const p of players) {
    if (!p.connected) continue;
    if (p.team === "blue") blue += 1;
    else red += 1;
  }
  return { blue, red, total: blue + red };
}

function canPlay() {
  const { blue, red } = teamCounts();
  return blue >= 1 && red >= 1;
}

function pickBalancedTeam() {
  const { blue, red } = teamCounts();
  if (blue < red) return "blue";
  if (red < blue) return "red";
  return Math.random() < 0.5 ? "blue" : "red";
}

function placeTeam(teamPlayers, x) {
  const n = teamPlayers.length;
  teamPlayers.forEach((p, i) => {
    const t = (i + 1) / (n + 1);
    p.x = x;
    p.y = FIELD.h * (0.1 + 0.8 * t);
    p.vx = 0;
    p.vy = 0;
    p.dx = 0;
    p.dy = 0;
  });
}

function resetPositions() {
  placeTeam(
    players.filter((p) => p.team === "blue"),
    FIELD.w * 0.27,
  );
  placeTeam(
    players.filter((p) => p.team === "red"),
    FIELD.w * 0.73,
  );
  ball = { x: FIELD.w / 2, y: FIELD.h / 2, vx: 0, vy: 0 };
}

function spawnPlayer(player) {
  const mates = players.filter((p) => p.team === player.team && p.id !== player.id);
  const x = player.team === "blue" ? FIELD.w * 0.27 : FIELD.w * 0.73;
  const n = mates.length + 1;
  const t = n / (n + 1);
  player.x = x;
  player.y = FIELD.h * (0.1 + 0.8 * t);
  player.vx = 0;
  player.vy = 0;
  player.dx = 0;
  player.dy = 0;
}

function showFlash(text, ms = 1400) {
  goalFlash = text;
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    goalFlash = "";
    flashTimer = null;
  }, ms);
}

function syncPhase(reason = "") {
  if (phase === "goal") return;

  if (canPlay()) {
    if (phase === "waiting") {
      phase = "playing";
      showFlash("开球！");
      return;
    }
    if (phase === "paused") {
      phase = "playing";
      showFlash("比赛继续");
    }
    return;
  }

  const { total } = teamCounts();
  if (phase === "playing") {
    ball.vx = 0;
    ball.vy = 0;
    phase = total === 0 ? "waiting" : "paused";
    showFlash(phase === "paused" ? "比赛暂停" : "等待玩家", 1800);
    return;
  }

  if (phase === "paused" && total === 0) {
    phase = "waiting";
    resetPositions();
    if (reason) showFlash("等待玩家", 1600);
  }
}

function restartMatch() {
  score = { blue: 0, red: 0 };
  resetPositions();
  phase = canPlay() ? "playing" : "waiting";
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
  const counts = teamCounts();
  return {
    type: "state",
    field: FIELD,
    phase,
    score,
    goalFlash,
    maxPlayers: MAX_PLAYERS,
    connectedCount: counts.total,
    teamCounts: { blue: counts.blue, red: counts.red },
    players: players.map(({ id, dx, dy, lastSeen, ...rest }) => ({
      ...rest,
      id,
    })),
    ball,
  };
}

function joinPlayer(ws, name) {
  const meta = clients.get(ws);
  if (!meta) return;

  let player = players.find((p) => p.id === meta.playerId);
  if (player) {
    player.name = String(name || `P${player.slot}`).slice(0, 16);
    player.connected = true;
    player.lastSeen = Date.now();
    send(ws, {
      type: "joined",
      slot: player.slot,
      team: player.team,
      name: player.name,
      playerId: player.id,
    });
    syncPhase();
    return;
  }

  if (teamCounts().total >= MAX_PLAYERS) {
    send(ws, { type: "full" });
    return;
  }

  const team = pickBalancedTeam();
  player = {
    id: meta.id,
    slot: nextSlot,
    name: String(name || `P${nextSlot}`).slice(0, 16),
    team,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    dx: 0,
    dy: 0,
    connected: true,
    lastSeen: Date.now(),
  };
  nextSlot += 1;
  spawnPlayer(player);
  players.push(player);
  meta.playerId = player.id;
  meta.role = "player";

  send(ws, {
    type: "joined",
    slot: player.slot,
    team: player.team,
    name: player.name,
    playerId: player.id,
  });
  syncPhase();
}

function disconnect(ws) {
  const meta = clients.get(ws);
  clients.delete(ws);
  if (!meta?.playerId) return;
  const idx = players.findIndex((p) => p.id === meta.playerId);
  if (idx < 0) return;
  players.splice(idx, 1);
  syncPhase("leave");
}

function kick(player) {
  if (phase !== "playing") return;
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
  if (phase !== "playing" && phase !== "paused") return;

  for (const p of players) {
    if (!p.connected) continue;
    p.x += p.dx * PLAYER_SPEED * dt;
    p.y += p.dy * PLAYER_SPEED * dt;
    clampPlayer(p);
  }

  if (phase !== "playing") return;

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
    if (canPlay()) {
      phase = "playing";
    } else if (teamCounts().total === 0) {
      phase = "waiting";
    } else {
      phase = "paused";
      ball.vx = 0;
      ball.vy = 0;
    }
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
    res.writeHead(200, { "content-type": contentType, "cache-control": "no-store" });
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
