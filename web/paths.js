const root = new URL("../", import.meta.url);

export function projectURL(path = "") {
  return new URL(path.replace(/^\/+/, ""), root).href;
}

export function evidenceURL(key) {
  const url = projectURL("docs/evolutionary-baselines-20261115/index.html");
  return key ? `${url}#ref-${encodeURIComponent(key)}` : url;
}
