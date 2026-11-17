"""Standard-library client for the unified environment API. Start the server first."""
import json
import urllib.request

BASE = "http://127.0.0.1:4175"

def call(path, data=None, method=None):
    payload = json.dumps(data).encode() if data is not None else None
    request = urllib.request.Request(BASE + path, payload,
        headers={"Content-Type": "application/json"}, method=method or ("POST" if payload else "GET"))
    with urllib.request.urlopen(request) as response:
        return json.load(response)

if __name__ == "__main__":
    print([(p["id"], len(p["scenarios"])) for p in call("/api/problems")])
    session = call("/api/sessions", {"problemId": "skirmish", "config": {"scenarioId": "contact"}})
    identifier = session["id"]
    try:
        observation = call(f"/api/sessions/{identifier}/observe")
        own = observation["own"]
        target = observation["enemies"][0]["id"]
        call(f"/api/sessions/{identifier}/actions", {"action": {"type": "commands", "orders": [
            {"unitIds": [u["id"] for u in own], "type": "attack", "targetId": target}
        ]}})
        state = call(f"/api/sessions/{identifier}/step", {"steps": 20})
        print(state["metrics"])
    finally:
        call(f"/api/sessions/{identifier}", method="DELETE")
