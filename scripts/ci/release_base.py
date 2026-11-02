"""Read release history; no GitHub writes. Missing history means full validation."""
import argparse
import json
import os
import re
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen


def api(path):
    request = Request(os.environ.get('GITHUB_API_URL', 'https://api.github.com') + path,
                      headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN'],
                               'Accept': 'application/vnd.github+json'})
    with urlopen(request, timeout=30) as response:
        return json.load(response)


def successful_base(repository, branch, current, request=api):
    query = urlencode({'branch': branch, 'event': 'push', 'status': 'success', 'per_page': 1})
    try:
        runs = request(f'/repos/{repository}/actions/workflows/ci.yml/runs?{query}')['workflow_runs']
        if not runs:
            return ''
        run = runs[0]
        sha = run['head_sha']
        # Rerunning a completed commit must not use itself as an empty baseline.
        if (run['conclusion'] != 'success' or run['event'] != 'push' or
                run['head_branch'] != branch or sha == current or not re.fullmatch(r'[0-9a-f]{40}', sha)):
            return ''
        return sha
    except (OSError, ValueError, KeyError, TypeError):
        return ''


def ensure_current(repository, branch, current, request=api):
    ref = request(f'/repos/{repository}/git/ref/heads/{quote(branch, safe="")}')
    if ref['object']['sha'] != current:
        raise ValueError('Branch advanced; this superseded run must not deploy or become the successful release baseline')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ensure-current', action='store_true')
    args = parser.parse_args()
    repository, branch, current = (os.environ[k] for k in ('GITHUB_REPOSITORY', 'GITHUB_REF_NAME', 'GITHUB_SHA'))
    if args.ensure_current:
        ensure_current(repository, branch, current)
        return
    base = successful_base(repository, branch, current)
    with open(os.environ['GITHUB_OUTPUT'], 'a') as stream:
        stream.write(f'base={base}\n')
    print('Using last successful push release' if base else 'No trusted successful release baseline; selecting all checks')


if __name__ == '__main__':
    main()
