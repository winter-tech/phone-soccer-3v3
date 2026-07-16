const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const phaseEl = document.getElementById("phase");
const slotsEl = document.getElementById("slots");
const joinPanel = document.getElementById("joinPanel");
const joinUrlEl = document.getElementById("joinUrl");
const joinHintEl = document.getElementById("joinHint");
const qrEl = document.getElementById("qr");
const goalFlashEl = document.getElementById("goalFlash");
const pauseBannerEl = document.getElementById("pauseBanner");
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
  phaseEl.textContent = FieldRender.phaseLabel(state);
  phaseEl.classList.toggle("paused", state.phase === "paused");
  const started = state.phase !== "waiting";
  joinPanel.classList.toggle("compact", started);
  joinPanel.hidden = !started && state.connectedCount >= (state.maxPlayers || 20);
  if (joinHintEl) {
    joinHintEl.textContent =
      "手机扫码加入。随机均衡分队，双方各至少 1 人自动开赛，最多 20 人。";
  }
  goalFlashEl.hidden = !state.goalFlash;
  goalFlashEl.textContent = state.goalFlash || "";
  pauseBannerEl.hidden = state.phase !== "paused";
  slotsEl.innerHTML = state.players
    .map(
      (p) => `
        <div class="slot ${p.team}">
          <span class="slot-dot"></span>
          <span>
            ${p.name}
            <small>${p.team === "blue" ? "蓝队" : "红队"} ${p.slot}号</small>
          </span>
        </div>
      `,
    )
    .join("");
}

function frame() {
  FieldRender.drawScene(ctx, state);
  requestAnimationFrame(frame);
}

loadInfo();
connect();
frame();

restartButton.addEventListener("click", () => {
  if (socket?.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: "restart" }));
});
