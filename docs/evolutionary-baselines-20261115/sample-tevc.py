"""A method-name-independent, year-stratified citation sample, separate from query pools."""
import concurrent.futures,hashlib,json,re,sys,time,urllib.parse,urllib.request
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
ROOT=Path(__file__).resolve().parent
def pool(year):
    file=ROOT/f'year-{year}.json'
    if file.exists():
        cached=json.loads(file.read_text(encoding='utf-8'))
        if len(cached['records'])>=cached.get('totalResults',0):return cached
    query={'rows':1000,'sort':'published','order':'desc','filter':f'type:journal-article,from-pub-date:{year}-01-01,until-pub-date:{year}-'+('11-15'if year==2026 else'12-31')}
    url='https://api.crossref.org/journals/1089-778X/works?'+urllib.parse.urlencode(query)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'HEX-Baseline-Stratified-Sample/1.0'}),timeout=45)as response:data=json.load(response)['message']
            break
        except Exception:
            if attempt==2:raise
            time.sleep(2)
    records=data['items'];file.write_text(json.dumps({'source':url,'totalResults':data.get('total-results'),'records':records},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'year':year,'pool':len(records),'totalResults':data.get('total-results')}),flush=True)
    return {'source':url,'totalResults':data.get('total-results'),'records':records}
with concurrent.futures.ThreadPoolExecutor(max_workers=2)as executor:pools=list(executor.map(pool,range(2022,2027)))
selected=[];seen=set()
for year,data in zip(range(2022,2027),pools):
    choices=[r for r in data['records'] if r.get('type')=='journal-article'and r.get('DOI')and not re.search(r'\b(editorial|erratum|correction|retraction|contents|reviewers)\b',(r.get('title')or[''])[0],re.I)]
    choices=[r for r in choices if r.get('author') and not re.search(r'publication information|society information|information for authors|thank you for your authorship|call for papers|table of contents|cover page|editorial board',r['title'][0],re.I)]
    choices.sort(key=lambda r:hashlib.sha256(('HEX-20261115:'+r['DOI'].lower()).encode()).hexdigest())
    added=0
    for r in choices:
        if r['DOI'].lower()in seen:continue
        seen.add(r['DOI'].lower());selected.append({**r,'sampleTopic':'year-stratified','sampleYear':year,'sampleSource':data['source'],'evidenceScope':'出版社题录与参考文献编码；不等于全文基准采用编码'});added+=1
        if added==20:break
    if added<20:raise RuntimeError(f'Only {added} papers in {year}')
(ROOT/'tevc-stratified-100.json').write_text(json.dumps(selected,ensure_ascii=False,indent=2),encoding='utf-8')
corpus={r['DOI'].lower():r for r in selected}
for file in sorted(ROOT.glob('anchor-*.json')):
    a=json.loads(file.read_text(encoding='utf-8'))
    if a.get('ok')and a['record'].get('type')=='journal-article':
        r=a['record'];key=r['DOI'].lower()
        if key not in corpus:corpus[key]={**r,'sampleTopic':'foundation-or-review','anchorKey':a['key'],'evidenceScope':'题录核验；关键文献另补原始摘要或全文选读'}
        else:corpus[key]['anchorKey']=a['key']
(ROOT/'journal-corpus-raw.json').write_text(json.dumps(list(corpus.values()),ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'stratifiedTEVC':len(selected),'totalJournalPapers':len(corpus),'referencesAvailable':sum(bool(r.get('reference'))for r in corpus.values())}))
