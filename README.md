# 3V3 手机足球小游戏

一个可部署到服务器的网页足球小游戏。大屏打开比赛页面，开始前显示二维码；玩家用手机扫码加入，手机上出现摇杆和踢球按钮。最多 6 名玩家，满员后自动开始 3V3 比赛。

## 功能

- 大屏 Canvas 显示足球场、球员、足球、比分和玩家席位
- 手机扫码加入比赛
- 手机端虚拟摇杆控制球员移动
- 手机端踢球按钮控制射门或传球
- 6 人满员自动开赛
- 进球自动计分并回到中场
- 大屏支持“重新开始”，可清零比分并重置位置
- 支持 Docker 部署

## 本地运行

需要 Node.js 20 或 22。

```bash
npm ci
npm start
```

打开大屏：

```text
http://localhost:3000
```

手机和电脑在同一网络时，扫描大屏二维码即可加入。

## 使用方法

1. 大屏浏览器打开比赛页面。
2. 大屏会显示二维码和加入地址。
3. 玩家用手机扫码进入控制页。
4. 手机输入球员名，点击“加入球场”。
5. 加入成功后手机显示摇杆和“踢球”按钮。
6. 左侧摇杆控制移动，右侧按钮踢球。
7. 6 名玩家加入后比赛自动开始。
8. 大屏右上角“重新开始”可重置比分和球员位置。

## Docker 快速运行

```bash
docker build -t phone-soccer-3v3 .
docker run -d --name phone-soccer-3v3 -p 3000:3000 phone-soccer-3v3
```

或者：

```bash
docker compose up -d --build
```

然后打开：

```text
http://服务器IP:3000
```

## 项目结构

```text
.
├── server.js              # Node.js HTTP + WebSocket 服务
├── public/
│   ├── index.html         # 大屏页面
│   ├── game.js            # 大屏渲染和控制逻辑
│   ├── controller.html    # 手机控制页
│   ├── controller.js      # 手机摇杆和踢球逻辑
│   └── styles.css         # 页面样式
├── Dockerfile
├── docker-compose.yml
└── DEPLOY.md
```

## 部署

完整部署说明见 [DEPLOY.md](./DEPLOY.md)。
