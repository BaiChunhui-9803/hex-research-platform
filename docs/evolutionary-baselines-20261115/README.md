# 演化算法文献与接入证据

主入口：`http://127.0.0.1:4175/docs/evolutionary-baselines-20261115/index.html`。

- `catalogue.json`：130篇独立期刊论文（112篇TEVC），另列8项会议／报告／官方资料。
- `journal-references.csv`、`journal-references.bib`：完整题录。
- `citation-frequency.csv`：100篇分年样本中86篇可解析引文的覆盖；不是采用率。
- `review.zh-CN.html`／`.md`：方法选择、编码、实现边界和验证说明。
- `reference-index.json`：方法条目到原始资料的映射。
- `algorithm-catalogue.json`：28种已接入方法的元数据。

采集与分析次序：collect-literature.py（定向候选与原始锚点）→ sample-tevc.py（最终中立分年样本）→ collect-supplement.py（补充锚点与独立会议资料）→ build-evidence.py → render-evidence.py。

不声称130篇全文精读；阅读范围逐项标记。候选检索池和原始Crossref缓存不直接计入最终文献数量，也不需要由网页加载。原始SHADE、L-SHADE及SPEA2方法资料独立列出，不冒充期刊论文。
