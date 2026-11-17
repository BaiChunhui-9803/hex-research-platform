"""Journal bibliography plus auditable citation coding; not baseline-adoption mining."""
import csv,hashlib,html,json,re,sys,urllib.parse
from collections import Counter
from pathlib import Path
import markdown
sys.stdout.reconfigure(encoding='utf-8');ROOT=Path(__file__).resolve().parent
raw=json.loads((ROOT/'journal-corpus-raw.json').read_text(encoding='utf-8'))
supplement=json.loads((ROOT/'cec-supplement.json').read_text(encoding='utf-8'))
anchors={}
for file in ROOT.glob('anchor-*.json'):
    item=json.loads(file.read_text(encoding='utf-8'))
    if item.get('ok'):anchors[item['key']]=item['record']['DOI'].lower()
doi_groups={
 'Differential evolution':[anchors.get(k)for k in ['de-original','jade','jde','sade','code']],
 'Particle swarm':[anchors.get(k)for k in ['pso-constriction','clpso','fipso']],
 'CMA-ES':[anchors.get(k)for k in ['cmaes','cmaes-2003']],
 'NSGA-II':[anchors.get('nsga2')], 'NSGA-III':[anchors.get('nsga3')],
 'MOEA/D':[anchors.get('moead')], 'Real-coded GA':[anchors.get('ga-operators')],
}
supplement_dois={r['key']:r.get('record',{}).get('DOI','').lower()for r in supplement}
doi_groups.update({'JADE':[anchors.get('jade')],'SHADE / L-SHADE':[supplement_dois.get('cec-shade'),supplement_dois.get('cec-lshade')],'jSO':[supplement_dois.get('cec-jso')]})
doi_groups['Differential evolution'] += [supplement_dois.get(key)for key in ['cec-shade','cec-lshade','cec-jso']]
doi_groups['Particle swarm'] += [supplement_dois.get('cec-inertia')]
patterns={
 'Differential evolution':r'differential[\s-]+evolution|\bl[\s-]?shade\b|\bshade\b|\bjade\b',
 'Particle swarm':r'particle[\s-]+swarm', 'CMA-ES':r'\bcma[\s-]?es\b',
 'NSGA-II':r'\bnsga[\s-]?(?:ii|2)\b|fast and elitist multiobjective genetic algorithm',
 'NSGA-III':r'\bnsga[\s-]?(?:iii|3)\b', 'MOEA/D':r'\bmoea[\s/-]?d\b|multiobjective evolutionary algorithm based on decomposition',
 'SPEA2':r'\bspea[\s-]?2\b|improving the strength pareto',
 'Real-coded GA':r'real[\s-]+coded genetic algorithm|genetic algorithms and random keys',
 'JADE':r'\bjade\b|adaptive differential evolution with optional external archive',
 'SHADE / L-SHADE':r'\b(?:l[\s-]?)?shade\b|success[\s-]+history based parameter adaptation|linear population size reduction',
 'jSO':r'\bjso\b|single objective real-parameter optimization: algorithm jso',
}
def clean(value):return re.sub(r'<[^>]+>','',html.unescape(str(value or''))).replace('\u00a0',' ').strip()
def dates(item,key):return item.get(key,{}).get('date-parts',[[]])[0]
def title_of(item):return clean((item.get('title')or[''])[0])
def authors(item):return [' '.join(filter(None,[a.get('given'),a.get('family')]))or a.get('name','')for a in item.get('author',[])]
manual={
 'jade':('原始摘要、题录与方法结构核对','成功参数均值、current-to-pbest及外部归档支持自适应DE家族的实现；不直接推断游戏中的优势。'),
 'jde':('大学公开原文方法段落与题录','将F和CR附着于个体并随选择保留；属于自适应控制参数的经典对照。'),
 'cmaes':('题录与作者官方方法说明','使用协方差与步长适应；本平台为正权重完整协方差核心，未实现重启或主动负权重扩展。'),
 'cmaes-2003':('题录与作者官方算法材料核对','帮助区分完整协方差、自适应步长和计算代价；不将对角方法冒充完整CMA-ES。'),
 'nsga2':('题录与原始方法核对','非支配排序和拥挤距离服务于解集；平台另显式记录单次部署候选选择规则。'),
 'moead':('题录与分解框架核对','按分解子问题和邻域开展搜索；本平台使用Tchebycheff、SBX和多项式变异。'),
 'benchmark-critical':('出版摘要与方法论问题选读','基准位置、结构和测试集选择可能使算法比较失真；不能把单一测试集排名视为普遍优势。'),
 'benchmark-practice':('出版摘要与比较方法选读','比较应交代预算、参数、测试问题和不确定性；平台保存配对条件和原始数据。'),
 'benchmark-guidelines':('出版摘要与基准比较建议选读','公平比较、问题适配和统计设计的重要性；不能仅比较不同默认设置下的单个最好值。'),
 'shade-survey':('出版摘要与比较范围选读','SHADE/L-SHADE多个成功变体值得作为现代DE参照；多套测试问题和机制分析仍然重要。'),
 'constraint-review':('出版摘要与研究范围选读','约束优化的CEC和COCO环境并不等价；游戏约束与连续标准函数边界也需要区分。'),
}
papers=[]
for i,item in enumerate(raw,1):
    assert item['type']=='journal-article'
    assert item.get('author') and not re.search(r'publication information|society information|information for authors|thank you for your authorship|editorial board',title_of(item),re.I),title_of(item)
    doi=item['DOI'].lower();key=item.get('anchorKey')or next((k for k,v in anchors.items()if v==doi),None)
    all_dates=[d for d in [dates(item,'published'),dates(item,'published-online'),dates(item,'published-print'),dates(item,'issued')]if d]
    first=min(all_dates)if all_dates else[];assert first and first[0]<=2026
    evidence=[];families=set()
    for ref in item.get('reference',[]):
        ref_doi=html.unescape(str(ref.get('DOI')or ref.get('doi')or'')).strip().lower().replace('https://doi.org/','')
        text=clean(' '.join(str(ref.get(k,''))for k in ['article-title','unstructured','journal-title','volume-title','author','year']))
        found=set()
        for family,dois in doi_groups.items():
            if ref_doi and ref_doi in dois:found.add(family)
        for family,pattern in patterns.items():
            if re.search(pattern,text,re.I):found.add(family)
        if found:evidence.append({'families':sorted(found),'doi':ref_doi,'title':clean(ref.get('article-title')or ref.get('unstructured')or ref.get('journal-title'))[:300]});families.update(found)
    scope,note=manual.get(key,('出版社题录与参考文献编码；未声称全文精读','此记录用于样本覆盖和可核验的引文证据；不据此自动认定采用了哪些比较算法。'))
    paper={'id':f'J{i:03d}','key':key,'title':title_of(item),'authors':authors(item),'year':first[0],'publicationDate':first,'venue':clean((item.get('container-title')or[''])[0]),'volume':item.get('volume',''),'issue':item.get('issue',''),'pages':item.get('page',item.get('article-number','')),'doi':doi,'url':'https://doi.org/'+doi,'metadataSource':'https://api.crossref.org/works/'+urllib.parse.quote(doi,safe=''),'sampleYear':item.get('sampleYear'),'sampleTopic':item.get('sampleTopic'),'referenceListAvailable':bool(item.get('reference')),'referenceCount':len(item.get('reference',[])),'recognisedFamilies':sorted(families),'referenceEvidence':evidence,'scope':scope,'note':note,'baselineAdoption':'未逐篇编码全文比较表；不由引用自动推断采用','checkedOn':'2026-11-15'}
    papers.append(paper)
