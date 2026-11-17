"""Publisher-deposited Crossref records; journal corpus and CEC supplement stay separate."""
import concurrent.futures
import difflib
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
ROOT=Path(__file__).resolve().parent
CUTOFF='2026-11-15'
HEADERS={'User-Agent':'HEX-Evolutionary-Baseline-Evidence/1.0'}

def get(url):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=35) as response:return json.load(response)['message']
        except Exception:
            if attempt==2:raise
            time.sleep(1+attempt)

def normal(value):return re.sub(r'[^a-z0-9]','',html.unescape(value).lower())
def query(topic):
    filename=ROOT/('pool-'+topic[0]+'.json')
    if filename.exists():return json.loads(filename.read_text(encoding='utf-8'))
    params={'query':topic[1],'rows':75,'filter':'type:journal-article,from-pub-date:1997-01-01,until-pub-date:'+CUTOFF}
    result=get('https://api.crossref.org/journals/1089-778X/works?'+urllib.parse.urlencode(params))['items']
    filename.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'pool':topic[0],'records':len(result)},ensure_ascii=False),flush=True)
    return result

TOPICS=[('de','differential evolution adaptation parameter'),('pso','particle swarm optimization'),('es','covariance matrix adaptation evolution strategy'),('moea','multiobjective evolutionary algorithm decomposition nondominated'),('constraint','constraint handling constrained optimization'),('benchmark','benchmark comparison performance statistical test'),('ga','genetic algorithm selection crossover'),('recent','evolutionary computation optimization benchmark adaptive')]
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:pools=list(pool.map(query,TOPICS))

quota=[25,14,7,28,8,8,5,5]
selected={}
def valid(item):
    title=(item.get('title')or[''])[0]
    venue=' '.join(item.get('container-title')or[]).lower()
    return item.get('type')=='journal-article' and 'transactions on evolutionary computation' in venue and title and item.get('DOI') and not re.search(r'(^|\b)(editorial|erratum|correction|retraction|contents|reviewers|guest editorial)(\b|:)',title,re.I)
for (topic,_),items,target in zip(TOPICS,pools,quota):
    added=0
    for item in items:
        doi=item.get('DOI','').lower()
        if not valid(item)or doi in selected:continue
        selected[doi]={**item,'sampleTopic':topic,'evidenceScope':'出版社存入Crossref的题录与参考文献；未声称全文精读'}
        added+=1
        if added>=target:break
for items in pools:
    for item in items:
        if len(selected)>=100:break
        doi=item.get('DOI','').lower()
        if valid(item) and doi not in selected:selected[doi]={**item,'sampleTopic':'coverage-fill','evidenceScope':'出版社题录与参考文献'}
assert len(selected)>=100,len(selected)
tevc=list(selected.values())[:100]

