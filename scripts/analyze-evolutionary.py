import csv,json,sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8');ROOT=Path(__file__).resolve().parent.parent
folder=ROOT/'experiments'/'2026-11-15-evolutionary-baselines'
reports=[json.loads((folder/(p+'.json')).read_text(encoding='utf-8'))for p in ['metro','skirmish']]
records=[r for report in reports for r in report['results']]
assert len(records)==756 and len({(r['problemId'],r['id'])for r in records})==756
rows=[];winners=[]
for report in reports:
    problem=report['request']['problemId'];by={(r['scenarioId'],r['methodId']):r for r in report['summary']}
    for scenario in report['request']['scenarioIds']:
        base=by[(scenario,'constructive')]
        for (sid,method),row in by.items():
            if sid!=scenario:continue
            actual=[r for r in report['results']if r['scenarioId']==sid and r['methodId']==method]
            base_actual=[r for r in report['results']if r['scenarioId']==sid and r['methodId']=='constructive']
            score=sum(r['metrics']['score']for r in actual)/len(actual);base_score=sum(r['metrics']['score']for r in base_actual)/len(base_actual)
            primary=report['metricSchema'][0]['id'];delta=row['metrics'][primary]['mean']-base['metrics'][primary]['mean']
            rows.append({'problem':problem,'scenario':sid,'method':method,'n':row['n'],'meanScore':score,'baselineScore':base_score,'scoreDelta':score-base_score,'relativeScoreDelta':(score-base_score)/base_score if base_score>0 else None,'primaryMetric':primary,'primaryMean':row['metrics'][primary]['mean'],'primarySD':row['metrics'][primary]['sd'],'primaryDelta':delta,'meanEvaluations':sum(r['evaluations']for r in actual)/len(actual),'meanElapsedMs':sum(r['elapsedMs']for r in actual)/len(actual)})
        candidates=[r for r in rows if r['problem']==problem and r['scenario']==scenario and not r['method'].startswith(('metro.','squad.'))]
        best=max(r['meanScore']for r in candidates)
        winners.append({'problem':problem,'scenario':scenario,'bestObservedMeanScore':best,'tiedMethods':[r['method']for r in candidates if abs(r['meanScore']-best)<1e-9]})
with(folder/'comparison-deltas.csv').open('w',encoding='utf-8-sig',newline='')as stream:
    writer=csv.DictWriter(stream,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
(folder/'analysis.json').write_text(json.dumps({'scope':'3 paired seeds; descriptive integration evidence, no significance or global-superiority claim','rows':rows,'observedLeaders':winners},ensure_ascii=False,indent=2),encoding='utf-8')
out=['# 756局整合验证汇总','','实际运行：11场景、28种方法的适用组合、种子26/27/28、每次规划32次候选评价上限。地铁324局，小队432局，756条记录均复现最终指标。','','## 如何阅读','','- 对照同一问题与场景内的构造基线；单目标、多目标与原生控制的目的不同。','- 这里只作描述性整合检查。3个种子和大量方法比较不足以支持普遍优越或统计显著性结论。','- 地铁动态场景多次规划，评价次数为全回合累计；原生控制用预算作为迭代上限，不能与搜索方法的评价次数直接等同。','- 相对得分变化仅在基线得分为正时计算；基线为零或负值时保留绝对差值。','','## 每场景的最高观察均值得分（共享搜索方法内）','','| 问题 | 场景 | 最高观察均值 | 并列方法 |','|---|---|---|---|']
for r in winners:out.append(f"| {r['problem']} | {r['scenario']} | {r['bestObservedMeanScore']:.2f} | {', '.join(r['tiedMethods'])} |")
out+=['','## 原始数据与差值','','[地铁JSON](metro.json) / [地铁CSV](metro.csv) / [小队JSON](skirmish.json) / [小队CSV](skirmish.csv) / [相对构造基线的逐场景差值](comparison-deltas.csv)。','','均值与样本标准差保存在JSON的summary。多目标归档、目标定义、实现参数及部署规则保存在searchDetail。规划评价目标不能与完成整局后的指标混为同一层结果。']
(folder/'summary.zh-CN.md').write_text('\n'.join(out)+'\n',encoding='utf-8')
print(json.dumps({'episodes':len(records),'groups':len(rows),'observedLeaders':winners},ensure_ascii=False))
