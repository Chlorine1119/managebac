# MB Grade Filler (ManageBac 自动登分扩展)

Chrome Extension (Manifest V3)，用于在 ManageBac 成绩页面执行 **Grab → Check → Fill** 批量登分流程。

## 功能

- 从 Excel 粘贴姓名+分数（Tab 分隔）
- 上传 CSV / Excel (.xlsx) 文件导入分数
- 单列分数按页面学生顺序映射
- 自动解析 MB 页面学生列表
- 多层姓名匹配（精确 / 归一化 / 包含 / 编辑距离）
- 模糊与未匹配支持人工修正
- 自动填入并模拟 input/change/blur 事件
- 200~500ms 随机节奏填入
- 平行班复用（缓存上次数据）
- 本地学习姓名映射（`chrome.storage.local`）

## 项目结构

```text
managebac/
├── manifest.json
├── popup/
│   ├── index.html
│   ├── index.js
│   └── styles.css
├── content/
│   ├── mb-detector.js
│   ├── mb-parser.js
│   └── mb-filler.js
├── background/
│   └── service-worker.js
├── utils/
│   ├── csv-parser.js
│   ├── name-matcher.js
│   └── selectors.js
├── assets/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── mock/
│   └── grade-page.html
└── README.md
```

## 本地加载（开发模式）

1. 打开 Chrome：`chrome://extensions`
2. 打开右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本项目根目录 `managebac/`

## 使用流程

1. 打开 ManageBac 成绩录入页面（班级 / 作业）
2. 点击扩展图标，进入 Step 1
3. 粘贴 Excel 两列数据（姓名 + 分数）或上传 CSV
4. Step 2 核对匹配结果，必要时手动修正
5. Step 3 执行自动填入
6. 在 MB 页面人工检查后点击保存

> 说明：扩展 **不会自动点击保存按钮**。

## 数据与安全

- 不存储 MB 密码
- 不上传学生成绩到外部服务器
- 数据处理全部在本地完成
- `chrome.storage.local` 仅保存：
  - 姓名映射
  - 最近一次平行班缓存
  - 填入历史摘要

## 选择器校准说明（重要）

`utils/selectors.js` 中的选择器是基于常见结构的占位值。因为不同学校 MB 页面可能存在差异，请在真实页面中校准：

- `gradePage.indicator`
- `studentList.row / nameCell / gradeInput`
- `pageInfo.className / taskName`

## 测试建议

- 纯函数：`utils/csv-parser.js`、`utils/name-matcher.js`
- 模拟页：`mock/grade-page.html`
- 真实页：老师账号手动走完整流程

## 当前 MVP 范围

- ✅ 粘贴 / CSV 导入
- ✅ 匹配确认
- ✅ 批量填入
- ✅ 平行班复用
- ❌ 自动保存
- ❌ 远程同步
- ❌ OCR / 语音等高级输入