anchors=[
 ('de-original','10.1023/A:1008202821328',None,'Differential Evolution – A Simple and Efficient Heuristic for global Optimization over Continuous Spaces'),
 ('jade','10.1109/TEVC.2009.2014613',None,'JADE: Adaptive Differential Evolution With Optional External Archive'),
 ('jde','10.1109/TEVC.2006.872133',None,'Self-Adapting Control Parameters in Differential Evolution'),
 ('sade','10.1109/TEVC.2008.927706',None,'Differential Evolution Algorithm With Strategy Adaptation for Global Numerical Optimization'),
 ('code','10.1109/TEVC.2010.2087271',None,'Differential Evolution With Composite Trial Vector Generation Strategies and Control Parameters'),
 ('clpso','10.1109/TEVC.2005.857610',None,'Comprehensive Learning Particle Swarm Optimizer for Global Optimization of Multimodal Functions'),
 ('pso-constriction','10.1109/4235.985692',None,'The particle swarm - explosion, stability, and convergence in a multidimensional complex space'),
 ('fipso','10.1109/TEVC.2004.826074',None,'The Fully Informed Particle Swarm: Simpler, Maybe Better'),
 ('cmaes','10.1162/106365601750190398',None,'Completely Derandomized Self-Adaptation in Evolution Strategies'),
 ('cmaes-2003','10.1162/106365603321828970',None,'Reducing the Time Complexity of the Derandomized Evolution Strategy with Covariance Matrix Adaptation (CMA-ES)'),
 ('nsga2','10.1109/4235.996017',None,'A fast and elitist multiobjective genetic algorithm: NSGA-II'),
 ('moead','10.1109/TEVC.2007.892759',None,'MOEA/D: A Multiobjective Evolutionary Algorithm Based on Decomposition'),
 ('nsga3','10.1109/TEVC.2013.2281535',None,'An Evolutionary Many-Objective Optimization Algorithm Using Reference-Point-Based Nondominated Sorting Approach, Part I: Solving Problems With Box Constraints'),
 ('spea','10.1109/4235.797969',None,'Multiobjective evolutionary algorithms: a comparative case study and the strength Pareto approach'),
 ('nsga-original','10.1162/evco.1994.2.3.221',None,'Multiobjective Optimization Using Nondominated Sorting in Genetic Algorithms'),
 ('sms-emoa','10.1016/j.ejor.2006.08.008',None,'SMS-EMOA: Multiobjective selection based on dominated hypervolume'),
 ('deb-constraints','10.1016/S0045-7825(99)00389-8',None,'An efficient constraint handling method for genetic algorithms'),
 ('de-survey',None,'Differential Evolution: A Survey of the State-of-the-Art','Differential Evolution: A Survey of the State-of-the-Art'),
 ('de-review',None,'Recent advances in differential evolution – An updated survey','Recent advances in differential evolution – An updated survey'),
 ('pso-survey',None,'Particle swarm optimization: An overview','Particle swarm optimization: An overview'),
 ('ga-operators',None,'Tackling real-coded genetic algorithms: Operators and tools for behavioural analysis','Tackling real-coded genetic algorithms: Operators and tools for behavioural analysis'),
 ('benchmark-practice',None,'Best practices for comparing optimization algorithms','Best practices for comparing optimization algorithms'),
 ('benchmark-guidelines',None,'A prescription of methodological guidelines for comparing bio-inspired optimization algorithms','A prescription of methodological guidelines for comparing bio-inspired optimization algorithms'),
 ('benchmark-critical','10.1038/s42256-022-00579-0',None,'A critical problem in benchmarking and analysis of evolutionary computation methods'),
 ('shade-survey',None,'Experimental survey of L-SHADE and SHADE-based adaptive differential evolution algorithms','Experimental survey of L-SHADE and SHADE-based adaptive differential evolution algorithms'),
 ('constraint-review',None,'Benchmarking evolutionary algorithms for single objective real-valued constrained optimization – A critical review','Benchmarking evolutionary algorithms for single objective real-valued constrained optimization – A critical review'),
 ('manyobjective-survey',None,'Evolutionary Many-Objective Optimization: A Comparative Study of the State-of-the-Art','Evolutionary Many-Objective Optimization: A Comparative Study of the State-of-the-Art'),
]
def fetch_anchor(seed):
    key,doi,title,expected=seed
    dest=ROOT/('anchor-'+key+'.json')
    if dest.exists():return json.loads(dest.read_text(encoding='utf-8'))
    try:
        if doi:item=get('https://api.crossref.org/works/'+urllib.parse.quote(doi,safe=''))
        else:
            choices=get('https://api.crossref.org/works?'+urllib.parse.urlencode({'query.title':title,'rows':3,'filter':'type:journal-article,until-pub-date:'+CUTOFF}))['items']
            item=max(choices,key=lambda x:difflib.SequenceMatcher(None,normal(title),normal((x.get('title')or[''])[0])).ratio())
        similarity=difflib.SequenceMatcher(None,normal(expected),normal((item.get('title')or[''])[0])).ratio()
        result={'key':key,'ok':similarity>=0.80,'similarity':similarity,'expectedTitle':expected,'record':item}
    except Exception as error:result={'key':key,'ok':False,'error':str(error)}
    dest.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:result.get(k) for k in ['key','ok','similarity','error']},ensure_ascii=False),flush=True)
    return result
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:anchor_records=list(pool.map(fetch_anchor,anchors))

combined={r['DOI'].lower():r for r in tevc}
for record in anchor_records:
    if not record.get('ok'):continue
    item=record['record']
    if item.get('type')!='journal-article':continue
    doi=item['DOI'].lower()
    if doi not in combined:combined[doi]={**item,'sampleTopic':'foundational-or-review','anchorKey':record['key'],'evidenceScope':'题录核验；关键文献将补充原始摘要或全文选读'}
    else:combined[doi]['anchorKey']=record['key']
(ROOT/'journal-corpus-raw.json').write_text(json.dumps(list(combined.values()),ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'tevcSample':len(tevc),'uniqueJournals':len(combined),'anchorsMatched':sum(a.get('ok',False)for a in anchor_records),'referenceLists':sum(bool(r.get('reference'))for r in combined.values()),'abstracts':sum(bool(r.get('abstract'))for r in combined.values())},ensure_ascii=False))
