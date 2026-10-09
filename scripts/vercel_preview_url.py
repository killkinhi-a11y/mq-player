#!/usr/bin/env python3
"""Find the Vercel PREVIEW deployment URL for a branch via the GitHub API.

Vercel's GitHub App creates a deployment (environment=Preview) for pushed
branches and reports status URLs like
https://<project>-<hash>-<scope>.vercel.app.

Usage: vercel_preview_url.py <branch> [timeout_seconds] [--wait-ready]
"""
import json
import subprocess
import sys
import time
import urllib.request

REPO = "killkinhi-a11y/mq-player"


def gh_token() -> str:
    url = subprocess.run(
        ["git", "config", "--get", "remote.origin.url"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    # https://<user>:<token>@github.com/<repo>.git
    creds = url.split("//", 1)[1].split("@", 1)[0]
    return creds.split(":", 1)[1]


def api(path: str, token: str):
    req = urllib.request.Request(
        f"https://api.github.com{path}",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "User-Agent": "mq-deploy-check",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.load(r)
    except Exception as e:
        return {"error": str(e)}


def main() -> int:
    branch = sys.argv[1]
    timeout = int(sys.argv[2]) if len(sys.argv) > 2 else 420
    wait_ready = "--wait-ready" in sys.argv
    token = gh_token()
    sha = api(f"/repos/{REPO}/commits/{branch}", token).get("sha", "")
    print(f"branch={branch} sha={sha[:10]}", file=sys.stderr)

    start = time.time()
    last = ""
    while time.time() - start < timeout:
        deps = api(f"/repos/{REPO}/deployments?sha={sha}&per_page=10", token)
        if isinstance(deps, list) and deps:
            dep = deps[0]
            statuses = api(f"/repos/{REPO}/deployments/{dep['id']}/statuses", token)
            if isinstance(statuses, list) and statuses:
                st = statuses[0]
                env_url = st.get("target_url") or st.get("environment_url") or ""
                state = st.get("state", "?")
                msg = f"state={state} url={env_url}"
                if msg != last:
                    print(msg, file=sys.stderr)
                    last = msg
                if env_url:
                    if not wait_ready or state == "success":
                        print(env_url)
                        return 0
        time.sleep(12)
    print("TIMEOUT waiting for preview deployment", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
