# HTTP API

默认地址：`http://127.0.0.1:4175`。JSON输入输出；错误返回`{error: string}`及4xx。服务只监听本机。

## 发现接口

| 方法与路径 | 内容 |
|---|---|
| GET `/api/health` | 平台版本与模块数量 |
| GET `/api/problems` | 问题、场景、配置字段、能力和指标 |
| GET `/api/problems/{problemId}` | 单个问题元数据 |
| GET `/api/methods?problemId=metro&scenarioId=growth` | 所有方法及`compatible/reasons` |
| POST `/api/difficulty` | 评估场景的编码、结构规模、预算难度和融合交互。见[评估协议](difficulty.md) |

## 环境会话

创建：

```json
{"problemId":"skirmish","config":{"scenarioId":"contact","seed":26,"horizon":90,"team":"blue","opponent":"focus"},"methodId":"squad.focus","evaluations":16}
```

POST到`/api/sessions`，返回201和`id`。省略`methodId`为手动会话。

| 方法与路径 | 输入／说明 |
|---|---|
| GET `/api/sessions/{id}` | 完整视图，含显示用renderState |
| GET `/api/sessions/{id}/observe` | 算法观察；外部控制器优先使用 |
| POST `/api/sessions/{id}/step` | `{"steps":5}`；1—1000个逻辑步 |
| POST `/api/sessions/{id}/actions` | `{"action":...}`；提交成功后切换手动控制 |
| POST `/api/sessions/{id}/controller` | `{"methodId":"hill-climb"}`；null为手动 |
| GET `/api/sessions/{id}/replay` | 导出当前记录 |
| DELETE `/api/sessions/{id}` | 释放环境 |

地铁1步=1分钟，战斗1步=0.1秒。地铁horizon可为60/120/180/240分钟；战斗horizon为10—90秒。最多20个HTTP会话，创建时清理30分钟未访问的旧会话。

### 地铁动作

```json
{"action":{"type":"set-plan","plan":{"lines":[{"id":"A","stops":["s0","s5","s6"]},{"id":"B","stops":[]},{"id":"C","stops":[]}]}}}
```

### 小队动作

```json
{"action":{"type":"commands","orders":[{"unitIds":["blue-1","blue-2"],"type":"attack","targetId":"orange-1"}]}}
```

支持move、attackMove、attack、hold。移动目标为`target:{q,r}`。一次最多100条命令，任一命令无效时整批不生效；只能控制配置中的己方。

### 融合问题

`GET /api/problems/fusion` 返回两种来源问题、30 个地图组合和各组合的能力。创建会话的示例为

```json
{
  "problemId": "fusion",
  "config": {
    "scenarioId": "growth--triad", "seed": 26, "coupling": "both",
    "metroHorizon": 180, "metroEditBudget": 45, "skirmishHorizon": 60,
    "skirmishTeam": "violet", "metroWeight": 55
  },
  "methodId": "nsga2",
  "evaluations": 16
}
```

手动动作把原动作包在 `component` 外壳中。下面的例子针对控制蓝方的小队。

```json
{"action":{"type":"component","component":"skirmish","action":{"type":"commands","orders":[{"type":"hold","unitIds":["blue-1"]}]}}}
```

观察包含 `components.metro`、`components.skirmish` 和 `links`。结果中的原生指标分别以 `metro.`、`skirmish.` 开头。步长为一个融合周期，两个组件的本地时间在视图中独立报告。继续复用作业、CSV 和回放接口。更多配置和权重定义见 [融合规则](fusion.md)。

## 统一实验

POST `/api/jobs`：

```json
{"problemId":"metro","scenarioIds":["compact","growth"],"methodIds":["constructive","random-search","hill-climb","annealing"],"seeds":[26,27,28],"evaluations":16,"config":{"horizon":180,"objective":"balanced","editBudget":60}}
```

返回202和作业ID。每个方法在相同场景、种子与其他配置下从头运行。共享优化预算为每次规划1—4096次候选评价；专用地铁策略将该数作为迭代预算，其初始化评价另计。

- GET `/api/jobs/{id}`：running/done/error/cancelled、progress和完整report。
- DELETE `/api/jobs/{id}`：终止正在运行的Worker。
- GET `/api/jobs/{id}/json`、`/csv`：导出完整结果／逐回合指标。
- GET `/api/runs`：最近30个持久化记录的元数据及文件URL。
- POST `/api/replays/verify`：提交导出的回放，重新执行记录并比较最终指标。

最多两个实验Worker并行、单作业120回合、10种子、28方法、120秒计算时间。地铁动态专用策略不能与静态场景混选；提交不兼容组合返回400并解释原因。

结果使用`version/request/metricSchema/results/summary`公共外壳。指标仍由问题定义，汇总按问题、场景、方法和其他关键配置分组；单种子标准差为null，不伪装成0。录制的是搜索部署结果与实际动作，回放不再搜索。

网页本地会话与HTTP会话相互独立，均使用相同PlatformSession和适配器。浏览器中的问题切换不会操纵已创建的HTTP会话。

## 0.2版方法与参数

`/api/methods`支持objective、category、family、variant、q及compatible=true筛选，并返回层级、文献键及实现说明。创建会话、控制器切换与实验均支持evaluations（1—4096）与populationSize（0—128，0为自动）。预算包含初始化；不同变体默认种群可能不同。

实时HTTP推进单次限制10秒，重计算建议使用独立实验API。浏览器大选择会分成最多120回合的顺序作业；HTTP单个作业仍保留120回合限制。

向量方法要求vector-optimization/v1及unit-box-encoding；多目标还要求pareto-objectives。视图／结果的searchDetail保存编码、维度、实现参数、非支配归档和部署规则。多目标均最小化问题声明的目标，然后在归档中按部署分数选一项继续游戏。
