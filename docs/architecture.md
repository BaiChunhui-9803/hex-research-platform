# 统一平台架构

平台的两个一级对象是 **Problem（问题）** 和 **Method（方法）**。实验、可视化和HTTP服务围绕这两个对象工作。

```text
                 Problems registry            Methods registry
                 /              \             /             \
              Metro          Skirmish     Shared search    Native policies
                |                |          algorithms     (declared ports)
                +------ Environment / SearchTask contracts -------+
                                        |
                          PlatformSession / Experiment runner
                           /              |                 \
                  Browser Web Worker   HTTP sessions     Job Worker
                         |                                |
                  Pluggable views               Metrics / JSON / CSV / replay
```

## 分层责任

| 层 | 负责 | 不负责 |
|---|---|---|
| `engines/` | 原项目确定性规则、原生算法与画面实现的固定快照 | 平台导航、通用方法选择 |
| `problems/` | 场景、配置、观察、合法动作、候选解、邻域、目标与评价 | 共享搜索算法实现 |
| `methods/` | 方法逻辑、参数、所需接口与能力声明 | 地铁约束和战斗规则 |
| `core/` | 统一会话、能力匹配、实验调度、指标聚合、记录格式 | 按问题ID写业务分支 |
| `web/views/` | `mount/update/render/dispose`、问题专属画面和输入 | 实验调度、HTTP作业管理 |
| `web/app.js` | 发现问题、表单、方法库、比较与导出 | 线路规则和单位伤害 |
| `server/` | 本机API、会话生命周期、独立实验Worker、结果持久化 | 问题业务规则 |

## 两种方法接口

`optimization/v1` 是共享优化接口。问题模块提供 `initial/sample/mutate/evaluate`，方法只操作不透明候选解，比较 `valid/score`。四个共享实现没有针对metro/skirmish的业务分支。

- 静态地铁：候选解是线路停站序列，评价使用已知固定需求流。
- 动态地铁：按站点开放和30分钟周期触发，只在当前可见站点与独立预测需求上评价；原真实未来需求流不交给方法。
- 小队作战：候选解是目标排序、集火、风筝与撤退阈值等控制参数，评价为固定对手下的确定性完整仿真。这是**控制策略参数搜索**，不是原子动作序列规划。部署参数后，控制器每0.5秒依据当前观察产生实际命令。

`metro-policy/v1` 和 `squad-policy/v1` 是原生在线策略接口。专用策略进入同一方法库，但仅与匹配的接口兼容；动态修线还声明`dynamic-stations`能力要求。

“可跨问题调用”来自公共优化契约，并不表示原始动作、候选编码和指标单位相同。不同问题不合并排行榜；指标方向、单位由问题声明。

## 运行与回放

网页的实时环境在Web Worker中运行，重置会终止旧Worker；后台比较在Node Worker中运行，可以取消。HTTP会话为独立无界面环境，与网页实时会话共享相同契约和规则，但不相互控制。

记录包含配置、种子、方法、规划结果、控制权变化和动作时刻。回放执行已记录的方案和动作，不重新调用搜索，也不因机器速度改变规划结果。元数据版本为`hex-research/v1`；规则或适配语义改变后应更新版本并重新验证旧记录。

`renderState`供画面使用，可能包含不可见站点或评估数据；外部算法应读取`observe`或SearchTask接口。两者有意分开。

## 保留原项目

原地铁和小队项目没有移动或修改。新平台位于兄弟目录，运行时使用`engines/`内的41个固定源文件快照，不依赖原目录存在。`engines/provenance.json`记录来源及SHA-256；测试核验全部快照。适配代码在`problems/`内，便于以后有意升级引擎。

运行时无第三方依赖，需要Node.js 20+。当前为本机研究平台，不包含远程多人联机、用户权限或任意代码上传执行服务。

## 0.2版新增

增加vector-optimization/v1、归一化编码与Pareto目标能力。现有20种搜索方法、8种领域控制，层级元数据在methods中维护；过滤逻辑浏览器与API共用。工作区采用浅色画面优先，独立Problems入口保留CoG式展示语言。

算法接入与论文来源见[期刊证据库](evolutionary-baselines-20261115/index.html)。原始规则引擎快照不变，版本v1记录继续通过执行已记录动作回放；新字段为可选扩展。
