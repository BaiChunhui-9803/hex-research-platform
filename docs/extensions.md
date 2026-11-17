# 增加问题和方法

## 增加第三个问题

1. 在`problems/<id>/index.js`实现`Problem`契约，见[类型说明](contracts.d.ts)。
2. 提供场景、配置校验、指标名称/方向/单位和能力声明。
3. `create()`返回Environment。`apply()`应先验证整个动作再提交，`advance()`推进一个固定逻辑步；`tick()`必须单调递增且最终`done()`。
4. 若支持共享优化，实现`createSearchTask()`。候选解编码、初始化、抽样、邻域和合法性都属于问题。`evaluate()`使用克隆或独立模型，不修改当前真实环境。
5. `acceptSolution()`把搜索结果部署到环境。它可以是一张线路图，也可以是控制器参数，需明确记录语义。
6. 为新问题写`web/views/<id>.js`，导出`mount()`及`update/render/dispose`。通过`onAction`发送命令，卸载时清除事件监听和ResizeObserver。
7. 在`problems/index.js`注册。通用会话、API、方法库和实验代码无需按新问题ID新增分支。

测试中有可执行第三问题实例，验证新的候选空间能直接使用爬山算法。不要为使用共同接口而向算法泄露未来信息。

## 增加共享方法

在`methods/`增加模块并注册到`methods/index.js`。核心形状：

```js
export default {
  id: 'my-search', name: 'My search', description: 'Describe the search rule.',
  mode: 'search', protocol: 'optimization/v1',
  solve(task, options, context) {
    let best = task.initial(context.random);
    let value = task.evaluate(best);
    let evaluations = 1;
    for (let i = 1; i < options.evaluations; i++) {
      context.check?.();
      const candidate = task.mutate(structuredClone(best), context.random);
      const result = task.evaluate(candidate);
      evaluations++;
      if (result.valid && (!value.valid || result.score > value.score)) {
        best = candidate; value = result;
      }
    }
    if (!value.valid) throw new Error('No valid solution');
    return {solution: best, score: value.score, evaluations, trace: []};
  }
};
```

共同契约不要求问题使用相同编码。共享方法只依赖任务操作和标量目标；保留所有原始多维指标供结果分析。复杂的多目标方法可引入新的显式协议，不要默默改变`optimization/v1`的最大化语义。

## 增加专用在线策略

声明自己的`protocol`，必要时增加`requires`。`decide(observation, options, context)`返回该问题的合法动作。平台检查协议与能力，不根据方法名字猜测兼容性。策略仅获得领域观察；需要模型评价时通过`context.evaluate`调用问题提供的SearchTask。

## 主题和接口维护

- 外观入口为`web/theme.js`，通用布局为`web/styles.css`；问题画面插件分别维护。
- 注册表是显式白名单；当前没有在线上传任意JS执行的功能。
- 固定原引擎版本后再比较方法，保留场景、种子、对手、预算和评价范围。修改协议、目标或规则后应更新版本并重新跑整合验证。

## 归一化向量方法

要启用GA／DE／PSO／CMA-ES，问题实现createVectorTask并声明vector-optimization/v1和unit-box-encoding。Task提供dimension、initial、decode、evaluate，所有坐标归一化到[0,1]；对象的解码与约束仍属于问题。多目标另声明pareto-objectives、objectiveSchema及每次评价的objectives（全部最小化）。

方法新增objective/category/family/variant/referenceKeys字段，自动进入级联筛选和来源链接。方法参数中的populationSize为0时使用预算适配默认值。具体接口见contracts.d.ts。
