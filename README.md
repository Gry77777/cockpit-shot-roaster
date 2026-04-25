# 截图吐槽机

一个桌面端 `Electron + React + TypeScript` 小工具。

它会只读监听你当前的 `Codex` 账号状态，读取你主动选择的截图，然后生成：

- 一句吐槽
- 一段正经总结
- 3 个适合分享的标题

整个过程不会修改 `Cockpit Tools` 的源码，也不会写回它原本的账号逻辑。

## 项目特点

- 只读联动 `Codex` 当前账号
- 支持点击选图和拖拽导入
- 输出固定为简体中文
- 支持 `毒舌 / 温柔 / 打工人` 三种语气
- 支持导出分享卡 PNG
- 本地保留最近 6 条历史记录
- 可直接打包为 Windows 安装版

## 现在能做什么

1. 打开桌面应用
2. 拖入一张截图，或者点击选择图片
3. 选择语气
4. 点击 `开始分析`
5. 复制结果，或者导出分享卡

## 技术栈

- `Electron`
- `React`
- `TypeScript`
- `Vite`
- `Vitest`

## 目录结构

```text
electron/        Electron 主进程与本地服务接入
src/             React 界面与前端逻辑
build/           应用图标等打包资源
release/         Windows 打包产物（本地生成）
```

## 本地开发

```bash
npm install
npm run dev
```

开发模式下前端由 Vite 提供，桌面窗口通过 Electron 启动。

## 生产构建

```bash
npm run build
npm run preview
```

`preview` 会直接启动构建后的桌面版。

## 打包安装版

```bash
npm run package:win
```

打包完成后会在 `release/` 下生成：

- `shot-roaster-setup-<version>.exe`：Windows 安装包
- `win-unpacked/`：免安装可执行目录

## 认证说明

应用会按这个顺序尝试获取可用认证：

1. 你在界面里手动填写的 `OpenAI API Key`
2. 系统环境变量里的 `OPENAI_API_KEY`
3. 当前 `Codex` 本地接入

如果本地 `Codex` 接入不可用，可以直接在界面右侧填入自己的 API Key。

## Cockpit / Codex 联动说明

这个项目的原则是：

- 只读监听
- 不改 `Cockpit Tools` 源码
- 不破坏它原本的切号逻辑

当前实现会读取本机 `Codex` 账号状态，并在桌面应用里自动同步显示当前账号。

## 测试

```bash
npm test
```

目前包含：

- 前端界面行为测试
- 账号读取测试
- 分析结果解析测试
- 分享卡生成测试

## 适合放在 GitHub 的原因

这个项目不是“大而全”的 AI 工具，而是一个很适合展示的 `vibecoding` 小项目：

- 一眼能看懂用途
- 有明确输入输出
- 有桌面软件形态
- 有分享导出能力
- 有继续迭代的空间

## 后续可继续扩展

- `Ctrl+V` 直接粘贴截图
- 结果二次改写
- 更多输出语气
- 历史结果搜索
- 一键复制为社交平台文案
