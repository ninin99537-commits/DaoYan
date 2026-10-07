# 小希版接入 tokenrhythm（CORS 问题）· 说明与操作手册

> 结论先说：**不是密钥/地址填错，是 tokenrhythm 的服务端不支持 CORS**；而小希版的请求从**浏览器上下文**发出，所以被浏览器拦掉。解法是**在本机放一个 CORS 代理**，把小希版的地址指过去。

## 1. 现象与根因（2026-10-07 实测）

| 测试方式 | 结果 |
| --- | --- |
| 服务端直连 `GET https://tokenrhythm.studio/v1/models`（带 key） | ✅ 200，返回 23 个模型 |
| 不带 key | 401（鉴权正常） |
| 带 `Origin` 头 | ❌ **无 `Access-Control-Allow-Origin`** |
| `OPTIONS` 预检 | ❌ **404**（不支持预检） |
| **浏览器里实发**（任意页面 origin） | ❌ `TypeError: Failed to fetch` —— **列表与推理接口都一样** |

→ 浏览器里任何带 `Authorization` 的跨域请求都必须先过预检；预检 404 就等于**这条路封死**。
这与配置无关：**只要地址填 tokenrhythm 本身，就会被浏览器拦**。

## 2. 解决方案：本机 CORS 代理

- 脚本：`.agents/tokenrhythm-cors-proxy.mjs`（Node，零依赖）
- 行为：监听 `127.0.0.1:8047`，**补 `Access-Control-Allow-Origin: *`、把 `OPTIONS` 应答成 204**，其余原样**流式**转发到 `https://tokenrhythm.studio/v1`
- 小希版填：
  - Base URL：`http://127.0.0.1:8047/v1`
  - API Key：任意（客户端带的 key 会原样转发；也可用环境变量 `TOKENRHYTHM_KEY` 兜底）
  - Model：`glm-5.3` / `kimi-k3` / `kimi-k2.7-code` / `qwen3.8-max` / `seed-2.1-pro` / `deepseek-flash` …

## 3. 开机自启（已配好）

已注册计划任务 **`tokenrhythm-cors-proxy`**（登录时触发，隐藏窗口，失败自动重启 3 次）：

```powershell
# 查看状态
Get-ScheduledTask -TaskName tokenrhythm-cors-proxy | Select-Object TaskName, State
# 手动跑一次
Start-ScheduledTask -TaskName tokenrhythm-cors-proxy
```

**重启电脑后什么都不用做**：登录即自动拉起。
若怀疑没起来，手工跑一次（幂等，会先停旧实例再启动）：

```powershell
pwsh -File .agents/start-cors-proxy.ps1
```

日志：`%TEMP%\tokenrhythm-cors-proxy.log`（与 `.err.log`）。

## 4. 小希版配置（已改）

文件：`%APPDATA%\HarnessXiaoxi\engine\settings.yaml`，provider `custom-de36a4f7-…`（displayName `jiyuan`）：

```yaml
baseURL: http://127.0.0.1:8047/v1      # 原来是 https://tokenrhythm.studio/v1
models:
  - deepseek-flash
  - qwen3.7-flash
  - kimi-k3
  - kimi-k2.7-code
  - glm-5.3
  - qwen3.8-max
  - seed-2.1-pro
```

- **改完需要重启小希版**（或在它的设置界面重新选一次该 provider）才会生效。
- 配置改动前已自动备份：`settings.yaml.bak-<时间戳>`。

### 如果配置被应用覆盖回去
小希版可能在后来的保存中写回自己的内存副本。跑这一条即可复原（幂等、会先备份）：

```powershell
python .agents/fix-xiaoxi-baseurl.py
```

## 5. 不想用代理的替代方案

把你已有的**本地模型池**地址填进去 —— 它自带 CORS（实测 `ACAO=*`）：

```
Base URL: http://127.0.0.1:8046/v1
```

代价：只有 6 个 deepseek 系模型（`deepseek-chat` / `deepseek-reasoner` / `deepseek-v4-pro` / `deepseek-flash` / `deepseek-v4.1-flash` / `deepseek-v4.1-flash-nothinking`），拿不到 glm / kimi / qwen / seed。
**好处**：不需要额外进程（前提是你那个池本来就常驻）。

## 6. 安全备注

- 代理**只监听 `127.0.0.1`**，不对外暴露；日志**不打印 key**。
- 键存在小希版的 `.credentials.yaml`（`refs.CUSTOM_DE36A4F7_…`），本次未改动（实测该 key 有效，200）。
