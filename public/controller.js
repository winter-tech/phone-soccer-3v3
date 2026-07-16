const joinScreen = document.getElementById("joinScreen");
const padScreen = document.getElementById("padScreen");
const joinButton = document.getElementById("joinButton");
const playerName = document.getElementById("playerName");
const joinStatus = document.getElementById("joinStatus");
const teamBadge = document.getElementById("teamBadge");
const playerBadge = document.getElementById("playerBadge");
const matchStatus = document.getElementById("matchStatus");
const phoneScore = document.getElementById("phoneScore");
const phonePauseBanner = document.getElementById("phonePauseBanner");
const phoneGoalFlash = document.getElementById("phoneGoalFlash");
const joystick = document.getElementById("joystick");
const stick = document.getElementById("stick");
const kickButton = document.getElementById("kickButton");
const canvas = document.getElementById("phoneGame");
const ctx = canvas.getContext("2d");

// 球场固定内部分辨率
const FIELD_W = 1100;
const FIELD_H = 660;
const FIELD_RATIO = FIELD_W / FIELD_H;

/**
 * Letterbox / contain-fit：
 * 保持 1100:660 比例，居中显示，多余空间留黑边。
 * 不旋转、不锁屏——横竖屏自动适配。
 */
function resizeCanvas() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w === 0 || h === 0) return;

  const screenRatio = w / h;
  let dispW, dispH;

  if (screenRatio > FIELD_RATIO) {
    // 屏幕比球场宽 → 充满高度，左右留黑边
    dispH = h;
    dispW = h * FIELD_RATIO;
  } else {
    // 屏幕比球场窄 → 充满宽度，上下留黑边
    dispW = w;
    dispH = w / FIELD_RATIO;
  }

  canvas.style.width = dispW + "px";
  canvas.style.height = dispH + "px";
}

window.addEventListener("resize", resizeCanvas);
window.addEventListener("orientationchange", () => setTimeout(resizeCanvas, 100));

let socket = null;
let joined = false;
let myPlayerId = null;
let state = null;
let currentInput = { dx: 0, dy: 0 };
let activePointer = null;

joinButton.disabled = true;

function connect() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${protocol}://${location.host}`);
  socket.addEventListener("open", () => {
    joinButton.disabled = false;
    joinStatus.textContent = "已连接，输入名字后加入。";
  });
  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "joined") {
      joined = true;
      myPlayerId = msg.playerId;
      joinStatus.textContent = "已加入。";
      joinScreen.hidden = true;
      padScreen.hidden = false;
      document.body.classList.add("in-match");
      teamBadge.textContent = msg.team === "blue" ? "蓝队" : "红队";
      teamBadge.className = `team-badge ${msg.team}`;
      playerBadge.textContent = `${msg.name} · ${msg.slot}号`;
      requestAnimationFrame(resizeCanvas);
    }
    if (msg.type === "full") {
      joinStatus.textContent = "人数已满（最多 20 人），请稍后再试。";
    }
    if (msg.type === "state") {
      state = msg;
      matchStatus.textContent = FieldRender.phaseLabel(msg);
      phoneScore.textContent = `${msg.score.blue} : ${msg.score.red}`;
      phonePauseBanner.hidden = msg.phase !== "paused";
      phoneGoalFlash.hidden = !msg.goalFlash;
      phoneGoalFlash.textContent = msg.goalFlash || "";
    }
  });
  socket.addEventListener("close", () => {
    joined = false;
    myPlayerId = null;
    joinButton.disabled = true;
    joinScreen.hidden = false;
    padScreen.hidden = true;
    document.body.classList.remove("in-match");
    joinStatus.textContent = "连接断开，正在重连...";
    setTimeout(connect, 900);
  });
}

function send(payload) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
    return true;
  }
  return false;
}

joinButton.addEventListener("click", () => {
  joinStatus.textContent = "正在加入...";
  const sent = send({ type: "join", name: playerName.value.trim() || "球员" });
  if (!sent) joinStatus.textContent = "还没连上，请稍等一秒再点。";
});

playerName.addEventListener("keydown", (event) => {
  if (event.key === "Enter") joinButton.click();
});

function setStick(dx, dy) {
  currentInput = { dx, dy };
  const max = joystick.clientWidth * 0.29;
  stick.style.transform = `translate(calc(-50% + ${dx * max}px), calc(-50% + ${dy * max}px))`;
  send({ type: "input", dx, dy });
}

function updateFromPointer(event) {
  const rect = joystick.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const rawX = event.clientX - cx;
  const rawY = event.clientY - cy;
  const max = rect.width * 0.38;
  const len = Math.hypot(rawX, rawY);
  const scale = len > max ? max / len : 1;
  const dx = (rawX * scale) / max;
  const dy = (rawY * scale) / max;
  setStick(dx, dy);
}

joystick.addEventListener("pointerdown", (event) => {
  activePointer = event.pointerId;
  joystick.setPointerCapture(activePointer);
  updateFromPointer(event);
});

joystick.addEventListener("pointermove", (event) => {
  if (event.pointerId === activePointer) updateFromPointer(event);
});

function releaseStick(event) {
  if (event.pointerId !== activePointer) return;
  activePointer = null;
  setStick(0, 0);
}

joystick.addEventListener("pointerup", releaseStick);
joystick.addEventListener("pointercancel", releaseStick);

kickButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  if (!joined) return;
  send({ type: "kick" });
  kickButton.animate(
    [
      { transform: "scale(1)" },
      { transform: "scale(0.92)" },
      { transform: "scale(1)" },
    ],
    { duration: 150 },
  );
});

setInterval(() => {
  if (joined) send({ type: "input", ...currentInput });
}, 120);

function frame() {
  if (!padScreen.hidden) {
    FieldRender.drawScene(ctx, state, { highlightId: myPlayerId });
  }
  requestAnimationFrame(frame);
}

connect();
frame();
