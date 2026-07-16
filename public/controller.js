const joinScreen = document.getElementById("joinScreen");
const padScreen = document.getElementById("padScreen");
const joinButton = document.getElementById("joinButton");
const playerName = document.getElementById("playerName");
const joinStatus = document.getElementById("joinStatus");
const teamBadge = document.getElementById("teamBadge");
const playerBadge = document.getElementById("playerBadge");
const matchStatus = document.getElementById("matchStatus");
const joystick = document.getElementById("joystick");
const stick = document.getElementById("stick");
const kickButton = document.getElementById("kickButton");

let socket = null;
let joined = false;
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
      joinStatus.textContent = "已加入，控制器已打开。";
      joinScreen.hidden = true;
      padScreen.hidden = false;
      teamBadge.textContent = msg.team === "blue" ? "蓝队" : "红队";
      teamBadge.className = `team-badge ${msg.team}`;
      playerBadge.textContent = `${msg.name} · ${msg.slot + 1}号`;
    }
    if (msg.type === "full") {
      joinStatus.textContent = "球员已满，请等待下一局。";
    }
    if (msg.type === "state") {
      const labels = {
        waiting: `等待玩家 ${msg.connectedCount}/6`,
        playing: "比赛中",
        goal: msg.goalFlash || "进球",
      };
      matchStatus.textContent = labels[msg.phase] || "准备中";
    }
  });
  socket.addEventListener("close", () => {
    joined = false;
    joinButton.disabled = true;
    joinScreen.hidden = false;
    padScreen.hidden = true;
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

connect();
