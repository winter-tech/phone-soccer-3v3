# 3V3 手机足球部署说明

这个游戏需要一个 Node.js 服务同时提供网页和 WebSocket 实时通信。部署后，大屏打开服务器网页，手机扫描二维码加入即可。

## 上传到 GitHub

如果你已经有一个空仓库，例如：

```text
https://github.com/winter-tech/phone-soccer-3v3.git
```

在本地项目目录执行：

```bash
git init
git add .
git commit -m "Initial 3v3 phone soccer game"
git branch -M main
git remote add origin https://github.com/winter-tech/phone-soccer-3v3.git
git push -u origin main
```

如果使用 SSH：

```bash
git remote add origin git@github.com:winter-tech/phone-soccer-3v3.git
git push -u origin main
```

## 方式一：直接在服务器运行

服务器需要安装 Node.js 20 或 22。

```bash
git clone https://github.com/winter-tech/phone-soccer-3v3.git
cd phone-soccer-3v3
npm ci
PORT=3000 npm start
```

然后在浏览器打开：

```text
http://服务器公网IP:3000
```

如果云服务器有安全组或防火墙，需要放行 TCP `3000` 端口。

## 方式二：Docker 部署（推荐）

镜像地址：`ghcr.io/winter-tech/phone-soccer-3v3:latest`

推送到 `main` 后，GitHub Actions 会自动构建并发布到 GHCR。首次发布后，若拉取报 401/403，到仓库 Packages 把该镜像可见性改为 **Public**。

### Compose 一键部署

```bash
git clone https://github.com/winter-tech/phone-soccer-3v3.git
cd phone-soccer-3v3
docker compose up -d
```

打开：

```text
http://服务器公网IP:3000
```

若无法访问 GHCR，取消 `docker-compose.yml` 中 `build` 注释后执行：

```bash
docker compose up -d --build
```

## 绑定域名和 HTTPS

如果你有域名，建议用 Nginx 反向代理到本服务，并支持 WebSocket：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

配置完成后打开：

```text
http://your-domain.com
```

## 注意事项

- 大屏和手机都访问同一个公网地址即可，不必在同一个 Wi-Fi。
- 如果使用 HTTPS，WebSocket 会自动使用 `wss://`。
- 云服务器安全组必须放行你使用的端口，例如 `80`、`443` 或 `3000`。
- 如果部署在公网，任何拿到链接的人都能加入比赛。正式使用前可以再加房间码或管理员开始按钮。

## 常用运维命令

查看容器状态：

```bash
docker ps
```

查看日志：

```bash
docker logs -f phone-soccer-3v3
```

重启：

```bash
docker restart phone-soccer-3v3
```

停止并删除：

```bash
docker rm -f phone-soccer-3v3
```
