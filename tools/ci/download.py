#!/usr/bin/env python3
"""Download only the fixed official Linux amd64 fixture; never execute it."""
import hashlib
from pathlib import Path, PurePosixPath
import sys
import tarfile
import subprocess

URL = 'https://github.com/SamSaffron/term-llm/releases/download/v0.9.88/term-llm_0.9.88_linux_amd64.tar.gz'
ARCHIVE_SHA = 'e7befc8b5e6fa768c5d2574d5b015f40979979e8a7b36ff47e06c2477f1b25e1'
BINARY_SHA = '320c5faa3379ae7a52ea9050c8514684e5da71326da0c5d899c6a5405d72bff0'


def digest(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def extract(archive, destination):
    if digest(archive) != ARCHIVE_SHA:
        raise ValueError('Official archive checksum mismatch')
    with tarfile.open(archive, 'r:gz') as bundle:
        # Inspect every member before extracting only the exact regular binary.
        members = bundle.getmembers()
        for member in members:
            name = PurePosixPath(member.name)
            if name.is_absolute() or '..' in name.parts or member.issym() or member.islnk():
                raise ValueError('Unsafe archive member')
        binaries = [m for m in members if m.name == 'term-llm' and m.isfile()]
        if len(binaries) != 1:
            raise ValueError('Expected one root term-llm binary')
        data = bundle.extractfile(binaries[0]).read()
        if hashlib.sha256(data).hexdigest() != BINARY_SHA:
            raise ValueError('Extracted fixture checksum mismatch')
        Path(destination).write_bytes(data)
        Path(destination).chmod(0o700)


if __name__ == '__main__':
    destination = Path(sys.argv[1]).resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    archive = destination.with_suffix('.tar.gz')
    try:
        subprocess.run(['curl', '--fail', '--silent', '--show-error', '--location',
                        '--proto', '=https', '--proto-redir', '=https',
                        '--connect-timeout', '15', '--max-time', '120',
                        '--output', str(archive), URL], check=True)
        if archive.stat().st_size != 22354359:
            raise ValueError('Unexpected archive size')
        extract(archive, destination)
    finally:
        archive.unlink(missing_ok=True)
