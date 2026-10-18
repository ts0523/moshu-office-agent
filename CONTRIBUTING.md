# 参与贡献

感谢你有兴趣改进墨枢 Office Agent。这个项目遵循 [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) 的行为准则。

## 开发流程

```bash
npm install
npm run typecheck      # 提交前必须通过
npm run app:dev        # 边改边看
```

1. Fork 并新建分支：`feat/xxx`、`fix/xxx`、`docs/xxx`
2. 保持改动聚焦，一个 PR 解决一件事
3. 提交前跑 `npm run typecheck`；涉及界面的改动请附截图或短视频
4. 提交信息用中文或英文均可，说明「改了什么 / 为什么」

## 代码约定

- 界面文案一律中文，标识符和专有名词保留英文
- 新格式要同时更新 `src/lib/formats.ts` 的能力矩阵和 `writers.ts` 的序列化分支
- 新增 CLI 命令：先加到 `src/lib/agent.ts` 的动作分发，再在 `cli/oa.mjs` 里暴露入口，并同步 `printHelp()`
- 不要引入需要联网才能运行的依赖；离线可用是这个项目的底线

## 不要提交

- 任何 API Key、Token、私有网关地址
- `node_modules/`、`dist/`、`release/`、`.chrome-*/`、`dev.log`（`.gitignore` 已覆盖）
- 你自己工作区里的文档

## 报告问题

请提供：系统与 Node 版本、复现步骤、期望行为、实际行为，以及相关日志。贴日志前先检查有没有密钥或私人路径。
