const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const phaseEl = document.getElementById("phase");
const slotsEl = document.getElementById("slots");
const joinPanel = document.getElementById("joinPanel");
const joinUrlEl = document.getElementById("joinUrl");
const qrEl = document.getElementById("qr");
const goalFlashEl = document.getElementById("goalFlash");
const restartButton = document.getElementById("restartButton");

let state = null;
let socket = null;

function connect() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${protocol}://${location.host}`);
  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({ type: "display" }));
    restartButton.disabled = false;
  });
  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "state") {
      state = msg;
      renderHud();
    }
  });
  socket.addEventListener("close", () => {
    restartButton.disabled = true;
    setTimeout(connect, 900);
  });
}

async function loadInfo() {
  const response = await fetch("/api/info", { cache: "no-store" });
  const info = await response.json();
  joinUrlEl.textContent = info.joinUrl;
  qrEl.src = `/qr.svg?t=${Date.now()}`;
}

function renderHud() {
  if (!state) return;
  scoreEl.textContent = `${state.score.blue} : ${state.score.red}`;
  const labels = {
    waiting: `等待玩家 ${state.connectedCount}/6`,
    playing: "比赛中",
    goal: "进球回放",
  };
  phaseEl.textContent = labels[state.phase] || "准备中";
  joinPanel.hidden = state.phase === "playing" && state.connectedCount === 6;
  goalFlashEl.hidden = !state.goalFlash;
  goalFlashEl.textContent = state.goalFlash || "";
  slotsEl.innerHTML = state.players
    .map(
      (p) => `
        <div class="slot ${p.team}">
          <span class="slot-dot"></span>
          <span>
            ${p.connected ? p.name : "等待加入"}
            <small>${p.team === "blue" ? "蓝队" : "红队"} ${p.slot + 1}</small>
          </span>
        </div>
      `,
    )
    .join("");
}

function drawField() {
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);

  for (let i = 0; i < 10; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? "#17613f" : "#1e744b";
    ctx.fillRect((w / 10) * i, 0, w / 10, h);
  }

  ctx.strokeStyle = "rgba(244,255,247,0.84)";
  ctx.lineWidth = 4;
  ctx.strokeRect(22, 22, w - 44, h - 44);
  ctx.beginPath();
  ctx.moveTo(w / 2, 22);
  ctx.lineTo(w / 2, h - 22);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 86, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(244,255,247,0.84)";
  ctx.fill();

  drawBox(22, h / 2 - 145, 142, 290);
  drawBox(w - 164, h / 2 - 145, 142, 290);
  drawBox(22, h / 2 - 88, 64, 176);
  drawBox(w - 86, h / 2 - 88, 64, 176);

  ctx.lineWidth = 8;
  ctx.strokeStyle = "#f6d365";
  ctx.beginPath();
  ctx.moveTo(8, h / 2 - 92);
  ctx.lineTo(8, h / 2 + 92);
  ctx.moveTo(w - 8, h / 2 - 92);
  ctx.lineTo(w - 8, h / 2 + 92);
  ctx.stroke();
}

function drawBox(x, y, w, h) {
  ctx.strokeRect(x, y, w, h);
}

function drawPlayer(p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.globalAlpha = p.connected ? 1 : 0.36;
  ctx.fillStyle = p.team === "blue" ? "#4cb3ff" : "#ff6a65";
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,255,255,0.86)";
  ctx.stroke();
  ctx.fillStyle = p.team === "blue" ? "#061625" : "#2b0706";
  ctx.font = "700 15px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(p.slot + 1), 0, 1);
  ctx.fillStyle = "rgba(245,255,248,0.9)";
  ctx.font = "600 13px system-ui";
  ctx.fillText(p.name, 0, 34);
  ctx.restore();
}

function drawBall(ball) {
  ctx.save();
  ctx.translate(ball.x, ball.y);
  ctx.fillStyle = "#f7fbff";
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#102014";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-6, -2);
  ctx.lineTo(0, -7);
  ctx.lineTo(6, -2);
  ctx.lineTo(4, 6);
  ctx.lineTo(-4, 6);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function frame() {
  drawField();
  if (state) {
    state.players.forEach(drawPlayer);
    drawBall(state.ball);
  }
  requestAnimationFrame(frame);
}

loadInfo();
connect();
frame();

restartButton.addEventListener("click", () => {
  if (socket?.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: "restart" }));
});
