# 演化优化基准、文献证据与平台接入

核验截止：2026年11月15日。面向HEX的问题／方法平台，重点参考IEEE TEVC期刊、CEC历届方法与组织者资料。

本轮完成了两项相互关联的工作：**将推荐的清爽游戏式设计落实到主平台；将方法库扩展到28种，并提供目标、类别、家族、变体和问题适用性的分层筛选。** 文献库核验130篇独立期刊论文，其中112篇来自IEEE TEVC；另列8项会议、技术报告或官方资料，不计入130篇。

## 1. 文献依据与“常用基准”的证据边界

文献库由两部分组成：

1. **100篇分年TEVC样本**：2022—2026检索年份，每年完整Crossref结果池中按固定SHA-256排序取20篇，跨年DOI去重。算法名称不参与抽样。另排除编辑性内容、期刊／学会信息页、投稿须知与无作者的行政记录，数据库的journal-article标签本身不作为研究论文充分条件。
2. **30篇原始方法、综述与比较规范论文**：覆盖DE、PSO、CMA-ES、NSGA-II、MOEA/D、参数控制、约束与基准方法论等。

所有主体记录均核到期刊类型、题名、作者、DOI和出处；本轮没有声称130篇全部精读全文。逐项注明题录／引文编码，或关键摘要、方法段落与作者官方说明选读。分层检索年与线上／正式卷期年份可能不同，表中保留来源与年份口径。

**引用频次、实际比较实验采用率和算法性能是三件不同的事。** 本次100篇样本中，86篇有可解析的参考文献条目，14篇没有足够引文元数据。统计识别代表DOI与明确方法名，不把缺失记为“没使用”，也不把引用自动认定为基准采用。

因此，本文不写“某算法被全领域大多数研究采用”这一无法由当前数据证明的结论。方法选择结合三条证据：**原始定义与机制覆盖、期刊综述和比较研究、CEC组织者及作者的公开资料**。分年等额样本也不是全刊实际发文比例估计。

## 2. 为什么建议采用这些基准家族

| 层次 | 建议方法 | 用途与理由 |
|---|---|---|
| 基础参照 | 构造基线、随机搜索、爬山、模拟退火 | 判断复杂方法相对简单构造和局部改进的增益 |
| 机制覆盖的单目标组合 | Real-coded GA、DE/rand/1/bin、PSO、CMA-ES | 覆盖重组选择、差分变异、群体协同、分布／协方差适应 |
| 现代DE对照 | jDE、JADE、SHADE、L-SHADE | 分别覆盖个体参数自适应、成功均值、成功历史和种群缩减 |
| 多目标组合 | NSGA-II、SPEA2、MOEA/D | 分别覆盖非支配排序、强度与密度、目标分解 |
| 在线领域策略 | 4种地铁策略、4种小队策略 | 保留问题原有的在线启发式参照；不伪装成CEC通用优化器 |

最低限度的单目标比较，建议从**随机搜索＋GA＋DE＋PSO＋CMA-ES**开始，而不是只在同一家族的多个小变体之间比较。研究DE自适应机制时，再引入jDE／JADE／SHADE／L-SHADE。研究送达与轨道／改线代价，或生存与打击之间的取舍时，使用多目标组合。

