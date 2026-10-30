#!/usr/bin/env python3
"""Own one fixture and browser child; run in a loopback-only network namespace."""
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.request
from download import BINARY_SHA, digest

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'tools/out/ci'
BASE = 'http://127.0.0.1:18080/ui/'


def stop(child):
    if child is None:
        return
    # Only groups created by this invocation, never ps/proc discovery or PID files.
    try:
        os.killpg(child.pid, signal.SIGTERM)
        child.wait(timeout=5)
    except subprocess.TimeoutExpired:
        os.killpg(child.pid, signal.SIGKILL)
        child.wait(timeout=5)
    except ProcessLookupError:
        pass


def interrupted(signum, frame):
    raise SystemExit(128 + signum)


def main():
    binary = Path(sys.argv[1]).resolve(strict=True)
    if digest(binary) != BINARY_SHA:
        raise ValueError('Fixture binary does not match the approved pin')
    # Fail closed if isolation was omitted, including IPv6/link-local interfaces.
    interfaces = {line.split(':', 1)[0].strip()
                  for line in Path('/proc/net/dev').read_text().splitlines()[2:]}
    if interfaces != {'lo'} or Path('/proc/net/route').read_text().strip().splitlines()[1:]:
        raise ValueError('Run fixture in an isolated network namespace (loopback only)')
    OUT.mkdir(parents=True, exist_ok=True)
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, interrupted)
    server = browser = None
    with tempfile.TemporaryDirectory(prefix='varnish-ci-') as directory:
        home = Path(directory)
        config = home / 'config/term-llm'
        extension = config / 'extensions/varnish'
        extension.mkdir(parents=True)
        # Explicit runtime allowlist: never copy ignored local.json, git, or tools/out.
        for file in ['extension.yaml', 'style.css', 'main.js', 'util.js', 'thread.js',
                     'composer.js', 'palette.js', 'notify.js', 'favicon.js', 'LICENSE']:
            shutil.copyfile(ROOT / file, extension / file)
        shutil.copytree(ROOT / 'fonts', extension / 'fonts')
        (extension / 'local.json').write_text('{}\n')
        (config / 'config.yaml').write_text(
            'default_provider: debug\nproviders:\n  debug:\n    model: fast\n'
            'sessions:\n  enabled: true\nserve:\n  projects:\n    enabled: false\n')
        env = {'HOME': str(home), 'XDG_CONFIG_HOME': str(home / 'config'),
               'XDG_DATA_HOME': str(home / 'data'), 'XDG_CACHE_HOME': str(home / 'cache'),
               'PATH': os.environ['PATH'], 'LANG': 'C.UTF-8',
               'PLAYWRIGHT_BROWSERS_PATH': os.environ['PLAYWRIGHT_BROWSERS_PATH']}
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        (OUT / 'fixture.json').write_text(json.dumps({
            'synthetic': True, 'sessions': [], 'localSettings': {},
            'provider': 'debug:fast', 'binarySHA256': BINARY_SHA,
            'network': 'loopback-only namespace',
        }, indent=2) + '\n')
        try:
            with (OUT / 'server.log').open('w') as log:
                server = subprocess.Popen([
                    str(binary), 'serve', 'web', '--host', '127.0.0.1', '--port', '18080',
                    '--auth', 'none', '--base-path', '/ui', '--provider', 'debug:fast',
                    '--no-projects', '--no-search', '--no-native-search', '--approval', 'prompt',
                    '--disable-location-sharing', '--disable-widgets', '--extensions', 'varnish',
                ], cwd=home, env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                    start_new_session=True)
                deadline = time.monotonic() + 45
                while True:
                    if server.poll() is not None:
                        raise RuntimeError('Fixture exited before readiness; see server.log')
                    try:
                        with opener.open(BASE + 'admin/extensions/status', timeout=2) as response:
                            status = json.load(response)
                        if 'varnish' in status.get('enabled', []) and not status.get('errors'):
                            break
                    except (OSError, ValueError):
                        pass
                    if time.monotonic() >= deadline:
                        raise TimeoutError('Fixture readiness timed out')
                    time.sleep(0.25)
                browser = subprocess.Popen(['node', str(ROOT / 'tools/ci/browser.mjs')],
                                           cwd=ROOT, env=env, start_new_session=True)
                code = browser.wait(timeout=180)
                if code:
                    raise RuntimeError(f'Browser check failed ({code})')
        finally:
            try:
                stop(browser)
            finally:
                stop(server)


if __name__ == '__main__':
    main()
