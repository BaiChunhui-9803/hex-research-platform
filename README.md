# HEX Research Platform：问题与方法统一研究平台

0.2版融合地铁网络规划与小队作战两个已有项目，使用共同的问题、方法、会话、实验、可视化生命周期和HTTP接口。网页保持英文，开发说明使用中文。

[打开在线平台](https://baichunhui-9803.github.io/hex-research-platform/) · [个人主页](https://baichunhui-9803.github.io/)

在线版直接在浏览器中运行两个游戏、算法比较和回放，支持导入报告以及导出 JSON、CSV。HTTP API 通过本地 Node 服务提供。

## 启动

需要Node.js 20+，无第三方运行依赖。

```sh
npm start
```

打开 **http://127.0.0.1:4175**。原地铁4173、小队4174继续独立可用，原目录与结果均保留。

```sh
npm test
npm run build:pages            # 生成 GitHub Pages 静态站点
npm run benchmark               # 保留原4方法、132局兼容验证
npm run benchmark:evolutionary  # 28方法适用组合、11场景、3种子 = 756局
npm run analyze:evolutionary    # 逐场景差值、描述性汇总
node scripts/benchmark.js 26     # 单种子整合验证
python examples/python_client.py
```

## 怎么使用

1. **Problems**：切换Metro Network／Squad Tactics，选择地图、种子与Episode settings；重置后应用。
2. 可以手动运行、暂停和步进，也可以选择方法并点击Use selected method，再开始运行。
3. 地铁：选线路和端点后续接；拖动停站替换；支持清空和撤销。战斗：点击／框选己方，右键敌人集火或地面移动，支持多选、攻击移动、原地防守、缩放和平移。
4. **Methods**：查看28种方法，按目标、类别、家族、变体级联筛选。20种共享搜索方法可用于两问题；四个地铁策略仅适用于动态地铁，四个小队策略仅适用于小队问题。界面和API均拒绝不兼容组合。
5. **Experiments**：选择场景、方法和种子，在同一条件下从头比较。后台Worker可以取消；完成后查看均值／标准差、逐局结果，下载JSON／CSV，点击Replay观看记录。
6. 可以导出当前会话记录，并在Import report中载入记录或完整实验结果。回放为只读，Reset episode回到可操作环境。
7. **API**：查看发现、控制和实验端点。HTTP和浏览器本地会话独立，但使用相同规则与适配层。

## 问题与方法如何分离

| 对象 | 主要责任 |
|---|---|
| Problem | 定义场景、观察、合法动作、候选解、约束、邻域、目标及指标 |
| Method | 实现搜索或策略，声明所需协议与能力，不写共享业务分支 |
| PlatformSession | 驱动固定步长、控制权变化、方法决策和记录 |
| ProblemView | 插件式mount/update/render/dispose；地铁SVG与战斗Canvas共用外壳 |
| Experiment | 配对场景和种子、独立执行、按问题聚合并保存回放 |

共享方法包括基础／轨迹搜索、GA、DE与jDE／JADE／SHADE／L-SHADE、两种PSO、CMA-ES，以及NSGA-II、SPEA2、MOEA/D。通用方法不包含问题ID业务分支；问题提供原生候选或归一化向量编码、约束与评价函数。地铁向量为随机键适配，多目标方法保留非支配归档并显式记录部署选择。小队上的共享优化任务是控制策略参数搜索；动态地铁则在当前可见站点上做滚动预测，不是将两种问题硬改成相同动作。

各问题保留有意义的指标和单位，不把送达率与战斗胜率混成总排行榜。原问题约束与规则引擎保留；新平台的策略参数搜索属于新增适配功能。

## 目录与扩展

```text
core/          会话、协议匹配、实验、汇总与回放
problems/      metro / skirmish问题适配与注册
methods/       共享优化器、专用策略及注册
engines/       41个原引擎与画面文件固定快照、来源哈希
web/           英文统一外壳、独立主题、实时Worker与画面插件
server/        本机HTTP API、实验Worker和结果持久化
tests/         规则保留、跨问题运行、原子动作、回放与HTTP验证
scripts/       11场景整合实验入口
examples/      Python标准库外部控制示例
experiments/   实际实验结果、JSON、CSV及按场景汇总
docs/          架构、类型契约、API、扩展及验证说明
```

[架构](docs/architecture.md) · [扩展指南](docs/extensions.md) · [API](docs/api.md) · [类型契约](docs/contracts.d.ts) · [整合验证](docs/verification.md)

界面研究：[22个游戏与B/S页面参考](https://baichunhui-9803.github.io/hex-research-platform/docs/design-reference-library-20261115/index.html) · [字体、布局与复现分析](https://baichunhui-9803.github.io/hex-research-platform/docs/design-reference-library-20261115/report.zh-CN.html) · [三个可运行布局原型](https://baichunhui-9803.github.io/hex-research-platform/docs/design-reference-library-20261115/prototypes/index.html) · [当前设计方向](docs/design-direction.md)。

增加新问题时实现Problem和ProblemView并注册；增加通用算法时实现Method并注册。通用会话、HTTP服务和实验界面无需按问题ID扩展分支。

当前是本机可扩展研究原型，未实现远程多人联机、账户系统或任意算法代码在线上传。算法对局指标描述仿真表现；本次整合验证不作为人的训练难度或学习收益证据。

## 发布维护

项目仓库的 `main` 分支触发 [Pages 发布流程](.github/workflows/pages.yml)。流程先执行测试，再用 `npm run build:pages` 构建 `dist/` 并发布。构建目录采用相对地址，可在仓库子路径部署。

个人主页的项目链接维护在 [BaiChunhui-9803.github.io](https://github.com/BaiChunhui-9803/BaiChunhui-9803.github.io) 的 `README.md` 中。平台代码、文献和预置实验结果在本仓库更新。在线参考页保留22个案例的说明、原站与源码链接以及三个可运行原型，本机参考库还保存原始截图与采集资料。

## 演化算法与期刊证据

[130篇期刊证据库](docs/evolutionary-baselines-20261115/index.html) · [选择与适配说明](docs/evolutionary-baselines-20261115/review.zh-CN.md) · [期刊CSV](docs/evolutionary-baselines-20261115/journal-references.csv) · [BibTeX](docs/evolutionary-baselines-20261115/journal-references.bib) · [756局结果](experiments/2026-11-15-evolutionary-baselines/summary.zh-CN.md)。

130篇均核验题录，含100篇分年TEVC样本；8项会议、报告与官方资料独立列出。关键方法选读，未声称全部全文精读。引文覆盖不是基准采用率。交互默认预算与种群为有界适配，不是官方CEC竞赛提交。
