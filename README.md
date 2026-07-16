# 3V3 手机足球小游戏

一个可部署到服务器的网页足球小游戏。大屏打开比赛页面，开始前显示二维码；玩家用手机扫码加入，手机上出现摇杆和踢球按钮。最多 6 名玩家，满员后自动开始 3V3 比赛。

## 功能

- 大屏 Canvas 显示足球场、球员、足球、比分和玩家席位
- 手机扫码加入，随机均衡分队，最多 20 人
- 双方各至少 1 人自动开赛；某队无人时比赛暂停（可移动、不可踢球）
- 手机端横屏同步比赛画面，左右悬浮摇杆和踢球按钮
- 进球自动计分并回到中场
- 大屏支持“重新开始”，可清零比分并重置位置
- 支持 Docker / GHCR 一键部署

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

1. 大屏浏览器打开比赛页面（可扫码）。
2. 玩家用手机打开加入页，输入名字加入。
3. 系统随机均衡分到蓝/红队；双方各有至少 1 人后自动开赛。
4. 手机横屏显示比赛画面，左侧摇杆移动，右侧按钮踢球。
5. 某队全部离开时比赛暂停，双方都有人后继续。
6. 大屏右上角“重新开始”可重置比分和球员位置。

## Docker 快速运行

推荐直接拉取 GHCR 镜像（无需本地构建）：

```bash
docker compose up -d
```

然后打开：

```text
http://服务器IP:3000
```

若无法访问 GHCR，可取消 `docker-compose.yml` 里 `build` 注释后执行：

```bash
docker compose up -d --build
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
