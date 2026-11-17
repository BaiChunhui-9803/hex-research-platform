# 统一平台整合验证

实际运行132局；11个场景；4种共享方法；种子26, 27, 28；每次规划最多8个候选评价。两种问题的指标和目标分别定义，表中地铁主指标为服务得分，小队主指标为胜率。

本轮用于验证共享方法、问题适配和记录流程；3个种子不构成算法优越性或人的训练难度证据。动态地铁在当前可见站点上使用30分钟预测，搜索评价次数会随决策次数累计；小队搜索为完整仿真上的控制策略参数优化。

| 问题 | 场景 | 方法 | n | 主指标均值 | 样本标准差 |
|---|---|---|---|---|---|
| metro | compact | constructive | 3 | 359.987 | 65.563 |
| metro | compact | random-search | 3 | 359.987 | 65.563 |
| metro | compact | hill-climb | 3 | 372.827 | 68.233 |
| metro | compact | annealing | 3 | 372.560 | 76.475 |
| metro | lumen | constructive | 3 | 742.683 | 88.339 |
| metro | lumen | random-search | 3 | 742.683 | 88.339 |
| metro | lumen | hill-climb | 3 | 752.830 | 79.534 |
| metro | lumen | annealing | 3 | 752.797 | 71.494 |
| metro | rush | constructive | 3 | 1143.933 | 73.950 |
| metro | rush | random-search | 3 | 1143.933 | 73.950 |
| metro | rush | hill-climb | 3 | 1196.157 | 81.404 |
| metro | rush | annealing | 3 | 1161.083 | 45.027 |
| metro | growth | constructive | 3 | 448.437 | 94.642 |
| metro | growth | random-search | 3 | 448.437 | 94.642 |
| metro | growth | hill-climb | 3 | 425.163 | 81.377 |
| metro | growth | annealing | 3 | 410.587 | 71.712 |
| metro | growth-rush | constructive | 3 | 692.220 | 178.439 |
| metro | growth-rush | random-search | 3 | 692.220 | 178.439 |
| metro | growth-rush | hill-climb | 3 | 621.020 | 127.741 |
| metro | growth-rush | annealing | 3 | 608.483 | 85.052 |
| skirmish | contact | constructive | 3 | 0.000 | 0.000 |
| skirmish | contact | random-search | 3 | 1.000 | 0.000 |
| skirmish | contact | hill-climb | 3 | 0.667 | 0.577 |
| skirmish | contact | annealing | 3 | 0.333 | 0.577 |
| skirmish | mixed | constructive | 3 | 0.000 | 0.000 |
| skirmish | mixed | random-search | 3 | 0.000 | 0.000 |
| skirmish | mixed | hill-climb | 3 | 0.000 | 0.000 |
| skirmish | mixed | annealing | 3 | 0.000 | 0.000 |
| skirmish | crossfire | constructive | 3 | 0.333 | 0.577 |
| skirmish | crossfire | random-search | 3 | 1.000 | 0.000 |
| skirmish | crossfire | hill-climb | 3 | 0.333 | 0.577 |
| skirmish | crossfire | annealing | 3 | 0.667 | 0.577 |
| skirmish | pass | constructive | 3 | 0.000 | 0.000 |
| skirmish | pass | random-search | 3 | 0.000 | 0.000 |
| skirmish | pass | hill-climb | 3 | 0.000 | 0.000 |
| skirmish | pass | annealing | 3 | 0.000 | 0.000 |
| skirmish | triad | constructive | 3 | 0.000 | 0.000 |
| skirmish | triad | random-search | 3 | 0.667 | 0.577 |
| skirmish | triad | hill-climb | 3 | 0.000 | 0.000 |
| skirmish | triad | annealing | 3 | 0.000 | 0.000 |
| skirmish | asymmetric | constructive | 3 | 0.000 | 0.000 |
| skirmish | asymmetric | random-search | 3 | 0.333 | 0.577 |
| skirmish | asymmetric | hill-climb | 3 | 0.000 | 0.000 |
| skirmish | asymmetric | annealing | 3 | 0.000 | 0.000 |
