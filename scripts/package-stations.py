"""Package only tracked launcher files; never include local credentials or data."""

import hashlib
import json
from pathlib import Path
import subprocess
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
destination = Path(sys.argv[1]).resolve()
destination.mkdir(parents=True, exist_ok=True)


def git(*args):
    return subprocess.check_output(["git", "-C", str(root), *args])


commit = git("rev-parse", "HEAD").decode().strip()
files = git("ls-tree", "-r", "--name-only", "HEAD").decode().splitlines()
hashes = []
for member, platform in [("Dariana", "windows"), ("Ian", "windows"),
                         ("Yariel", "windows"), ("Jose", "macos")]:
    selected = [f for f in files if f.startswith(f"equipo/{member}/") or
                f.startswith(f"orquestacion/{platform}/") or
                f.startswith("orquestacion/worker/") or
                f == "orquestacion/equipo.json"]
    launcher = f"equipo/{member}/INICIAR." + ("command" if platform == "macos" else "bat")
    if launcher not in selected:
        raise SystemExit(f"Missing launcher: {launcher}")
    archive = destination / f"FIRESYNC-{member}.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as output:
        for filename in selected:
            if filename.startswith(f"equipo/{member}/"):
                target = f"{member}/" + filename.removeprefix(f"equipo/{member}/")
            else:
                target = f"{member}/kit/{filename}"
            info = zipfile.ZipInfo(target)
            info.create_system = 3
            executable = filename.endswith((".command", ".sh"))
            info.external_attr = (0o100755 if executable else 0o100644) << 16
            output.writestr(info, git("show", f"HEAD:{filename}"),
                            compress_type=zipfile.ZIP_DEFLATED)
        output.writestr(f"{member}/VERSION.json", json.dumps({"commit": commit}, indent=2))
    with zipfile.ZipFile(archive) as verify:
        assert verify.testzip() is None
        assert not any(".." in Path(n).parts or n.startswith("/") for n in verify.namelist())
    hashes.append(f"{hashlib.sha256(archive.read_bytes()).hexdigest()}  {archive.name}")
(destination / "SHA256SUMS.txt").write_text("\n".join(hashes) + "\n", encoding="utf-8")
print("\n".join(hashes))
