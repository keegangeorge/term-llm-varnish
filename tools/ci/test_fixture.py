"""Pure tooling tests: no server/browser process is started."""
import hashlib
import io
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch, Mock

import download
import run


class ArchiveTests(unittest.TestCase):
    def archive(self, root, name='term-llm', kind=tarfile.REGTYPE):
        archive = root / 'fixture.tar.gz'
        with tarfile.open(archive, 'w:gz') as bundle:
            member = tarfile.TarInfo(name)
            member.type = kind
            data = b'synthetic binary bytes; never executed'
            if kind == tarfile.REGTYPE:
                member.size = len(data)
            bundle.addfile(member, io.BytesIO(data) if member.isfile() else None)
        return archive, hashlib.sha256(data).hexdigest()

    def test_checksum_and_exact_member(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive, binary_sha = self.archive(root)
            with patch.object(download, 'ARCHIVE_SHA', download.digest(archive)), \
                    patch.object(download, 'BINARY_SHA', binary_sha):
                download.extract(archive, root / 'output')
            self.assertEqual(download.digest(root / 'output'), binary_sha)

    def test_archive_checksum_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive, _ = self.archive(root)
            with self.assertRaises(ValueError):
                download.extract(archive, root / 'output')
            self.assertFalse((root / 'output').exists())

    def test_bad_members_rejected(self):
        for name, kind in [('../term-llm', tarfile.REGTYPE), ('/term-llm', tarfile.REGTYPE),
                           ('term-llm', tarfile.SYMTYPE), ('nested/term-llm', tarfile.REGTYPE)]:
            with self.subTest(name=name, kind=kind), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                archive, _ = self.archive(root, name, kind)
                with patch.object(download, 'ARCHIVE_SHA', download.digest(archive)):
                    with self.assertRaises(ValueError):
                        download.extract(archive, root / 'output')
                self.assertFalse((root / 'output').exists())

    def test_binary_checksum_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive, _ = self.archive(root)
            with patch.object(download, 'ARCHIVE_SHA', download.digest(archive)):
                with self.assertRaises(ValueError):
                    download.extract(archive, root / 'output')
            self.assertFalse((root / 'output').exists())


class CleanupTests(unittest.TestCase):
    @patch('run.os.killpg')
    def test_cleanup_targets_only_owned_group(self, killpg):
        child = Mock(pid=123)
        killpg.side_effect = [None, ProcessLookupError]
        run.stop(child)
        self.assertEqual(killpg.call_args_list, [unittest.mock.call(123, run.signal.SIGTERM),
                                               unittest.mock.call(123, 0)])
        child.wait.assert_called_once_with(timeout=5)

    @patch('run.time.sleep')
    @patch('run.time.monotonic', side_effect=[0, 1, 6])
    @patch('run.os.killpg')
    def test_exited_leader_still_escalates_owned_group(self, killpg, monotonic, sleep):
        child = Mock(pid=123)
        child.poll.return_value = 0
        run.stop(child)
        self.assertEqual(killpg.call_args_list, [unittest.mock.call(123, run.signal.SIGTERM),
                                               unittest.mock.call(123, 0),
                                               unittest.mock.call(123, run.signal.SIGKILL)])
        child.wait.assert_called_once_with(timeout=5)

    def test_real_descendant_ignoring_term_after_leader_exits(self):
        # Synthetic processes only; run this test in the dedicated VM.
        import os
        import subprocess
        import sys
        import time
        descendant = ('import os,signal,time; signal.signal(signal.SIGTERM, signal.SIG_IGN); '
                      'print(os.getpid(),flush=True); time.sleep(60)')
        leader = ('import subprocess,sys,time; '
                  f'subprocess.Popen([sys.executable,"-c",{descendant!r}]); time.sleep(60)')
        child = subprocess.Popen([sys.executable, '-c', leader], start_new_session=True,
                                 stdout=subprocess.PIPE, text=True)
        try:
            import select
            self.assertTrue(select.select([child.stdout], [], [], 5)[0], 'descendant ready')
            pid = int(child.stdout.readline())
            started = time.monotonic()
            run.stop(child)
            self.assertLess(time.monotonic() - started, 12)
            self.assertIsNotNone(child.poll())
            # An orphan zombie awaiting container-init reaping is not a live process.
            state = Path(f'/proc/{pid}/stat')
            deadline = time.monotonic() + 2
            while state.exists() and state.read_text().split()[2] != 'Z' and time.monotonic() < deadline:
                time.sleep(0.05)
            self.assertTrue(not state.exists() or state.read_text().split()[2] == 'Z')
        finally:
            try:
                os.killpg(child.pid, run.signal.SIGKILL)
            except ProcessLookupError:
                pass
            child.wait(timeout=5)
            child.stdout.close()

if __name__ == '__main__':
    unittest.main()
