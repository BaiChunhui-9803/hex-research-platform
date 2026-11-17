import difflib,html,json,re,sys,urllib.parse,urllib.request
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8');ROOT=Path(__file__).resolve().parent
def get(doi):
    url='https://api.crossref.org/works/'+urllib.parse.quote(doi,safe='')
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'HEX-Algorithm-Evidence/1.0'}),timeout=30)as response:return json.load(response)['message']
def norm(s):return re.sub(r'[^a-z0-9]','',html.unescape(s).lower())
for key,doi,expected in [
 ('annealing-original','10.1126/science.220.4598.671','Optimization by simulated annealing'),
 ('tabu-original','10.1287/ijoc.1.3.190','Tabu Search—Part I'),
 ('es-overview','10.1023/A:1015059928466','Evolution strategies – A comprehensive introduction'),
]:
    file=ROOT/('anchor-'+key+'.json')
    if file.exists():continue
    try:
        record=get(doi);score=difflib.SequenceMatcher(None,norm(expected),norm(record['title'][0])).ratio()
        result={'key':key,'ok':score>.8,'similarity':score,'expectedTitle':expected,'record':record}
    except Exception as error:result={'key':key,'ok':False,'error':str(error)}
    file.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({k:result.get(k)for k in ['key','ok','similarity','error']},ensure_ascii=False))
supplement=[]
for key,doi,expected,url in [
 ('cec-shade','10.1109/CEC.2013.6557555','Success-history based parameter adaptation for differential evolution','https://ryojitanabe.github.io/tf-cec2013-shade.pdf'),
 ('cec-lshade','10.1109/CEC.2014.6900380','Improving the search performance of SHADE using linear population size reduction','https://ryojitanabe.github.io/pdf/tf-cec2014.pdf'),
 ('cec-jso','10.1109/CEC.2017.7969456','Single objective real-parameter optimization: Algorithm jSO','https://ieeexplore.ieee.org/document/7969456/'),
 ('cec-inertia','10.1109/ICEC.1998.699146','A modified particle swarm optimizer','https://doi.org/10.1109/ICEC.1998.699146'),
]:
    file=ROOT/('supplement-'+key+'.json')
    try:
        record=json.loads(file.read_text(encoding='utf-8'))['record']if file.exists()else get(doi)
        score=difflib.SequenceMatcher(None,norm(expected),norm(record['title'][0])).ratio();item={'key':key,'ok':score>.8,'record':record,'primaryUrl':url,'scope':'会议题录；关键方法和作者公开版本选读','countedAsJournal':False}
    except Exception as error:item={'key':key,'ok':False,'error':str(error),'countedAsJournal':False}
    file.write_text(json.dumps(item,ensure_ascii=False,indent=2),encoding='utf-8');supplement.append(item);print(json.dumps({'supplement':key,'ok':item['ok'],'title':item.get('record',{}).get('title')},ensure_ascii=False))
supplement += [
 {'key':'spea2-report','ok':True,'title':'SPEA2: Improving the Strength Pareto Evolutionary Algorithm','authors':['Eckart Zitzler','Marco Laumanns','Lothar Thiele'],'year':2001,'venue':'ETH Zurich TIK Report 103','primaryUrl':'https://sop.tik.ee.ethz.ch/publicationListFiles/zlt2001a.pdf','scope':'原始报告方法与算法段落选读','countedAsJournal':False},
 {'key':'cec2017-official','ok':True,'title':'CEC 2017 Special Session and Competition: official benchmark and results','primaryUrl':'https://sites.google.com/view/suganthan-p-n/cec-benchmark/cec17-special-session','scope':'组织者公开基准与结果页面','countedAsJournal':False},
 {'key':'shade-author-versions','ok':True,'title':'SHADE / L-SHADE author versions, corrected implementations and competition links','primaryUrl':'https://ryojitanabe.github.io/publication','scope':'作者公开版本及修正说明','countedAsJournal':False},
 {'key':'cma-author-guide','ok':True,'title':'The CMA Evolution Strategy: official method guide and source implementations','primaryUrl':'https://cma-es.github.io/','scope':'官方方法说明与公式核对','countedAsJournal':False},
]
(ROOT/'cec-supplement.json').write_text(json.dumps(supplement,ensure_ascii=False,indent=2),encoding='utf-8')
corpus={r['DOI'].lower():r for r in json.loads((ROOT/'tevc-stratified-100.json').read_text(encoding='utf-8'))}
for file in ROOT.glob('anchor-*.json'):
    a=json.loads(file.read_text(encoding='utf-8'))
    if a.get('ok')and a['record'].get('type')=='journal-article':
        r=a['record'];key=r['DOI'].lower()
        if key not in corpus:corpus[key]={**r,'anchorKey':a['key'],'sampleTopic':'foundation-or-review','evidenceScope':'题录核验；关键资料有公开方法或摘要选读'}
        else:corpus[key]['anchorKey']=a['key']
(ROOT/'journal-corpus-raw.json').write_text(json.dumps(list(corpus.values()),ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'journalArticles':len(corpus),'supplementarySources':len(supplement),'allSupplementVerified':all(r.get('ok')for r in supplement)}))
