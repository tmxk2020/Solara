# Solara 云端收藏夹部署指南

本文档介绍如何部署 Solara 项目的云端收藏夹功能，实现跨设备收藏歌曲同步。

## 目录

- [方案概述](#方案概述)
- [前置要求](#前置要求)
- [方案一：Cloudflare KV 存储（推荐）](#方案一cloudflare-kv-存储推荐)
  - [步骤 1：创建 KV 命名空间](#步骤-1创建-kv-命名空间)
  - [步骤 2：绑定 KV 到 Pages 项目](#步骤-2绑定-kv-到-pages-项目)
  - [步骤 3：部署代码](#步骤-3部署代码)
- [方案二：GitHub API 存储（备选）](#方案二github-api-存储备选)
  - [步骤 1：创建 GitHub Token](#步骤-1创建-github-token)
  - [步骤 2：配置环境变量](#步骤-2配置环境变量)
- [验证部署](#验证部署)
- [本地开发（可选）](#本地开发可选)
- [常见问题](#常见问题)

---

## 方案概述

本项目提供两种云端存储方案：

| 方案 | 说明 | 优点 | 缺点 |
|------|------|------|------|
| **Cloudflare KV** | 使用 Cloudflare 内置的键值存储 | 快速、免费额度充足、无需额外配置 | 需要在 Cloudflare 中创建 KV |
| **GitHub API** | 通过 GitHub Contents API 更新仓库文件 | 数据直接存在于 Git 仓库中 | 速度稍慢、有 API 速率限制 |

**推荐使用 Cloudflare KV 方案**，性能更好且配置简单。

---

## 前置要求

- [x] 已将项目部署到 Cloudflare Pages
- [x] 拥有 Cloudflare 账户
- [x] 拥有 GitHub 仓库访问权限

---

## 方案一：Cloudflare KV 存储（推荐）

### 步骤 1：创建 KV 命名空间

#### 方法 A：通过 Cloudflare Dashboard

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 点击左侧 **Workers & Pages** > **KV**
3. 点击 **Create a namespace** 按钮
4. 填写命名空间名称：`SOLARA_STORAGE`
5. 点击 **Add** 创建

#### 方法 B：通过 Wrangler CLI

```bash
# 安装 Wrangler（如果尚未安装）
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 创建 KV 命名空间
wrangler kv:namespace create "SOLARA_STORAGE"
```

执行后会输出：
```toml
# 将以下内容添加到 wrangler.toml
[[kv_namespaces]]
binding = "SOLARA_STORAGE"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

### 步骤 2：绑定 KV 到 Pages 项目

1. 访问 [Cloudflare Pages](https://dash.cloudflare.com) 并选择你的 `Solara` 项目
2. 点击左侧 **Settings**（设置）
3. 向下滚动到 **Functions** 区域
4. 点击 **KV namespace bindings** 旁的 **Add binding**
5. 填写：
   - **Variable name**: `SOLARA_STORAGE`（注意大小写）
   - **KV namespace**: 选择你刚才创建的 `SOLARA_STORAGE`
6. 点击 **Save** 保存

### 步骤 3：部署代码

确保以下文件已推送到你的 GitHub 仓库：

| 文件 | 说明 |
|------|------|
| `functions/starlist.txt.ts` | 云端存储端点函数 |
| `js/favorites-storage.js` | 前端收藏模块 |
| `index.html` | 已更新，引入收藏模块 |

推送命令：
```bash
git add functions/starlist.txt.ts js/favorites-storage.js index.html
git commit -m "feat: 添加云端收藏夹功能"
git push
```

推送后，Cloudflare Pages 会自动触发新的部署。

---

## 方案二：GitHub API 存储（备选）

> ⚠️ 此方案为备选方案，仅在不想使用 KV 存储时考虑。

### 步骤 1：创建 GitHub Token

1. 访问 [GitHub Personal Access Tokens](https://github.com/settings/tokens?type=beta)
2. 点击 **Generate new token** > **Fine-grained token**
3. 配置：
   - **Token name**: `Solara Favorites Storage`
   - **Expiration**: 选择有效期（建议 1 年）
   - **Repository access**: 选择 `Only select repositories`，然后选择 `Solara` 仓库
   - **Permissions**:
     - **Contents**: 选择 **Read and write**
4. 点击 **Generate token**
5. **复制并保存 Token**（只显示一次！）

### 步骤 2：配置环境变量

1. 访问 [Cloudflare Pages](https://dash.cloudflare.com) 并选择你的 `Solara` 项目
2. 点击左侧 **Settings** > **Environment variables**
3. 添加以下变量：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `GITHUB_TOKEN` | `ghp_xxxxxxxxxxxx` | 你刚创建的 GitHub Token |
| `GITHUB_REPO` | `your-username/Solara` | 你的 GitHub 用户名/仓库名 |
| `GITHUB_BRANCH` | `main` | 分支名（可选，默认 main） |

4. 点击 **Save** 保存

---

## 验证部署

部署完成后（等待 Cloudflare Pages 部署状态变为 "Deployed"），进行以下验证：

### 1. 访问收藏列表页面

```
https://你的域名/starlist.txt
```

如果存储已正确配置，应该看到：
```
=== Solara 收藏列表 ===
更新时间: 2026-04-12T02:00:00.000Z
收藏数量: 0 首
========================

暂无收藏歌曲
```

### 2. 访问 JSON 格式的收藏列表

```
https://你的域名/starlist.txt?format=json
```

应该看到：
```json
{
  "success": true,
  "songs": [],
  "count": 0
}
```

### 3. 测试收藏功能

1. 打开你的网站，搜索一首歌曲
2. 点击收藏按钮（心形图标）
3. 访问 `https://你的域名/starlist.txt`，应该能看到刚收藏的歌曲

---

## 本地开发（可选）

如果你想在本地测试云端收藏功能，需要使用 Wrangler 进行本地预览。

### 创建 wrangler.toml

在项目根目录创建 `wrangler.toml`：

```toml
name = "solara"
pages_build_output_dir = "."

# KV 绑定（方案一）
[[kv_namespaces]]
binding = "SOLARA_STORAGE"
id = "你的KV命名空间ID"  # 替换为实际的 KV ID
```

### 启动本地预览

```bash
# 安装依赖（如尚未安装）
npm install -g wrangler

# 登录
wrangler login

# 启动本地开发服务器
wrangler pages dev .
```

然后在浏览器中访问 `http://localhost:8788`

---

## 常见问题

### Q1: 部署后访问 /starlist.txt 返回 503 错误？

**原因**：KV 绑定未正确配置或环境变量未设置。

**解决方法**：
1. 检查 Pages 项目的 KV bindings 中是否正确配置了 `SOLARA_STORAGE`
2. 确认 KV 命名空间已创建
3. 重新部署项目

### Q2: 收藏操作没有反应？

**原因**：前端代码可能存在问题或网络请求被拦截。

**解决方法**：
1. 打开浏览器开发者工具，查看 Console 中的错误信息
2. 查看 Network 标签，检查 `/starlist.txt` 请求的状态
3. 确保 `js/favorites-storage.js` 已正确引入

### Q3: 如何导出/备份收藏数据？

**方法 1**：访问 `https://你的域名/starlist.txt?format=json`，复制返回的 JSON 数据

**方法 2**：在浏览器控制台执行：
```javascript
SolaraFavoritesStorage.sync().then(songs => {
  console.log(JSON.stringify(songs, null, 2));
});
```

### Q4: KV 存储的免费额度是多少？

Cloudflare Workers 免费计划包含：
- **读取操作**：100,000 次/天
- **写入/删除/列出操作**：1,000 次/天
- **存储空间**：1 GB

对于个人音乐收藏来说完全足够。

### Q5: 如何清空所有收藏？

访问 `https://你的域名/starlist.txt`，在页面中点击"清空收藏"按钮，或执行：
```javascript
SolaraFavoritesStorage.clearAll();
```

---

## 文件说明

| 路径 | 说明 |
|------|------|
| `functions/starlist.txt.ts` | Cloudflare Pages Function，处理收藏数据的 CRUD 操作 |
| `js/favorites-storage.js` | 前端收藏模块，提供 `SolaraFavoritesStorage` API |
| `index.html` | 主页，已引入收藏模块 |

---

## API 参考

### 前端 API：`window.SolaraFavoritesStorage`

| 方法 | 说明 | 返回值 |
|------|------|--------|
| `add(song)` | 添加收藏 | `Promise<boolean>` |
| `remove(songId, source)` | 移除收藏 | `Promise<boolean>` |
| `toggle(song)` | 切换收藏状态 | `Promise<boolean>` |
| `isFavorite(songId, source)` | 检查是否已收藏 | `boolean` |
| `addBatch(songs)` | 批量添加 | `Promise<number>` |
| `clearAll()` | 清空收藏 | `Promise<boolean>` |
| `getSongs()` | 获取所有收藏 | `Array` |
| `getCount()` | 获取收藏数量 | `number` |
| `sync()` | 手动同步 | `Promise<Array>` |
| `onChange(callback)` | 注册变更回调 | `void` |

### 后端端点：`/starlist.txt`

| 方法 | 说明 | 请求体 |
|------|------|--------|
| `GET` | 获取收藏列表 | - |
| `GET?format=json` | 获取 JSON 格式收藏列表 | - |
| `POST` | 添加歌曲 | `{ "song": {...} }` 或 `{ "songs": [...] }` |
| `DELETE` | 移除歌曲 | `{ "songId": "...", "source": "..." }` |
| `PUT` | 替换整个列表 | `{ "songs": [...] }` |

---

## 更新日志

| 日期 | 版本 | 说明 |
|------|------|------|
| 2026-04-12 | 1.0.0 | 初始版本，支持云端收藏同步 |