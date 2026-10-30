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
        run.stop(child)
        killpg.assert_called_once_with(123, run.signal.SIGTERM)
        child.wait.assert_called_once_with(timeout=5)

    @patch('run.os.killpg')
    def test_timeout_escalates_owned_group(self, killpg):
        child = Mock(pid=123)
        child.wait.side_effect = [run.subprocess.TimeoutExpired('synthetic', 5), 0]
        run.stop(child)
        self.assertEqual(killpg.call_args_list, [unittest.mock.call(123, run.signal.SIGTERM),
                                               unittest.mock.call(123, run.signal.SIGKILL)])


if __name__ == '__main__':
    unittest.main()
