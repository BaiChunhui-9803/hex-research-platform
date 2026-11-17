# 756局整合验证汇总

实际运行：11场景、28种方法的适用组合、种子26/27/28、每次规划32次候选评价上限。地铁324局，小队432局，756条记录均复现最终指标。

## 如何阅读

- 对照同一问题与场景内的构造基线；单目标、多目标与原生控制的目的不同。
- 这里只作描述性整合检查。3个种子和大量方法比较不足以支持普遍优越或统计显著性结论。
- 地铁动态场景多次规划，评价次数为全回合累计；原生控制用预算作为迭代上限，不能与搜索方法的评价次数直接等同。
- 相对得分变化仅在基线得分为正时计算；基线为零或负值时保留绝对差值。

## 每场景的最高观察均值得分（共享搜索方法内）

| 问题 | 场景 | 最高观察均值 | 并列方法 |
|---|---|---|---|
| metro | compact | 389.08 | pso-inertia |
| metro | lumen | 775.58 | annealing |
| metro | rush | 1225.64 | hill-climb |
| metro | growth | 454.06 | nsga2 |
| metro | growth-rush | 710.04 | random-search |
| skirmish | contact | 1050.67 | shade |
| skirmish | mixed | -167.92 | shade |
| skirmish | crossfire | 1179.83 | shade |
| skirmish | pass | -113.33 | hill-climb, tabu |
| skirmish | triad | 1135.67 | jde |
| skirmish | asymmetric | 695.17 | pso-inertia |

## 原始数据与差值

[地铁JSON](metro.json) / [地铁CSV](metro.csv) / [小队JSON](skirmish.json) / [小队CSV](skirmish.csv) / [相对构造基线的逐场景差值](comparison-deltas.csv)。

均值与样本标准差保存在JSON的summary。多目标归档、目标定义、实现参数及部署规则保存在searchDetail。规划评价目标不能与完成整局后的指标混为同一层结果。
