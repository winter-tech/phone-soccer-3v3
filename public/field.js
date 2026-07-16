(function (global) {
  function drawBox(ctx, x, y, w, h) {
    ctx.strokeRect(x, y, w, h);
  }

  function drawField(ctx, w, h) {
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

    drawBox(ctx, 22, h / 2 - 145, 142, 290);
    drawBox(ctx, w - 164, h / 2 - 145, 142, 290);
    drawBox(ctx, 22, h / 2 - 88, 64, 176);
    drawBox(ctx, w - 86, h / 2 - 88, 64, 176);

    ctx.lineWidth = 8;
    ctx.strokeStyle = "#f6d365";
    ctx.beginPath();
    ctx.moveTo(8, h / 2 - 92);
    ctx.lineTo(8, h / 2 + 92);
    ctx.moveTo(w - 8, h / 2 - 92);
    ctx.lineTo(w - 8, h / 2 + 92);
    ctx.stroke();
  }

  function drawPlayer(ctx, p, highlightId) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.globalAlpha = p.connected === false ? 0.36 : 1;
    if (highlightId && p.id === highlightId) {
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(246,211,101,0.95)";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
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
    ctx.fillText(String(p.slot), 0, 1);
    ctx.fillStyle = "rgba(245,255,248,0.9)";
    ctx.font = "600 13px system-ui";
    ctx.fillText(p.name, 0, 34);
    ctx.restore();
  }

  function drawBall(ctx, ball) {
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

  function drawScene(ctx, state, options = {}) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    drawField(ctx, w, h);
    if (!state) return;
    state.players.forEach((p) => drawPlayer(ctx, p, options.highlightId));
    drawBall(ctx, state.ball);
  }

  function phaseLabel(state) {
    if (!state) return "准备中";
    const max = state.maxPlayers || 20;
    const blue = state.teamCounts?.blue ?? 0;
    const red = state.teamCounts?.red ?? 0;
    const labels = {
      waiting: `等待开赛 ${state.connectedCount}/${max}（蓝${blue} 红${red}）`,
      playing: "比赛中",
      paused: "比赛暂停",
      goal: state.goalFlash || "进球",
    };
    return labels[state.phase] || "准备中";
  }

  global.FieldRender = {
    drawScene,
    phaseLabel,
  };
})(window);