assert len(papers)>=100 and len({p['doi']for p in papers})==len(papers)
sample=[p for p in papers if p['sampleTopic']=='year-stratified'];available=[p for p in sample if p['referenceListAvailable']]
assert len(sample)==100
counts={family:sum(family in p['recognisedFamilies']for p in available)for family in patterns}
frequency=[{'family':family,'papers':count,'denominator':len(available),'share':count/max(1,len(available)),'interpretation':'可解析参考文献中识别到代表文献或名称；不是基准采用率'}for family,count in sorted(counts.items(),key=lambda item:-item[1])]
stats={'journalArticles':len(papers),'tevcJournalArticles':sum('transactions on evolutionary computation'in p['venue'].lower()for p in papers),'stratifiedSample':100,'sampleYears':[2022,2023,2024,2025,2026],'sampleWithReferences':len(available),'sampleWithoutReferences':100-len(available),'supplementarySources':len(supplement),'implementedMethods':28}
catalogue={'checkedOn':'2026-11-15','stats':stats,'sampling':'2022—2026各年完整Crossref结果池内，按固定SHA256排序取20篇；方法名不参与抽样，跨年DOI去重。分年等额样本不等同于全刊发文占比。','frequencyMeaning':'引文覆盖，不能认定比较实验采用或全领域多数使用。','frequency':frequency,'papers':papers,'supplement':supplement}
(ROOT/'catalogue.json').write_text(json.dumps(catalogue,ensure_ascii=False,indent=2),encoding='utf-8')
(ROOT/'citation-frequency.json').write_text(json.dumps({'stats':stats,'frequency':frequency},ensure_ascii=False,indent=2),encoding='utf-8')
columns=['id','title','authors','year','venue','volume','issue','pages','doi','sampleYear','sampleTopic','referenceListAvailable','referenceCount','recognisedFamilies','scope','note','baselineAdoption','url','metadataSource']
with (ROOT/'journal-references.csv').open('w',encoding='utf-8-sig',newline='')as stream:
    writer=csv.DictWriter(stream,fieldnames=columns);writer.writeheader()
    for paper in papers:writer.writerow({k:'; '.join(paper[k])if isinstance(paper.get(k),list)else paper.get(k,'')for k in columns})
with (ROOT/'citation-frequency.csv').open('w',encoding='utf-8-sig',newline='')as stream:
    writer=csv.DictWriter(stream,fieldnames=['family','papers','denominator','share','interpretation']);writer.writeheader();writer.writerows(frequency)
entries=[]
for paper,item in zip(papers,raw):
    names=['{'+a.get('family','')+'}, '+a.get('given','')for a in item.get('author',[])if a.get('family')]
    values={'title':'{'+paper['title']+'}','author':' and '.join(names),'journal':paper['venue'],'year':paper['year'],'volume':paper['volume'],'number':paper['issue'],'pages':paper['pages'],'doi':paper['doi'],'url':paper['url']}
    safe=lambda v:str(v).replace('&',r'\&').replace('%',r'\%').replace('_',r'\_')
    entries.append('@article{HEX'+paper['id']+',\n'+''.join(f'  {key} = {{{safe(value)}}},\n'for key,value in values.items()if value!='')+'}')
(ROOT/'journal-references.bib').write_text('\n\n'.join(entries)+'\n',encoding='utf-8')
index={p['key']:{'id':p['id'],'doi':p['doi'],'title':p['title'],'url':p['url']}for p in papers if p['key']}
for item in supplement:
    record=item.get('record',{});index[item['key']]={'title':title_of(record)if record else item.get('title'),'url':item['primaryUrl'],'type':record.get('type','technical-or-official'),'doi':record.get('DOI')}
(ROOT/'reference-index.json').write_text(json.dumps(index,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(stats,ensure_ascii=False));print(json.dumps(frequency,ensure_ascii=False,indent=2))