CEC补充资料明确包含SHADE（2013）、L-SHADE（2014）和jSO（2017）等。作者材料还区分SHADE版本、L-SHADE与修正过的归档代码。这说明“同一家族、同一简称”仍需要记录版本、参数和边界处理。[作者公开版本](https://ryojitanabe.github.io/publication)

jSO、SaDE、CoDE、CLPSO、NSGA-III等已纳入文献依据或后续候选；当前没有把未实现的方法放进可运行名单。NSGA-III特别面向多／众目标情境，当前两个问题各采用两个明确目标，先接入三种互补的多目标核心方法。

## 3. 当前28种方法及分类

| 目标 | 类别／家族 | 已实现方法 |
|---|---|---|
| 单目标 | 基础与轨迹搜索 | Constructive、Random search、Hill climbing、Simulated annealing、Multistart、Tabu |
| 单目标 | 遗传与演化策略 | Real-coded GA、(1+1)-ES、CMA-ES |
| 单目标 | 差分演化 | DE/rand/1/bin、DE/best/1/bin、jDE、JADE、SHADE、L-SHADE |
| 单目标 | 粒子群 | Inertia PSO、Constriction PSO |
| 多目标 | 帕累托排序与强度 | NSGA-II、SPEA2 |
| 多目标 | 分解 | MOEA/D |
| 在线控制 | 地铁专用 | Keep initial network、Greedy extensions、Rebuild and search、Budgeted local repair |
| 在线控制 | 小队专用 | Attack-move、Focus fire、Kite & focus、Random orders |

总计：**17种单目标方法、3种多目标方法、8种领域控制策略**。其中20种搜索方法通过共享协议在两类问题上运行。

主平台的筛选层次为：

> 目标类型 → 类别 → 家族 → 变体，同时选择问题范围、关键词和是否只显示兼容方法。

例如：Single-objective → Evolutionary → Differential evolution → Success history，将定位SHADE；选择Success history + reduction则定位L-SHADE。Multiobjective可进一步区分Pareto ranking与Decomposition。筛选和兼容逻辑同时在浏览器与HTTP API提供。

## 4. 问题和算法怎样继续保持分离

### 4.1 原生候选协议

`optimization/v1`保留原来的`initial/sample/mutate/evaluate`接口。构造、随机、局部、退火、多起点和禁忌方法操作不透明候选解，由问题负责合法性与邻域。

### 4.2 归一化向量协议

`vector-optimization/v1`新增维度、归一化初始向量、解码、评价和目标定义。GA、DE、PSO、CMA-ES和三种多目标方法使用该接口。问题必须声明`unit-box-encoding`；多目标方法还要求`pareto-objectives`。没有这些能力的新问题会被明确标为不兼容。

| 问题 | 向量编码 | 评价与信息范围 |
|---|---|---|
| 地铁 | 每条线、每个当前可见站点的成员／排序随机键；值低于阈值的站点按键排序，截取到线路停站上限 | 静态为固定已知需求下的离线评价；动态只在当前开放站点上使用独立30分钟需求预测 |
| 小队 | 4个实数控制参数＋2个阈值化开关，共6维 | 固定对手的确定性完整仿真；搜索的是控制参数，部署后再在线产生单位命令 |

地铁随机键具有离散解码、截断和约束；小队开关也不连续。因此这里是**经典方法在HEX编码上的有界适配**，不是把游戏直接宣称为CEC标准连续函数。编码差异、无效候选比例和真实模型评价代价都应纳入后续研究。

## 5. 多目标结果怎样进入可玩的环境

多目标方法保留非支配候选归档，不以单一分数替代其搜索机制。为了让一局游戏继续执行，平台在该归档中按当前部署得分选择一项，并记录这一规则。

| 问题情境 | 最小化目标1 | 最小化目标2 |
|---|---|---|
| 静态地铁 | 负的送达人数 | 轨道使用量 |
| 动态地铁 | 负的预测新增送达人数 | 当前决策改线代价 |
| 小队 | 己方生命损失比例 | 敌方剩余生命比例 |

界面展示的是“已评价候选中的非支配归档”，相同目标点合并；它不是全局真实帕累托前沿。动态地铁的归档对应最近一次局部规划，不能与整局累计指标混为一层。

当前SPEA2采用强度、邻域密度与距离截断；NSGA-II采用非支配排序与拥挤距离；MOEA/D采用Tchebycheff分解与邻域更新。三个机制分别实现，而不是给相同的标量搜索换名字。

## 6. 实现与论文实验参数的区别

| 方法 | 当前实现说明 |
|---|---|
| GA | 实数SBX、多项式变异、二元锦标赛和精英保留 |
| jDE | 个体携带F／CR并根据成功选择保留 |
| JADE | current-to-pbest、外部归档、成功F的Lehmer均值与CR算术均值 |
| SHADE | 对应2013核心，CR加权算术历史，历史长度100 |
| L-SHADE | 成功历史、CR加权Lehmer更新、线性种群缩减；历史长度6 |
| PSO | 全局最好拓扑；分别实现递减惯性和收缩系数变体 |
| CMA-ES | 正权重完整协方差与累计步长适应；未包含主动负权重或重启变体 |
| 边界 | 统一归一化空间；DE采用父代－边界中点修复，其余注明裁剪处理 |

默认种群会适应交互预算，初始化也占用评价预算。这里不声称是官方CEC竞赛提交，也不把交互默认参数当作论文中的完整实验设置。正式论文比较需要重新确定评价预算、种群、维度、边界、终止条件、重复次数和统计方案。

界面与API保留这些参数及实现说明；JSON结果中保存维度、编码、实现设置、归档与部署规则。回放执行记录的方案和命令，不重新求解。

## 7. 主平台界面已经落实的改动

- **Problems首页**：CoG式深色展示入口，Noto Serif JP用于展示标题；正文为Inter，数据与短标签为JetBrains Mono。
- **实际工作区**：浅色、紧凑工具条、画面优先；方法说明、实现与文献按需展开。
- **Methods**：目标、类别、家族、变体的级联筛选，兼容性和来源可查。
- **Experiments**：基础／经典／自适应DE／帕累托预设，按类别分组勾选，超过单作业规模后顺序分批运行。
- **数据检查**：保留逐局结果、均值与样本标准差、模型归档及回放，不合并不同问题的排行榜。

字体资源本地保存并带OFL许可。主题色与线路、阵营及警报等语义色分离；原地铁、小队引擎和原项目保留。

## 8. 实验验证及可支持的结论

本轮实际运行**756局**：地铁324局、小队432局，覆盖全部11个场景、适用的28种方法、种子26／27／28。每次规划候选预算32；动态地铁有多次规划，领域策略则按迭代预算运行。756局均核验记录回放的最终指标。

这验证了算法接口、跨问题适配、场景覆盖、数据保存与回放流程。结果还显示最高观察均值随场景变化；但3个种子、轻预算、编码适配和大量比较，不能支持全局最优、普遍优越或人的训练难度结论。

[逐场景汇总与原始数据](../../experiments/2026-11-15-evolutionary-baselines/summary.zh-CN.md)另外给出相对构造基线的差值。基线为零或负数时不强算相对百分比；耗时仅作为本机参考，不作为正式速度优越证据。

## 9. 后续研究如何选算法

1. 先明确单目标还是多目标，区分离线规划与在线控制。
2. 用基础参照判断问题和评分是否合理。
3. 选GA、DE、PSO、CMA-ES等互补机制，保持预算与任务条件一致。
4. 针对某家族机制，再加入自适应或历史变体，避免只选择有利比较对象。
5. 多目标研究评价解集及偏好选择，不只比较最后部署的一局分数。
6. 增加种子、测试地图与对手覆盖，记录失败、无效候选、模型调用与超时。

当前文献与代码是可追踪的起点。要作“某方法被大多数研究作为基准”的发表级声明，还需逐篇编码比较表、明确样本范围并评估缺失，不能直接使用本次引文覆盖替代。

---

以下列出引文统计、130篇期刊题录与逐篇证据范围，以及8项独立补充资料。

## 引文覆盖统计

分母为100篇分年样本中有可解析参考条目的86篇。数字为论文级去重覆盖，同一论文可属于多个家族；不能相加成为总采用率。

| 家族／方法 | 识别篇数 | 分母 | 覆盖比例 |
|---|---|---|---|
| NSGA-II | 32 | 86 | 37.2% |
| MOEA/D | 21 | 86 | 24.4% |
| NSGA-III | 10 | 86 | 11.6% |
| Differential evolution | 9 | 86 | 10.5% |
| CMA-ES | 9 | 86 | 10.5% |
| SPEA2 | 9 | 86 | 10.5% |
| Particle swarm | 7 | 86 | 8.1% |
| SHADE / L-SHADE | 3 | 86 | 3.5% |
| JADE | 2 | 86 | 2.3% |
| jSO | 1 | 86 | 1.2% |
| Real-coded GA | 0 | 86 | 0.0% |

实数GA代表文献在此识别口径下为0，不表示GA没有被使用。缺失题名、对算子的引用、书籍引用及不同表述均可能影响识别；算法选择同时依据原始方法和综述。

## 全部期刊文献

以下130篇均有唯一DOI。会议、报告和官方资料在下一节独立列出。

- **J001** Ali Ahrari, Saber Elsayed, Ruhul Sarker, Daryl Essam, Carlos A. Coello Coello. Static and Dynamic Multimodal Optimization by Improved Covariance Matrix Self-Adaptation Evolution Strategy With Repelling Subpopulations. *IEEE Transactions on Evolutionary Computation*, 2022, 26(3): 527-541. [DOI](https://doi.org/10.1109/tevc.2021.3117116)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J002** Diederick Vermetten, Bas van Stein, Fabio Caraffini, Leandro L. Minku, Anna V. Kononova. BIAS: A Toolbox for Benchmarking Structural Bias in the Continuous Domain. *IEEE Transactions on Evolutionary Computation*, 2022, 26(6): 1380-1393. [DOI](https://doi.org/10.1109/tevc.2022.3189848)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J003** Xiangning Xie, Yuqiao Liu, Yanan Sun, Gary G. Yen, Bing Xue, Mengjie Zhang. BenchENAS: A Benchmarking Platform for Evolutionary Neural Architecture Search. *IEEE Transactions on Evolutionary Computation*, 2022, 26(6): 1473-1485. [DOI](https://doi.org/10.1109/tevc.2022.3147526)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J004** Chunlin He, Yong Zhang, Dunwei Gong, Xianfang Song, Xiaoyan Sun. A Multitask Bee Colony Band Selection Algorithm With Variable-Size Clustering for Hyperspectral Images. *IEEE Transactions on Evolutionary Computation*, 2022, 26(6): 1566-1580. [DOI](https://doi.org/10.1109/tevc.2022.3159253)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J005** Guanghui Zhang, Bo Liu, Ling Wang, Dengxiu Yu, Keyi Xing. Distributed Co-Evolutionary Memetic Algorithm for Distributed Hybrid Differentiation Flowshop Scheduling Problem. *IEEE Transactions on Evolutionary Computation*, 2022, 26(5): 1043-1057. [DOI](https://doi.org/10.1109/tevc.2022.3150771)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J006** Shaolin Wang, Yi Mei, Mengjie Zhang, Xin Yao. Genetic Programming With Niching for Uncertain Capacitated Arc Routing Problem. *IEEE Transactions on Evolutionary Computation*, 2022, 26(1): 73-87. [DOI](https://doi.org/10.1109/tevc.2021.3095261)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J007** Jon Mccormack, Camilo Cruz Gambardella. Growing and Evolving 3-D Prints. *IEEE Transactions on Evolutionary Computation*, 2022, 26(1): 88-99. [DOI](https://doi.org/10.1109/tevc.2021.3095156)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J008** Julia Moosbauer, Martin Binder, Lennart Schneider, Florian Pfisterer, Marc Becker, Michel Lang, Lars Kotthoff, Bernd Bischl. Automated Benchmark-Driven Design and Explanation of Hyperparameter Optimizers. *IEEE Transactions on Evolutionary Computation*, 2022, 26(6): 1336-1350. [DOI](https://doi.org/10.1109/tevc.2022.3211336)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J009** Hongke Zhao, Xinpeng Wu, Chuang Zhao, Lei Zhang, Haiping Ma, Fan Cheng. CoEA: A Cooperative–Competitive Evolutionary Algorithm for Bidirectional Recommendations. *IEEE Transactions on Evolutionary Computation*, 2022, 26(1): 28-42. [DOI](https://doi.org/10.1109/tevc.2021.3091615)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J010** Wenxing Lan, Ziyuan Ye, Peijun Ruan, Jialin Liu, Peng Yang, Xin Yao. Region-Focused Memetic Algorithms With Smart Initialization for Real-World Large-Scale Waste Collection Problems. *IEEE Transactions on Evolutionary Computation*, 2022, 26(4): 704-718. [DOI](https://doi.org/10.1109/tevc.2021.3123960)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J011** Chao Li, Handing Wang, Jun Zhang, Wen Yao, Tingsong Jiang. An Approximated Gradient Sign Method Using Differential Evolution for Black-Box Adversarial Attack. *IEEE Transactions on Evolutionary Computation*, 2022, 26(5): 976-990. [DOI](https://doi.org/10.1109/tevc.2022.3151373)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J012** Zhengping Liang, Xiuju Xu, Ling Liu, Yaofeng Tu, Zexuan Zhu. Evolutionary Many-Task Optimization Based on Multisource Knowledge Transfer. *IEEE Transactions on Evolutionary Computation*, 2022, 26(2): 319-333. [DOI](https://doi.org/10.1109/tevc.2021.3101697)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J013** Ya-Hui Jia, Yi Mei, Mengjie Zhang. Confidence-Based Ant Colony Optimization for Capacitated Electric Vehicle Routing Problem With Comparison of Different Encoding Schemes. *IEEE Transactions on Evolutionary Computation*, 2022, 26(6): 1394-1408. [DOI](https://doi.org/10.1109/tevc.2022.3144142)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J014** Yuxiao Huang, Liang Feng, Alex Kai Qin, Meng Chen, Kay Chen Tan. Toward Large-Scale Evolutionary Multitasking: A GPU-Based Paradigm. *IEEE Transactions on Evolutionary Computation*, 2022, 26(3): 585-598. [DOI](https://doi.org/10.1109/tevc.2021.3110506)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J015** Jiawei Yuan, Hai-Lin Liu, Yew-Soon Ong, Zhaoshui He. Indicator-Based Evolutionary Algorithm for Solving Constrained Multiobjective Optimization Problems. *IEEE Transactions on Evolutionary Computation*, 2022, 26(2): 379-391. [DOI](https://doi.org/10.1109/tevc.2021.3089155)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J016** Tingyang Wei, Shibin Wang, Jinghui Zhong, Dong Liu, Jun Zhang. A Review on Evolutionary Multitask Optimization: Trends and Challenges. *IEEE Transactions on Evolutionary Computation*, 2022, 26(5): 941-960. [DOI](https://doi.org/10.1109/tevc.2021.3139437)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J017** Mathew J. Walter, David J. Walker, Matthew J. Craven. Visualizing Population Dynamics to Examine Algorithm Performance. *IEEE Transactions on Evolutionary Computation*, 2022, 26(6): 1501-1510. [DOI](https://doi.org/10.1109/tevc.2022.3157143)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J018** Ke Shang, Hisao Ishibuchi, Weiyu Chen, Yang Nan, Weiduo Liao. Hypervolume-Optimal μ-Distributions on Line/Plane-Based Pareto Fronts in Three Dimensions. *IEEE Transactions on Evolutionary Computation*, 2022, 26(2): 349-363. [DOI](https://doi.org/10.1109/tevc.2021.3093114)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J019** Xiangyu Wang, Kai Zhang, Jian Wang, Yaochu Jin. An Enhanced Competitive Swarm Optimizer With Strongly Convex Sparse Operator for Large-Scale Multiobjective Optimization. *IEEE Transactions on Evolutionary Computation*, 2022, 26(5): 859-871. [DOI](https://doi.org/10.1109/tevc.2021.3111209)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J020** Jun Yi, Wei Zhang, Junren Bai, Wei Zhou, Lizhong Yao. Multifactorial Evolutionary Algorithm Based on Improved Dynamical Decomposition for Many-Objective Optimization Problems. *IEEE Transactions on Evolutionary Computation*, 2022, 26(2): 334-348. [DOI](https://doi.org/10.1109/tevc.2021.3135691)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J021** Ying Hou, Yilin Wu, Honggui Han. Multiobjective Differential Evolution Algorithm Balancing Multiple Stakeholders for Low-Carbon Order Scheduling in E-Waste Recycling. *IEEE Transactions on Evolutionary Computation*, 2023, 27(6): 1912-1925. [DOI](https://doi.org/10.1109/tevc.2023.3237336)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J022** Alexandru Agapie, Ovidiu Solomon, Luiza Bădin. Theory of (1+1) ES on SPHERE Revisited. *IEEE Transactions on Evolutionary Computation*, 2023, 27(4): 938-948. [DOI](https://doi.org/10.1109/tevc.2022.3217524)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J023** Zhi-Zhong Liu, Yunchuan Qin, Wu Song, Jinyuan Zhang, Kenli Li. Multiobjective-Based Constraint-Handling Technique for Evolutionary Constrained Multiobjective Optimization: A New Perspective. *IEEE Transactions on Evolutionary Computation*, 2023, 27(5): 1370-1384. [DOI](https://doi.org/10.1109/tevc.2022.3194729)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J024** Lixin Tang, Zuocheng Li, Jin-Kao Hao. Solving the Single-Row Facility Layout Problem by K-Medoids Memetic Permutation Group. *IEEE Transactions on Evolutionary Computation*, 2023, 27(2): 251-265. [DOI](https://doi.org/10.1109/tevc.2022.3165987)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J025** Hongyan Chen, Hai-Lin Liu, Fangqing Gu, Kay Chen Tan. A Multiobjective Multitask Optimization Algorithm Using Transfer Rank. *IEEE Transactions on Evolutionary Computation*, 2023, 27(2): 237-250. [DOI](https://doi.org/10.1109/tevc.2022.3147568)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J026** Fan Cheng, Junjie Cui, Qijun Wang, Lei Zhang. A Variable Granularity Search-Based Multiobjective Feature Selection Algorithm for High-Dimensional Data Classification. *IEEE Transactions on Evolutionary Computation*, 2023, 27(2): 266-280. [DOI](https://doi.org/10.1109/tevc.2022.3160458)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J027** Ke Li, Renzhi Chen. Batched Data-Driven Evolutionary Multiobjective Optimization Based on Manifold Interpolation. *IEEE Transactions on Evolutionary Computation*, 2023, 27(1): 126-140. [DOI](https://doi.org/10.1109/tevc.2022.3162993)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J028** Xiao-Fang Liu, Xin-Xin Xu, Zhi-Hui Zhan, Yongchun Fang, Jun Zhang. Interaction-Based Prediction for Dynamic Multiobjective Optimization. *IEEE Transactions on Evolutionary Computation*, 2023, 27(6): 1881-1895. [DOI](https://doi.org/10.1109/tevc.2023.3234113)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J029** Xiangjuan Yao, Qian Zhao, Dunwei Gong, Song Zhu. Solution of Large-Scale Many-Objective Optimization Problems Based on Dimension Reduction and Solving Knowledge-Guided Evolutionary Algorithm. *IEEE Transactions on Evolutionary Computation*, 2023, 27(3): 416-429. [DOI](https://doi.org/10.1109/tevc.2021.3110780)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J030** An Chen, Zhigang Ren, Wenhua Guo, Yongsheng Liang, Zuren Feng. An Efficient Adaptive Differential Grouping Algorithm for Large-Scale Black-Box Optimization. *IEEE Transactions on Evolutionary Computation*, 2023, 27(3): 475-489. [DOI](https://doi.org/10.1109/tevc.2022.3170793)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J031** Jinlong Zhou, Yinggui Zhang, Jinhua Zheng, Miqing Li. Domination-Based Selection and Shift-Based Density Estimation for Constrained Multiobjective Optimization. *IEEE Transactions on Evolutionary Computation*, 2023, 27(4): 993-1004. [DOI](https://doi.org/10.1109/tevc.2022.3190401)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J032** Hao-Gan Huang, Yue-Jiao Gong. Contrastive Learning: An Alternative Surrogate for Offline Data-Driven Evolutionary Computation. *IEEE Transactions on Evolutionary Computation*, 2023, 27(2): 370-384. [DOI](https://doi.org/10.1109/tevc.2022.3170638)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J033** Yong Zhang, Xin-Fang Ji, Xiao-Zhi Gao, Dun-Wei Gong, Xiao-Yan Sun. Objective-Constraint Mutual-Guided Surrogate-Based Particle Swarm Optimization for Expensive Constrained Multimodal Problems. *IEEE Transactions on Evolutionary Computation*, 2023, 27(4): 908-922. [DOI](https://doi.org/10.1109/tevc.2022.3182810)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J034** Xinan Chen, Ruibin Bai, Rong Qu, Haibo Dong. Cooperative Double-Layer Genetic Programming Hyper-Heuristic for Online Container Terminal Truck Dispatching. *IEEE Transactions on Evolutionary Computation*, 2023, 27(5): 1220-1234. [DOI](https://doi.org/10.1109/tevc.2022.3209985)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J035** Adetunji David Ajimakin, V. Susheela Devi. The Competing Genes Evolutionary Algorithm: Avoiding Genetic Drift Through Competition, Local Search, and Majority Voting. *IEEE Transactions on Evolutionary Computation*, 2023, 27(6): 1678-1689. [DOI](https://doi.org/10.1109/tevc.2022.3229038)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J036** Trung B. Nguyen, Will N. Browne, Mengjie Zhang. ConCS: A Continual Classifier System for Continual Learning of Multiple Boolean Problems. *IEEE Transactions on Evolutionary Computation*, 2023, 27(4): 1057-1071. [DOI](https://doi.org/10.1109/tevc.2022.3210872)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J037** Marcin Michal Komarnicki, Michal Witold Przewozniczek, Halina Kwasnicka, Krzysztof Walkowiak. Incremental Recursive Ranking Grouping for Large-Scale Global Optimization. *IEEE Transactions on Evolutionary Computation*, 2023, 27(5): 1498-1513. [DOI](https://doi.org/10.1109/tevc.2022.3216968)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J038** Lei Zhao, Rui Li, Jianda Han, Jianlei Zhang. A Distributed Model Predictive Control-Based Method for Multidifferent-Target Search in Unknown Environments. *IEEE Transactions on Evolutionary Computation*, 2023, 27(1): 111-125. [DOI](https://doi.org/10.1109/tevc.2022.3161942)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J039** Iwo Błądek, Krzysztof Krawiec. Counterexample-Driven Genetic Programming for Symbolic Regression With Formal Constraints. *IEEE Transactions on Evolutionary Computation*, 2023, 27(5): 1327-1339. [DOI](https://doi.org/10.1109/tevc.2022.3205286)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J040** Ke Shang, Weiyu Chen, Weiduo Liao, Hisao Ishibuchi. HV-Net: Hypervolume Approximation Based on DeepSets. *IEEE Transactions on Evolutionary Computation*, 2023, 27(4): 1154-1160. [DOI](https://doi.org/10.1109/tevc.2022.3181306)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J041** Tianyu Ren, Xiao-Jun Zeng. Reputation-Based Interaction Promotes Cooperation With Reinforcement Learning. *IEEE Transactions on Evolutionary Computation*, 2024, 28(4): 1177-1188. [DOI](https://doi.org/10.1109/tevc.2023.3304911)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J042** Lilla Beke, Lourdes Uribe, Adriana Lara, Carlos Artemio Coello Coello, Michal Weiszer, Edmund K. Burke, Jun Chen. Routing and Scheduling in Multigraphs With Time Constraints—A Memetic Approach for Airport Ground Movement. *IEEE Transactions on Evolutionary Computation*, 2024, 28(2): 474-488. [DOI](https://doi.org/10.1109/tevc.2023.3262743)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J043** Xianpeng Wang, Yao Wang, Lixin Tang, Qingfu Zhang. Multiobjective Ensemble Learning With Multiscale Data for Product Quality Prediction in Iron and Steel Industry. *IEEE Transactions on Evolutionary Computation*, 2024, 28(4): 1099-1113. [DOI](https://doi.org/10.1109/tevc.2023.3290172)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J044** Vicente P. Soloviev, Concha Bielza, Pedro Larrañaga. Semiparametric Estimation of Distribution Algorithms for Continuous Optimization. *IEEE Transactions on Evolutionary Computation*, 2024, 28(4): 1069-1083. [DOI](https://doi.org/10.1109/tevc.2023.3290670)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J045** Jing Liang, Zhuo Hu, Zong-Wei Li, Kangjia Qiao, Wei-Feng Guo. Multiobjective Optimization-Based Network Control Principles for Identifying Personalized Drug Targets With Cancer. *IEEE Transactions on Evolutionary Computation*, 2024, 28(5): 1322-1335. [DOI](https://doi.org/10.1109/tevc.2023.3303958)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J046** Chao Qian. Can Evolutionary Clustering Have Theoretical Guarantees?. *IEEE Transactions on Evolutionary Computation*, 2024, 28(5): 1220-1234. [DOI](https://doi.org/10.1109/tevc.2023.3296645)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J047** Juan Zou, Ruiqing Sun, Yuan Liu, Yaru Hu, Shengxiang Yang, Jinhua Zheng, Ke Li. A Multipopulation Evolutionary Algorithm Using New Cooperative Mechanism for Solving Multiobjective Problems With Multiconstraint. *IEEE Transactions on Evolutionary Computation*, 2024, 28(1): 267-280. [DOI](https://doi.org/10.1109/tevc.2023.3260306)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J048** Yuanchao Liu, Jianchang Liu, Jinliang Ding, Shangshang Yang, Yaochu Jin. A Surrogate-Assisted Differential Evolution With Knowledge Transfer for Expensive Incremental Optimization Problems. *IEEE Transactions on Evolutionary Computation*, 2024, 28(4): 1039-1053. [DOI](https://doi.org/10.1109/tevc.2023.3291697)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J049** Qing Li, Xin Yuan, Sannyuya Liu, Lu Gao, Tianyu Wei, Xiaoxuan Shen, Jianwen Sun. A Genetic Causal Explainer for Deep Knowledge Tracing. *IEEE Transactions on Evolutionary Computation*, 2024, 28(4): 861-875. [DOI](https://doi.org/10.1109/tevc.2023.3286666)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J050** Yuhang Wang, Yuyan Han, Yuting Wang, Quan-Ke Pan, Ling Wang. Sustainable Scheduling of Distributed Flow Shop Group: A Collaborative Multi-Objective Evolutionary Algorithm Driven by Indicators. *IEEE Transactions on Evolutionary Computation*, 2024, 28(6): 1794-1808. [DOI](https://doi.org/10.1109/tevc.2023.3339558)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J051** Hengzhe Zhang, Aimin Zhou, Qi Chen, Bing Xue, Mengjie Zhang. SR-Forest: A Genetic Programming-Based Heterogeneous Ensemble Learning Method. *IEEE Transactions on Evolutionary Computation*, 2024, 28(5): 1484-1498. [DOI](https://doi.org/10.1109/tevc.2023.3243172)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J052** Kailai Gao, Cuie Yang, Jinliang Ding, Kay Chen Tan, Tianyou Chai. Distributed Knowledge Transfer for Evolutionary Multitask Multimodal Optimization. *IEEE Transactions on Evolutionary Computation*, 2024, 28(4): 1141-1155. [DOI](https://doi.org/10.1109/tevc.2023.3291874)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J053** Kunjie Yu, Dezheng Zhang, Jing Liang, Boyang Qu, Mengnan Liu, Ke Chen, Caitong Yue, Ling Wang. A Framework Based on Historical Evolution Learning for Dynamic Multiobjective Optimization. *IEEE Transactions on Evolutionary Computation*, 2024, 28(4): 1127-1140. [DOI](https://doi.org/10.1109/tevc.2023.3290485)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J054** Han Huang, Yueting Xu, Yi Xiang, Zhifeng Hao. Correlation-Based Dynamic Allocation Scheme of Fitness Evaluations for Constrained Evolutionary Optimization. *IEEE Transactions on Evolutionary Computation*, 2024, 28(5): 1250-1264. [DOI](https://doi.org/10.1109/tevc.2023.3302897)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J055** Meng Xu, Yi Mei, Fangfang Zhang, Mengjie Zhang. Genetic Programming for Dynamic Flexible Job Shop Scheduling: Evolution With Single Individuals and Ensembles. *IEEE Transactions on Evolutionary Computation*, 2024, 28(6): 1761-1775. [DOI](https://doi.org/10.1109/tevc.2023.3334626)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J056** Xuan Wu, Di Wang, Huanhuan Chen, Lele Yan, Yubin Xiao, Chunyan Miao, Hongwei Ge, Dong Xu, Yanchun Liang, Kangping Wang, Chunguo Wu, You Zhou. Neural Architecture Search for Text Classification With Limited Computing Resources Using Efficient Cartesian Genetic Programming. *IEEE Transactions on Evolutionary Computation*, 2024, 28(3): 638-652. [DOI](https://doi.org/10.1109/tevc.2023.3346969)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J057** Yaqing Hou, Mingyang Sun, Yifeng Zeng, Yew-Soon Ong, Yaochu Jin, Hongwei Ge, Qiang Zhang. A Multiagent Cooperative Learning System With Evolution of Social Roles. *IEEE Transactions on Evolutionary Computation*, 2024, 28(2): 531-543. [DOI](https://doi.org/10.1109/tevc.2023.3268076)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J058** Yan Wang, Liangli Zhen, Jianwei Zhang, Miqing Li, Lei Zhang, Zizhou Wang, Yangqin Feng, Yu Xue, Xiao Wang, Zheng Chen, Tao Luo, Rick Siow Mong Goh, Yong Liu. MedNAS: Multiscale Training-Free Neural Architecture Search for Medical Image Analysis. *IEEE Transactions on Evolutionary Computation*, 2024, 28(3): 668-681. [DOI](https://doi.org/10.1109/tevc.2024.3352641)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J059** Yao Zhou, Bing Hu, Xianglei Yuan, Kaide Huang, Zhang Yi, Gary G. Yen. Multiobjective Evolutionary Generative Adversarial Network Compression for Image Translation. *IEEE Transactions on Evolutionary Computation*, 2024, 28(3): 798-809. [DOI](https://doi.org/10.1109/tevc.2023.3261135)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J060** Ying Bi, Bing Xue, Mengjie Zhang. Genetic Programming-Based Evolutionary Deep Learning for Data-Efficient Image Classification. *IEEE Transactions on Evolutionary Computation*, 2024, 28(2): 307-322. [DOI](https://doi.org/10.1109/tevc.2022.3214503)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J061** Jian-Yu Li, Zhi-Hui Zhan, Yun Li, Jun Zhang. Multiple Tasks for Multiple Objectives: A New Multiobjective Optimization Method via Multitask Optimization. *IEEE Transactions on Evolutionary Computation*, 2025, 29(1): 172-186. [DOI](https://doi.org/10.1109/tevc.2023.3294307)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J062** Yulong Ye, Songbai Liu, Junwei Zhou, Qiuzhen Lin, Min Jiang, Kay Chen Tan. Learning-Based Directional Improvement Prediction for Dynamic Multiobjective Optimization. *IEEE Transactions on Evolutionary Computation*, 2025, 29(4): 948-962. [DOI](https://doi.org/10.1109/tevc.2024.3393151)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J063** Kaiyu Wang, Shangce Gao, MengChu Zhou, Zhi-Hui Zhan, Jiujun Cheng. Fractional Order Differential Evolution. *IEEE Transactions on Evolutionary Computation*, 2025, 29(3): 822-835. [DOI](https://doi.org/10.1109/tevc.2024.3382047)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J064** F. O. de Franca, M. Virgolin, M. Kommenda, M. S. Majumder, M. Cranmer, G. Espada, L. Ingelse, A. Fonseca, M. Landajuela, B. Petersen, R. Glatt, N. Mundhenk, C. S. Lee, J. D. Hochhalter, D. L. Randall, P. Kamienny, H. Zhang, G. Dick, A. Simon, B. Burlacu, Jaan Kasak, Meera Machado, Casper Wilstrup, W. G. La Cava. SRBench++: Principled Benchmarking of Symbolic Regression With Domain-Expert Interpretation. *IEEE Transactions on Evolutionary Computation*, 2025, 29(4): 1127-1137. [DOI](https://doi.org/10.1109/tevc.2024.3423681)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J065** Zhen Yang, Tangxu Yao, Yunliang Jiang, Jun Zhang, Xiongtao Zhang. Indexes-Based and Partial Restart-Based Constrained Multiobjective Optimization. *IEEE Transactions on Evolutionary Computation*, 2025, 29(4): 990-1001. [DOI](https://doi.org/10.1109/tevc.2024.3400610)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J066** Xin-Rui Tao, Quan-Ke Pan, Liang Gao. An Iterated Greedy Algorithm With Reinforcement Learning for Distributed Hybrid Flowshop Problems With Job Merging. *IEEE Transactions on Evolutionary Computation*, 2025, 29(3): 589-600. [DOI](https://doi.org/10.1109/tevc.2024.3443874)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J067** Shuang Li, Ke Li, Wei Li, Ming Yang. Evolutionary Alternating Direction Method of Multipliers for Constrained Multiobjective Optimization With Unknown Constraints. *IEEE Transactions on Evolutionary Computation*, 2025, 29(4): 1419-1433. [DOI](https://doi.org/10.1109/tevc.2024.3425629)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J068** Shenglian Tan, Yong Wang, Guangyong Sun, Tong Pang, Ke Tang. A Surrogate-Assisted Evolutionary Framework for Expensive Multitask Optimization Problems. *IEEE Transactions on Evolutionary Computation*, 2025, 29(3): 779-793. [DOI](https://doi.org/10.1109/tevc.2024.3370937)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J069** Genghui Li, Zhenkun Wang, Weifeng Gao, Ling Wang. Decoupling Constraint: Task Clone-Based Multitasking Optimization for Constrained Multiobjective Optimization. *IEEE Transactions on Evolutionary Computation*, 2025, 29(2): 404-417. [DOI](https://doi.org/10.1109/tevc.2024.3358854)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J070** Lei Chen, Yiu-Ming Cheung, Hai-Lin Liu, Yutao Lai. MOTEA-II: A Collaborative Multiobjective Transformation-Based Evolutionary Algorithm for Bilevel Optimization. *IEEE Transactions on Evolutionary Computation*, 2025, 29(2): 474-489. [DOI](https://doi.org/10.1109/tevc.2025.3538611)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J071** Ke Shang, Guotong Wu, Lie Meng Pang, Hisao Ishibuchi. Targeted Pareto Optimization for Subset Selection With Monotone Objective Function and Cardinality Constraint. *IEEE Transactions on Evolutionary Computation*, 2025, 29(4): 1386-1399. [DOI](https://doi.org/10.1109/tevc.2024.3431928)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J072** Xiao-Qi Guo, Feng-Feng Wei, Jun Zhang, Wei-Neng Chen. A Classifier-Ensemble-Based Surrogate-Assisted Evolutionary Algorithm for Distributed Data-Driven Optimization. *IEEE Transactions on Evolutionary Computation*, 2025, 29(3): 711-725. [DOI](https://doi.org/10.1109/tevc.2024.3361000)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J073** Zheng Cai, Yit Hong Choo, Tao Zhou, Vu Le, Wei Hong Lim, Chee Peng Lim. Learning-Based Surrogate-Assisted Modelling Strategy Selection for Expensive Constrained Multi-Objective Optimisation. *IEEE Transactions on Evolutionary Computation*, 2025, (): 1-1. [DOI](https://doi.org/10.1109/tevc.2025.3635778)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J074** Dominik Sobania, Justyna Petke, Martin Briesch, Franz Rothlauf. A Comparison of Large Language Models and Genetic Programming for Program Synthesis. *IEEE Transactions on Evolutionary Computation*, 2025, 29(4): 1434-1448. [DOI](https://doi.org/10.1109/tevc.2024.3410873)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J075** Yuji Zou, Jin-Kao Hao, Qinghua Wu. A Two-Individual Evolutionary Algorithm for Cumulative Capacitated Vehicle Routing With Single and Multiple Depots. *IEEE Transactions on Evolutionary Computation*, 2025, 29(2): 505-518. [DOI](https://doi.org/10.1109/tevc.2024.3361910)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J076** Yiya Diao, Changhe Li, Sanyou Zeng, Shengxiang Yang, Carlos A. Coello Coello. Nearest-Better Network for Fitness Landscape Analysis of Continuous Optimization Problems. *IEEE Transactions on Evolutionary Computation*, 2025, 29(5): 2089-2103. [DOI](https://doi.org/10.1109/tevc.2024.3478825)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J077** Amir Omeradzic, Hans-Georg Beyer. Self-Adaptation of Multirecombinant Evolution Strategies on the Highly Multimodal Rastrigin Function. *IEEE Transactions on Evolutionary Computation*, 2025, 29(4): 880-890. [DOI](https://doi.org/10.1109/tevc.2024.3400857)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J078** Zhicheng Wu, Bing Xue, Mengjie Zhang. Multitree Genetic Programming for Multimodal Learning in Multimodal Medical Image Classification. *IEEE Transactions on Evolutionary Computation*, 2025, (): 1-1. [DOI](https://doi.org/10.1109/tevc.2025.3619532)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J079** Hao Li, Pu Xiong, Maoguo Gong, A. K. Qin, Yue Wu, Lining Xing. Fast Heterogeneous Multiproblem Surrogates for Transfer Evolutionary Multiobjective Optimization. *IEEE Transactions on Evolutionary Computation*, 2025, 29(5): 1663-1677. [DOI](https://doi.org/10.1109/tevc.2024.3384478)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J080** Thomas Guilmeau, Emilie Chouzenoux, Víctor Elvira. A Divergence-Based Condition to Ensure Quantile Improvement in Black-Box Global Optimization. *IEEE Transactions on Evolutionary Computation*, 2025, 29(4): 1017-1028. [DOI](https://doi.org/10.1109/tevc.2024.3452420)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J081** Ruihao Zheng, Jingda Deng, Zhenkun Wang. Weak Pareto Boundary: A Critical Challenge for Evolutionary Multiobjective Optimization. *IEEE Transactions on Evolutionary Computation*, 2026, 30(5): 2215-2229. [DOI](https://doi.org/10.1109/tevc.2025.3646963)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J082** Fei Li, Xun Huang, Cuie Yang, Yuanchao Liu, Jinliang Ding. Cross-Phase Knowledge Transfer via Variable Space Alignment for Expensive Incremental Optimization. *IEEE Transactions on Evolutionary Computation*, 2026, (): 1-1. [DOI](https://doi.org/10.1109/tevc.2026.3684126)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J083** Balija Santoshkumar, Kalyanmoy Deb. Handling Objectives With Heterogeneous Evaluation Times in Surrogate-Assisted Evolutionary Multiobjective Optimization. *IEEE Transactions on Evolutionary Computation*, 2026, 30(2): 564-578. [DOI](https://doi.org/10.1109/tevc.2025.3560922)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J084** Zhi Liu, Wei Song, Carlos A. Coello Coello, Yaochu Jin, Shengxiang Yang, Shitong Wang. Environmental Knowledge-Driven Transfer Strategy With Collaborative Learning for Dynamic Constrained Multiobjective Optimization. *IEEE Transactions on Evolutionary Computation*, 2026, 30(5): 2152-2167. [DOI](https://doi.org/10.1109/tevc.2025.3643205)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J085** Changhua He, Lean Yu. A Multiobjective Genetic Algorithm-Based Unilateral Rule Extraction Model for Credit Risk Classification. *IEEE Transactions on Evolutionary Computation*, 2026, 30(3): 1054-1067. [DOI](https://doi.org/10.1109/tevc.2025.3582941)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J086** José Maria Simões, Nuno Lourenço, Penousal Machado. Sexual Selection in Genetic Programming: Advertising Good Genes. *IEEE Transactions on Evolutionary Computation*, 2026, (): 1-1. [DOI](https://doi.org/10.1109/tevc.2026.3691878)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J087** Che Xu, Leilei Liao, Shaoqiu Zheng, Xuefei Jia, Ying Tan, Peng Zhu. Class-Aware Evolutionary Fusion Search for Multi-Head Deep Ordinal Decision Making. *IEEE Transactions on Evolutionary Computation*, 2026, (): 1-1. [DOI](https://doi.org/10.1109/tevc.2026.3750937)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J088** Qinyu Wang, Ying Bi, Bing Xue, Mengjie Zhang. CNNGP: Multi-tree Genetic Programming Integrating Pre-trained CNN Features for Fine-Grained Image Classification. *IEEE Transactions on Evolutionary Computation*, 2026, (): 1-1. [DOI](https://doi.org/10.1109/tevc.2026.3675672)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J089** Jintao Li, Yongji Long, Weixuan Liu, Aojin Li, Yanhan Zeng, Shui Yu, Yun Li. Archive-Protected Survival Selection for Response Evolution in Large Language Model Post-Training. *IEEE Transactions on Evolutionary Computation*, 2026, (): 1-1. [DOI](https://doi.org/10.1109/tevc.2026.3745406)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J090** Keisuke Korogi, Ryoji Tanabe. Speeding Up Local Search for the Indicator-Based Subset Selection Problem by a Candidate List Strategy. *IEEE Transactions on Evolutionary Computation*, 2026, 30(1): 156-170. [DOI](https://doi.org/10.1109/tevc.2025.3538902)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J091** Constantinos Tsakonas, Konstantinos Chatzilygeroudis. Vector Quantized-Elites: Unsupervised and Problem-Agnostic Quality-Diversity Optimization. *IEEE Transactions on Evolutionary Computation*, 2026, 30(4): 1669-1683. [DOI](https://doi.org/10.1109/tevc.2025.3631786)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J092** Zesheng Zhang, Shoufei Han, Xiaojing Liu, Changhe Li, Kaixiang Yang, Qianlong Dang. Learning-Assisted Evolutionary Feature Selection via Age-Reinforced Reduction and Expansion for High-Dimensional Classification Problems. *IEEE Transactions on Evolutionary Computation*, 2026, (): 1-1. [DOI](https://doi.org/10.1109/tevc.2026.3730545)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J093** Jin Zhou, Juan Zhang, Junkai Ji, Qiuzhen Lin, Zexuan Zhu, Jianqiang Li, Carlos A. Coello Coello. Feshdock: A Divide-and-Conquer Protein–Protein Complex Conformation Prediction Algorithm. *IEEE Transactions on Evolutionary Computation*, 2026, (): 1-1. [DOI](https://doi.org/10.1109/tevc.2026.3668844)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J094** Tianye Shu, Yang Nan, Longcan Chen, Lie Meng Pang, Hisao Ishibuchi. Simple but Difficult Multi-objective Distance Minimization Problems with Disconnected Global and Local Pareto Sets. *IEEE Transactions on Evolutionary Computation*, 2026, (): 1-1. [DOI](https://doi.org/10.1109/tevc.2026.3749967)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J095** Hiroki Shiraishi, Hisao Ishibuchi, Masaya Nakata. Kolmogorov-Arnold Classifier Systems as Universal Approximators. *IEEE Transactions on Evolutionary Computation*, 2026, (): 1-1. [DOI](https://doi.org/10.1109/tevc.2026.3736664)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J096** Kangjia Qiao, Gang Liu, Jing Liang, Yuanjian Wang, Lei Li, Kunjie Yu, Caitong Yue. A Level-Based Multi-Population Self-Adaptive Constrained Multiobjective Evolutionary Algorithm for Cascade Reservoir Scheduling. *IEEE Transactions on Evolutionary Computation*, 2026, (): 1-1. [DOI](https://doi.org/10.1109/tevc.2026.3651698)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J097** Hong Zhao, Xu-Hui Ning, Jian-Yu Li, Jing Liu. Evolutionary Multitask Framework With Bi-Knowledge Transfer for Multimodal Optimization Problems. *IEEE Transactions on Evolutionary Computation*, 2026, 30(1): 393-407. [DOI](https://doi.org/10.1109/tevc.2025.3551728)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J098** Fuqing Zhao, Jiwei Lv, Ling Wang, Hongyan Sang, Houbin Song. A Knowledge-enhanced Framework with
                    k
                    -step DQN for No-Wait Flow-Shop Scheduling with Sequence-Dependent Setup Time. *IEEE Transactions on Evolutionary Computation*, 2026, (): 1-1. [DOI](https://doi.org/10.1109/tevc.2026.3727219)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J099** Jiliang Zhao, Wei Peng, Handing Wang, Weien Zhou, Yang Yang, Wen Yao. Cross-Task Collaborative Optimization Based on Knowledge Transfer for Soft Robot Design. *IEEE Transactions on Evolutionary Computation*, 2026, 30(3): 898-910. [DOI](https://doi.org/10.1109/tevc.2025.3573828)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J100** Libin Lin, Wei Huang, Lijun Wei, Jiewu Leng, Weiming Xu, Qiang Liu, Tao Zou. Automatic Design of Differential Evolution Optimizers for Surrogate-Assisted Evolutionary Algorithms via Large Language Models. *IEEE Transactions on Evolutionary Computation*, 2026, (): 1-1. [DOI](https://doi.org/10.1109/tevc.2026.3751216)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J101** S. Kirkpatrick, C. D. Gelatt, M. P. Vecchi. Optimization by Simulated Annealing. *Science*, 1983, 220(4598): 671-680. [DOI](https://doi.org/10.1126/science.220.4598.671)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J102** Jakub Kudela. A critical problem in benchmarking and analysis of evolutionary computation methods. *Nature Machine Intelligence*, 2022, 4(12): 1238-1245. [DOI](https://doi.org/10.1038/s42256-022-00579-0)。证据范围：出版摘要与方法论问题选读。

- **J103** Antonio LaTorre, Daniel Molina, Eneko Osaba, Javier Poyatos, Javier Del Ser, Francisco Herrera. A prescription of methodological guidelines for comparing bio-inspired optimization algorithms. *Swarm and Evolutionary Computation*, 2021, 67(): 100973. [DOI](https://doi.org/10.1016/j.swevo.2021.100973)。证据范围：出版摘要与基准比较建议选读。

- **J104** Vahid Beiranvand, Warren Hare, Yves Lucet. Best practices for comparing optimization algorithms. *Optimization and Engineering*, 2017, 18(4): 815-848. [DOI](https://doi.org/10.1007/s11081-017-9366-1)。证据范围：出版摘要与比较方法选读。

- **J105** J.J. Liang, A.K. Qin, P.N. Suganthan, S. Baskar. Comprehensive learning particle swarm optimizer for global optimization of multimodal functions. *IEEE Transactions on Evolutionary Computation*, 2006, 10(3): 281-295. [DOI](https://doi.org/10.1109/tevc.2005.857610)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J106** Nikolaus Hansen, Sibylle D. Müller, Petros Koumoutsakos. Reducing the Time Complexity of the Derandomized Evolution Strategy with Covariance Matrix Adaptation (CMA-ES). *Evolutionary Computation*, 2003, 11(1): 1-18. [DOI](https://doi.org/10.1162/106365603321828970)。证据范围：题录与作者官方算法材料核对。

- **J107** Nikolaus Hansen, Andreas Ostermeier. Completely Derandomized Self-Adaptation in Evolution Strategies. *Evolutionary Computation*, 2001, 9(2): 159-195. [DOI](https://doi.org/10.1162/106365601750190398)。证据范围：题录与作者官方方法说明。

- **J108** Yong Wang, Zixing Cai, Qingfu Zhang. Differential Evolution With Composite Trial Vector Generation Strategies and Control Parameters. *IEEE Transactions on Evolutionary Computation*, 2011, 15(1): 55-66. [DOI](https://doi.org/10.1109/tevc.2010.2087271)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J109** Michael Hellwig, Hans-Georg Beyer. Benchmarking evolutionary algorithms for single objective real-valued constrained optimization – A critical review. *Swarm and Evolutionary Computation*, 2019, 44(): 927-944. [DOI](https://doi.org/10.1016/j.swevo.2018.10.002)。证据范围：出版摘要与研究范围选读。

- **J110** Rainer Storn, Kenneth Price. Differential Evolution – A Simple and Efficient Heuristic for global Optimization over Continuous Spaces. *Journal of Global Optimization*, 1997, 11(4): 341-359. [DOI](https://doi.org/10.1023/a:1008202821328)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J111** Swagatam Das, Sankha Subhra Mullick, P.N. Suganthan. Recent advances in differential evolution – An updated survey. *Swarm and Evolutionary Computation*, 2016, 27(): 1-30. [DOI](https://doi.org/10.1016/j.swevo.2016.01.004)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J112** Swagatam Das, Ponnuthurai Nagaratnam Suganthan. Differential Evolution: A Survey of the State-of-the-Art. *IEEE Transactions on Evolutionary Computation*, 2011, 15(1): 4-31. [DOI](https://doi.org/10.1109/tevc.2010.2059031)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J113** Kalyanmoy Deb. An efficient constraint handling method for genetic algorithms. *Computer Methods in Applied Mechanics and Engineering*, 2000, 186(2-4): 311-338. [DOI](https://doi.org/10.1016/s0045-7825(99)00389-8)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J114** Hans-Georg Beyer, Hans-Paul Schwefel. Evolution strategies – A comprehensive introduction. *Natural Computing*, 2002, 1(1): 3-52. [DOI](https://doi.org/10.1023/a:1015059928466)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J115** R. Mendes, J. Kennedy, J. Neves. The Fully Informed Particle Swarm: Simpler, Maybe Better. *IEEE Transactions on Evolutionary Computation*, 2004, 8(3): 204-210. [DOI](https://doi.org/10.1109/tevc.2004.826074)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J116** F. Herrera, M. Lozano, J.L. Verdegay. Tackling Real-Coded Genetic Algorithms: Operators and Tools for Behavioural Analysis. *Artificial Intelligence Review*, 1998, 12(4): 265-319. [DOI](https://doi.org/10.1023/a:1006504901164)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J117** Jingqiao Zhang, A.C. Sanderson. JADE: Adaptive Differential Evolution With Optional External Archive. *IEEE Transactions on Evolutionary Computation*, 2009, 13(5): 945-958. [DOI](https://doi.org/10.1109/tevc.2009.2014613)。证据范围：原始摘要、题录与方法结构核对。

- **J118** Janez Brest, Sao Greiner, Borko Boskovic, Marjan Mernik, Viljem Zumer. Self-Adapting Control Parameters in Differential Evolution: A Comparative Study on Numerical Benchmark Problems. *IEEE Transactions on Evolutionary Computation*, 2006, 10(6): 646-657. [DOI](https://doi.org/10.1109/tevc.2006.872133)。证据范围：大学公开原文方法段落与题录。

- **J119** Kaiwen Li, Rui Wang, Tao Zhang, Hisao Ishibuchi. Evolutionary Many-Objective Optimization: A Comparative Study of the State-of-the-Art. *IEEE Access*, 2018, 6(): 26194-26214. [DOI](https://doi.org/10.1109/access.2018.2832181)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J120** Qingfu Zhang, Hui Li. MOEA/D: A Multiobjective Evolutionary Algorithm Based on Decomposition. *IEEE Transactions on Evolutionary Computation*, 2007, 11(6): 712-731. [DOI](https://doi.org/10.1109/tevc.2007.892759)。证据范围：题录与分解框架核对。

- **J121** N. Srinivas, Kalyanmoy Deb. Muiltiobjective Optimization Using Nondominated Sorting in Genetic Algorithms. *Evolutionary Computation*, 1994, 2(3): 221-248. [DOI](https://doi.org/10.1162/evco.1994.2.3.221)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J122** K. Deb, A. Pratap, S. Agarwal, T. Meyarivan. A fast and elitist multiobjective genetic algorithm: NSGA-II. *IEEE Transactions on Evolutionary Computation*, 2002, 6(2): 182-197. [DOI](https://doi.org/10.1109/4235.996017)。证据范围：题录与原始方法核对。

- **J123** Kalyanmoy Deb, Himanshu Jain. An Evolutionary Many-Objective Optimization Algorithm Using Reference-Point-Based Nondominated Sorting Approach, Part I: Solving Problems With Box Constraints. *IEEE Transactions on Evolutionary Computation*, 2014, 18(4): 577-601. [DOI](https://doi.org/10.1109/tevc.2013.2281535)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J124** M. Clerc, J. Kennedy. The particle swarm - explosion, stability, and convergence in a multidimensional complex space. *IEEE Transactions on Evolutionary Computation*, 2002, 6(1): 58-73. [DOI](https://doi.org/10.1109/4235.985692)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J125** Dongshu Wang, Dapei Tan, Lei Liu. Particle swarm optimization algorithm: an overview. *Soft Computing*, 2017, 22(2): 387-408. [DOI](https://doi.org/10.1007/s00500-016-2474-6)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J126** A.K. Qin, V.L. Huang, P.N. Suganthan. Differential Evolution Algorithm With Strategy Adaptation for Global Numerical Optimization. *IEEE Transactions on Evolutionary Computation*, 2009, 13(2): 398-417. [DOI](https://doi.org/10.1109/tevc.2008.927706)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J127** Adam P. Piotrowski, Agnieszka E. Piotrowska, Jaroslaw J. Napiorkowski. Experimental survey of L-SHADE and SHADE-based adaptive differential evolution algorithms. *Swarm and Evolutionary Computation*, 2026, 101(): 102286. [DOI](https://doi.org/10.1016/j.swevo.2026.102286)。证据范围：出版摘要与比较范围选读。

- **J128** Nicola Beume, Boris Naujoks, Michael Emmerich. SMS-EMOA: Multiobjective selection based on dominated hypervolume. *European Journal of Operational Research*, 2007, 181(3): 1653-1669. [DOI](https://doi.org/10.1016/j.ejor.2006.08.008)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J129** E. Zitzler, L. Thiele. Multiobjective evolutionary algorithms: a comparative case study and the strength Pareto approach. *IEEE Transactions on Evolutionary Computation*, 1999, 3(4): 257-271. [DOI](https://doi.org/10.1109/4235.797969)。证据范围：出版社题录与参考文献编码；未声称全文精读。

- **J130** Fred Glover. Tabu Search—Part I. *ORSA Journal on Computing*, 1989, 1(3): 190-206. [DOI](https://doi.org/10.1287/ijoc.1.3.190)。证据范围：出版社题录与参考文献编码；未声称全文精读。


## 独立补充资料（不计入130篇期刊）

- **cec-shade** [Success-history based parameter adaptation for Differential Evolution](https://ryojitanabe.github.io/tf-cec2013-shade.pdf)。会议题录；关键方法和作者公开版本选读；不计为期刊论文。

- **cec-lshade** [Improving the search performance of SHADE using linear population size reduction](https://ryojitanabe.github.io/pdf/tf-cec2014.pdf)。会议题录；关键方法和作者公开版本选读；不计为期刊论文。

- **cec-jso** [Single objective real-parameter optimization: Algorithm jSO](https://ieeexplore.ieee.org/document/7969456/)。会议题录；关键方法和作者公开版本选读；不计为期刊论文。

- **cec-inertia** [A modified particle swarm optimizer](https://doi.org/10.1109/ICEC.1998.699146)。会议题录；关键方法和作者公开版本选读；不计为期刊论文。

- **spea2-report** [SPEA2: Improving the Strength Pareto Evolutionary Algorithm](https://sop.tik.ee.ethz.ch/publicationListFiles/zlt2001a.pdf)。原始报告方法与算法段落选读；不计为期刊论文。

- **cec2017-official** [CEC 2017 Special Session and Competition: official benchmark and results](https://sites.google.com/view/suganthan-p-n/cec-benchmark/cec17-special-session)。组织者公开基准与结果页面；不计为期刊论文。

- **shade-author-versions** [SHADE / L-SHADE author versions, corrected implementations and competition links](https://ryojitanabe.github.io/publication)。作者公开版本及修正说明；不计为期刊论文。

- **cma-author-guide** [The CMA Evolution Strategy: official method guide and source implementations](https://cma-es.github.io/)。官方方法说明与公式核对；不计为期刊论文。
