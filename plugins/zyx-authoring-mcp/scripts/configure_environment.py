#!/usr/bin/env python3
"""Deterministic multi-host generator, allowlist packager, doctor, and sync CLI for Zyx Authoring MCP."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit


ENVIRONMENTS: dict[str, dict[str, str]] = {
    "production": {
        "environment": "production",
        "plugin_id": "zyx-authoring-mcp",
        "display_name": "Zyx Authoring MCP",
        "server_id": "zyx-authoring-production",
        "endpoint": "https://www.zyxacademy.com/api/mcp/authoring",
        "homepage": "https://www.zyxacademy.com/",
        "brand_color": "#2563EB",
        "short_description": "Author production Zyx content through MCP quality gates.",
    },
    "staging": {
        "environment": "staging",
        "plugin_id": "zyx-authoring-mcp-staging",
        "display_name": "Zyx Authoring MCP (Staging)",
        "server_id": "zyx-authoring-staging",
        "endpoint": "https://staging.zyxacademy.com/api/mcp/authoring",
        "homepage": "https://staging.zyxacademy.com/",
        "brand_color": "#F59E0B",
        "short_description": "Author staging Zyx content through MCP quality gates.",
    },
}

LEGACY_SERVER_IDS = {"zyx-authoring", "zyx-mcp"}
KNOWN_ZYX_SERVER_IDS = {cfg["server_id"] for cfg in ENVIRONMENTS.values()} | LEGACY_SERVER_IDS

EXPECTED_SKILLS = (
    "zyx-authoring-pipeline",
    "zyx-source-pack-mcp",
    "zyx-idea-bundle-mcp",
    "zyx-product-bundle-mcp",
    "zyx-question-authoring-mcp",
    "reference-question-ingest",
)

BASE_ALLOWED_FILES = {
    "release.json",
    "plugin.json",
    "README.md",
    ".mcp.json",
    "mcp_config.json",
    "claude-desktop-config.example.json",
    ".codex-plugin/plugin.json",
    ".claude-plugin/plugin.json",
    "assets/logo.png",
    "assets/logo.svg",
    "scripts/configure_environment.py",
}

OWNERSHIP_MARKER_FILENAME = ".zyx-managed-plugin.json"
SEMVER_RE = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$")
SECRET_PATTERNS = [
    re.compile(r"(Bearer\s+)[A-Za-z0-9._\-+/=]+", re.IGNORECASE),
    re.compile(r"(x-access-token:)[^@\s\"']+", re.IGNORECASE),
    re.compile(r"((?:token|secret|password|authorization|cookie|api[_-]?key)\s*[:=]\s*[\"']?)[^\"'\s,}]+", re.IGNORECASE),
]


def parse_semver(version: str) -> tuple[int, int, int]:
    """Parse a strict MAJOR.MINOR.PATCH SemVer string."""
    if not isinstance(version, str):
        raise ValueError("Version must be a string")
    match = SEMVER_RE.match(version.strip())
    if not match:
        raise ValueError(f"Invalid SemVer version: {version!r}")
    return int(match.group(1)), int(match.group(2)), int(match.group(3))


def redact_secrets(text: str) -> str:
    """Redact credentials, bearer tokens, cookies, and secret values from diagnostic strings."""
    sanitized = text
    for pattern in SECRET_PATTERNS:
        sanitized = pattern.sub(r"\1[REDACTED]", sanitized)
    return sanitized


def normalize_endpoint_origin(raw_url: str) -> str:
    """Normalize an endpoint URL while stripping userinfo, query parameters, and fragments."""
    if not isinstance(raw_url, str) or not raw_url.strip():
        return ""
    try:
        parts = urlsplit(raw_url.strip())
    except ValueError:
        return "[INVALID_URL]"
    if not parts.scheme or not parts.hostname:
        return "[INVALID_URL]"
    host = parts.hostname.lower()
    netloc = f"{host}:{parts.port}" if parts.port else host
    clean_path = parts.path.rstrip("/") or "/"
    return urlunsplit((parts.scheme.lower(), netloc, clean_path, "", ""))


def allowed_package_files(skills: tuple[str, ...] = EXPECTED_SKILLS) -> set[str]:
    """Return the exact set of relative POSIX file paths permitted in a built plugin package."""
    allowed = set(BASE_ALLOWED_FILES)
    for skill in skills:
        allowed.add(f"skills/{skill}/SKILL.md")
        allowed.add(f"skills/{skill}/agents/openai.yaml")
    return allowed


def is_ignored_source_only_path(rel_posix: str) -> bool:
    """Return True for local unit test or Python cache files that are excluded from packaging."""
    parts = rel_posix.split("/")
    if "__pycache__" in parts or any(part.endswith((".pyc", ".pyo")) for part in parts):
        return True
    if parts[-1] in {".DS_Store", "Thumbs.db"}:
        return True
    if parts[0] == "tests" and (len(parts) == 1 or parts[-1].startswith("test_") or parts[-1] == "__init__.py"):
        return True
    return False


def is_symlink_or_reparse(path: Path) -> bool:
    """Detect symlinks and Windows junctions/reparse points without following them."""
    if path.is_symlink():
        return True
    try:
        st = os.lstat(path)
        file_attrs = getattr(st, "st_file_attributes", 0)
        # FILE_ATTRIBUTE_REPARSE_POINT = 0x400
        if file_attrs & 0x400:
            return True
    except FileNotFoundError:
        return False
    except OSError:
        return True
    return False


def read_json(file_path: Path) -> dict[str, Any]:
    """Read a UTF-8 JSON object from disk."""
    data = json.loads(file_path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{file_path.name} must contain a top-level JSON object")
    return data


def write_json(file_path: Path, value: dict[str, Any]) -> None:
    """Write a UTF-8 JSON object with deterministic 2-space indentation and LF newlines."""
    file_path.parent.mkdir(parents=True, exist_ok=True)
    content = f"{json.dumps(value, indent=2)}\n".replace("\r\n", "\n")
    file_path.write_text(content, encoding="utf-8", newline="\n")


def write_text_lf(file_path: Path, content: str) -> None:
    """Write UTF-8 text normalized to LF line endings."""
    file_path.parent.mkdir(parents=True, exist_ok=True)
    normalized = content.replace("\r\n", "\n").replace("\r", "\n")
    file_path.write_text(normalized, encoding="utf-8", newline="\n")


def load_release_metadata(plugin_root: Path) -> dict[str, Any]:
    """Load and validate canonical release.json metadata."""
    release_path = plugin_root / "release.json"
    if not release_path.is_file():
        raise ValueError(f"Missing canonical release metadata: {release_path}")
    release = read_json(release_path)
    parse_semver(str(release.get("version", "")))
    parse_semver(str(release.get("minCompatibleVersion", "")))
    protocol = release.get("bootstrapProtocol")
    if not isinstance(protocol, int) or isinstance(protocol, bool) or protocol < 1:
        raise ValueError("release.json bootstrapProtocol must be a positive integer")
    skills = release.get("skills")
    if not isinstance(skills, list) or tuple(skills) != EXPECTED_SKILLS:
        raise ValueError(f"release.json skills must match canonical skill list: {list(EXPECTED_SKILLS)}")
    return release


def inspect_source_tree(plugin_root: Path) -> list[str]:
    """Validate the source plugin tree against the strict allowlist and return allowed relative paths."""
    if not plugin_root.is_dir():
        raise ValueError(f"Plugin root does not exist: {plugin_root}")
    if is_symlink_or_reparse(plugin_root):
        raise ValueError("Plugin root must not be a symlink or reparse point")

    release = load_release_metadata(plugin_root)
    allowed = allowed_package_files(tuple(release["skills"]))
    discovered_allowed: set[str] = set()

    for root, dirs, files in os.walk(plugin_root, topdown=True, followlinks=False):
        root_path = Path(root)
        for d in list(dirs):
            dir_path = root_path / d
            rel_dir = dir_path.relative_to(plugin_root).as_posix()
            if is_symlink_or_reparse(dir_path):
                raise ValueError(f"Disallowed symlink or reparse directory in plugin tree: {rel_dir}")
            if is_ignored_source_only_path(rel_dir):
                dirs.remove(d)
                continue
            if d.startswith(".git") or d == "references":
                raise ValueError(f"Disallowed directory in plugin tree: {rel_dir}")

        for f in files:
            file_path = root_path / f
            rel_file = file_path.relative_to(plugin_root).as_posix()
            if is_symlink_or_reparse(file_path):
                raise ValueError(f"Disallowed symlink or reparse file in plugin tree: {rel_file}")
            if rel_file == OWNERSHIP_MARKER_FILENAME:
                continue
            if is_ignored_source_only_path(rel_file):
                continue
            if f.endswith(".zip") or f.startswith(".env"):
                raise ValueError(f"Disallowed archive or secret file in plugin tree: {rel_file}")
            if rel_file not in allowed:
                raise ValueError(f"Disallowed file outside package allowlist: {rel_file}")
            discovered_allowed.add(rel_file)

    missing = sorted(allowed - discovered_allowed)
    if missing:
        raise ValueError(f"Plugin tree is missing required allowlist files: {', '.join(missing)}")

    return sorted(discovered_allowed)


def is_repo_source_plugin_dir(path: Path) -> bool:
    """Return True if path points to the live repository source plugins/zyx-authoring-mcp directory."""
    resolved = path.resolve()
    repo_candidate = resolved.parent.parent
    return (
        resolved.name == "zyx-authoring-mcp"
        and resolved.parent.name == "plugins"
        and (repo_candidate / "package.json").exists()
        and (repo_candidate / "next.config.ts").exists()
    )


def validate_output_directory(plugin_root: Path, output_dir: Path) -> None:
    """Ensure output_dir does not overwrite the repository root or overlap unsafely with plugin_root."""
    if any(is_symlink_or_reparse(part) for part in (output_dir, *output_dir.parents)):
        raise ValueError("Refusing to write through symlink or reparse output path")
    src = plugin_root.resolve()
    dst = output_dir.resolve()
    if dst == Path(dst.anchor):
        raise ValueError("Refusing to use filesystem root as output directory")
    if src == dst:
        raise ValueError("Output directory must be separate from source plugin_root")
    if src in dst.parents or dst in src.parents:
        raise ValueError("Output directory must not overlap with source plugin_root")
    if is_repo_source_plugin_dir(dst):
        raise ValueError("Refusing to overwrite repository source plugin directory")


def copy_allowlisted_tree(plugin_root: Path, output_dir: Path) -> list[str]:
    """Copy only allowlisted files from plugin_root into a clean output_dir."""
    validate_output_directory(plugin_root, output_dir)
    allowed_files = inspect_source_tree(plugin_root)

    if output_dir.exists():
        if is_symlink_or_reparse(output_dir):
            raise ValueError("Refusing to write to symlink or reparse output directory")
        if any(output_dir.iterdir()):
            marker = output_dir / OWNERSHIP_MARKER_FILENAME
            if not marker.is_file() or read_json(marker).get("managedBy") != "zyx-authoring-mcp-build":
                raise ValueError("Refusing to overwrite unmanaged non-empty output directory")
            existing_files = inspect_source_tree(output_dir)
            for rel_posix in existing_files:
                (output_dir / rel_posix).unlink()
    output_dir.mkdir(parents=True, exist_ok=True)

    for rel_posix in allowed_files:
        src_file = plugin_root / Path(rel_posix)
        dst_file = output_dir / Path(rel_posix)
        dst_file.parent.mkdir(parents=True, exist_ok=True)
        if rel_posix.endswith((".json", ".md", ".yaml", ".py")):
            write_text_lf(dst_file, src_file.read_text(encoding="utf-8"))
        else:
            shutil.copy2(src_file, dst_file)

    write_json(output_dir / OWNERSHIP_MARKER_FILENAME, {"managedBy": "zyx-authoring-mcp-build"})
    return allowed_files


def render_mcp_configs(target_root: Path, config: dict[str, str]) -> None:
    """Render host-specific MCP configuration files from the canonical environment mapping."""
    write_json(
        target_root / ".mcp.json",
        {
            "mcpServers": {
                config["server_id"]: {
                    "type": "http",
                    "url": config["endpoint"],
                }
            }
        },
    )
    write_json(
        target_root / "mcp_config.json",
        {
            "mcpServers": {
                config["server_id"]: {
                    "serverUrl": config["endpoint"],
                }
            }
        },
    )
    write_json(
        target_root / "claude-desktop-config.example.json",
        {
            "mcpServers": {
                config["server_id"]: {
                    "type": "streamable-http",
                    "url": config["endpoint"],
                }
            }
        },
    )


def validate_rendered_package(target_root: Path, environment: str) -> dict[str, Any]:
    """Verify rendered manifests, MCP configs, skills, and absence of legacy server IDs or secrets."""
    if environment not in ENVIRONMENTS:
        raise ValueError(f"Unsupported environment: {environment!r}")
    config = ENVIRONMENTS[environment]
    other_env = "production" if environment == "staging" else "staging"
    other_config = ENVIRONMENTS[other_env]

    allowed_files = inspect_source_tree(target_root)
    release = load_release_metadata(target_root)
    version = str(release["version"])
    protocol = int(release["bootstrapProtocol"])

    claude_manifest = read_json(target_root / ".claude-plugin" / "plugin.json")
    codex_manifest = read_json(target_root / ".codex-plugin" / "plugin.json")
    for manifest_name, manifest in (
        (".claude-plugin/plugin.json", claude_manifest),
        (".codex-plugin/plugin.json", codex_manifest),
    ):
        if manifest.get("name") != config["plugin_id"]:
            raise ValueError(f"{manifest_name} name mismatch: {manifest.get('name')!r}")
        if manifest.get("version") != version:
            raise ValueError(f"{manifest_name} version {manifest.get('version')!r} != {version!r}")
        if manifest.get("homepage") != config["homepage"]:
            raise ValueError(f"{manifest_name} homepage mismatch")
        if "bootstrapProtocol" in manifest:
            raise ValueError(f"{manifest_name} must not contain custom bootstrapProtocol field")

    root_manifest = read_json(target_root / "plugin.json")
    if root_manifest.get("name") != config["plugin_id"]:
        raise ValueError(f"plugin.json name mismatch: {root_manifest.get('name')!r}")
    if root_manifest.get("displayName") != config["display_name"]:
        raise ValueError(f"plugin.json displayName mismatch: {root_manifest.get('displayName')!r}")
    if root_manifest.get("description") != config["short_description"]:
        raise ValueError("plugin.json description mismatch")

    mcp_checks = [
        (".mcp.json", "url", "http"),
        ("mcp_config.json", "serverUrl", None),
        ("claude-desktop-config.example.json", "url", "streamable-http"),
    ]
    for rel_path, url_key, expected_type in mcp_checks:
        data = read_json(target_root / rel_path)
        servers = data.get("mcpServers")
        if not isinstance(servers, dict) or len(servers) != 1:
            raise ValueError(f"{rel_path} must contain exactly one mcpServers entry")
        server_id, entry = next(iter(servers.items()))
        if server_id in LEGACY_SERVER_IDS:
            raise ValueError(f"{rel_path} contains legacy server ID {server_id!r}")
        if server_id != config["server_id"]:
            raise ValueError(f"{rel_path} server ID {server_id!r} != {config['server_id']!r}")
        if not isinstance(entry, dict) or entry.get(url_key) != config["endpoint"]:
            raise ValueError(f"{rel_path} endpoint mismatch")
        if expected_type is not None and entry.get("type") != expected_type:
            raise ValueError(f"{rel_path} transport type {entry.get('type')!r} != {expected_type!r}")
        if expected_type is None and "type" in entry:
            raise ValueError(f"{rel_path} must not include transport type field")
        for forbidden_key in ("headers", "authorization", "token", "apiKey", "env"):
            if forbidden_key in entry:
                raise ValueError(f"{rel_path} must not contain credential field {forbidden_key!r}")

    for skill in EXPECTED_SKILLS:
        skill_path = target_root / "skills" / skill / "SKILL.md"
        skill_text = skill_path.read_text(encoding="utf-8")
        if f"`{config['server_id']}`" not in skill_text or config["endpoint"] not in skill_text:
            raise ValueError(f"skills/{skill}/SKILL.md is missing active environment connection block")
        if other_config["endpoint"] in skill_text or f"`{other_config['server_id']}`" in skill_text:
            raise ValueError(f"skills/{skill}/SKILL.md contains cross-environment endpoint or server ID")
        if "workflow.get_playbook" not in skill_text:
            raise ValueError(f"skills/{skill}/SKILL.md must require workflow.get_playbook bootstrap")
        if "references/" in skill_text:
            raise ValueError(f"skills/{skill}/SKILL.md must not reference deleted local references/*.md")

    payload_hash, file_hashes = compute_package_payload_hash(target_root, allowed_files)
    return {
        "environment": environment,
        "pluginId": config["plugin_id"],
        "serverId": config["server_id"],
        "endpoint": config["endpoint"],
        "version": version,
        "bootstrapProtocol": protocol,
        "payloadHash": payload_hash,
        "fileCount": len(allowed_files),
        "fileHashes": file_hashes,
    }


def compute_package_payload_hash(
    target_root: Path, allowed_files: list[str] | None = None
) -> tuple[str, dict[str, str]]:
    """Compute a deterministic SHA-256 hash across all allowlisted package files."""
    files = sorted(allowed_files) if allowed_files is not None else inspect_source_tree(target_root)
    overall = hashlib.sha256()
    file_hashes: dict[str, str] = {}
    for rel_posix in files:
        file_path = target_root / Path(rel_posix)
        raw_bytes = file_path.read_bytes()
        if rel_posix.endswith((".json", ".md", ".yaml", ".py")):
            raw_bytes = raw_bytes.replace(b"\r\n", b"\n").replace(b"\r", b"\n")
        digest = hashlib.sha256(raw_bytes).hexdigest()
        file_hashes[rel_posix] = digest
        overall.update(f"{rel_posix}:{digest}\n".encode("utf-8"))
    return overall.hexdigest(), file_hashes


def configure_plugin(
    plugin_root: Path,
    environment: str,
    output_dir: Path | None = None,
    allow_in_place: bool = False,
) -> dict[str, Any]:
    """Configure the plugin package for a target environment (into output_dir or build tree)."""
    if environment not in ENVIRONMENTS:
        raise ValueError(f"Unknown environment {environment!r}. Expected one of: {', '.join(ENVIRONMENTS)}")

    target_root = plugin_root.resolve()
    if output_dir is not None:
        validate_output_directory(plugin_root, output_dir)
        target_root = output_dir.resolve()
        copy_allowlisted_tree(plugin_root.resolve(), target_root)
    else:
        if is_repo_source_plugin_dir(target_root) and not allow_in_place:
            raise ValueError(
                "Refusing to mutate repository source plugin directory in place without --output-dir "
                "(or explicit --allow-in-place)."
            )
        inspect_source_tree(target_root)

    release = load_release_metadata(target_root)
    version = str(release["version"])
    protocol = int(release["bootstrapProtocol"])
    config = ENVIRONMENTS[environment]

    render_mcp_configs(target_root, config)

    claude_manifest_path = target_root / ".claude-plugin" / "plugin.json"
    claude_manifest = read_json(claude_manifest_path)
    claude_manifest.update(
        {
            "name": config["plugin_id"],
            "version": version,
            "homepage": config["homepage"],
            "description": config["short_description"],
        }
    )
    write_json(claude_manifest_path, claude_manifest)

    codex_manifest_path = target_root / ".codex-plugin" / "plugin.json"
    codex_manifest = read_json(codex_manifest_path)
    codex_manifest.update(
        {
            "name": config["plugin_id"],
            "version": version,
            "homepage": config["homepage"],
            "description": config["short_description"],
        }
    )
    interface = codex_manifest.get("interface")
    if isinstance(interface, dict):
        interface.update(
            {
                "displayName": config["display_name"],
                "shortDescription": config["short_description"],
                "websiteURL": config["homepage"],
                "brandColor": config["brand_color"],
            }
        )
        guard_prompt = (
            f"Use only the {config['server_id']} MCP connection for this task. "
            "Do not substitute another Zyx environment."
        )
        prompts = interface.get("defaultPrompt", [])
        if isinstance(prompts, str):
            prompts = [prompts]
        interface["defaultPrompt"] = [
            guard_prompt,
            *[
                prompt
                for prompt in prompts
                if not str(prompt).startswith("Use only the zyx-authoring-")
            ],
        ]
    write_json(codex_manifest_path, codex_manifest)

    root_manifest_path = target_root / "plugin.json"
    if root_manifest_path.exists():
        root_manifest = read_json(root_manifest_path)
        root_manifest.update(
            {
                "name": config["plugin_id"],
                "displayName": config["display_name"],
                "description": config["short_description"],
            }
        )
        write_json(root_manifest_path, root_manifest)

    readme_path = target_root / "README.md"
    readme = readme_path.read_text(encoding="utf-8")
    environment_block = "\n".join(
        [
            "<!-- BEGIN:environment-config -->",
            "## Active environment",
            "",
            f"- Environment: `{environment}`",
            f"- Plugin ID: `{config['plugin_id']}`",
            f"- Release version: `{version}`",
            f"- Bootstrap protocol: `{protocol}`",
            f"- MCP server ID: `{config['server_id']}`",
            f"- Endpoint: `{config['endpoint']}`",
            "<!-- END:environment-config -->",
        ]
    )
    updated_readme, replacement_count = re.subn(
        r"<!-- BEGIN:environment-config -->.*?<!-- END:environment-config -->",
        environment_block,
        readme,
        flags=re.DOTALL,
    )
    if replacement_count != 1:
        raise ValueError("README.md must contain exactly one environment configuration block")
    write_text_lf(readme_path, updated_readme)

    connection_block = "\n".join(
        [
            "<!-- BEGIN:environment-connection -->",
            (
                f"Gunakan koneksi MCP `{config['server_id']}` untuk environment "
                f"`{environment}` di endpoint `{config['endpoint']}` "
                f"(`pluginVersion: \"{version}\"`, `bootstrapProtocol: {protocol}`). "
                "Jangan gunakan koneksi Zyx dari environment lain. Verifikasi identitas "
                "koneksi sebelum memulai run atau melakukan staging."
            ),
            "<!-- END:environment-connection -->",
        ]
    )

    for skill in EXPECTED_SKILLS:
        skill_path = target_root / "skills" / skill / "SKILL.md"
        skill_content = skill_path.read_text(encoding="utf-8")
        updated_skill, skill_replacements = re.subn(
            r"<!-- BEGIN:environment-connection -->.*?<!-- END:environment-connection -->",
            connection_block,
            skill_content,
            flags=re.DOTALL,
        )
        if skill_replacements != 1:
            raise ValueError(
                f"skills/{skill}/SKILL.md must contain exactly one environment connection block"
            )
        updated_skill = re.sub(r'(\*\*Plugin version\*\*: `)[^`]+(`)', lambda m: f"{m[1]}{version}{m[2]}", updated_skill)
        updated_skill = re.sub(r'("pluginVersion":\s*")[^"]+(")', lambda m: f"{m[1]}{version}{m[2]}", updated_skill)
        write_text_lf(skill_path, updated_skill)

    summary = validate_rendered_package(target_root, environment)
    print(
        f"Configured {config['plugin_id']} v{version} (protocol {protocol}) "
        f"with MCP server {config['server_id']} [{summary['payloadHash'][:12]}]",
        file=sys.stderr,
    )
    return summary


def inspect_mcp_json_file(config_path: Path, expected_server_id: str, expected_endpoint: str) -> dict[str, Any]:
    """Read-only, secret-redacted inspection of an MCP JSON configuration file."""
    if not config_path.exists():
        return {"status": "absent", "serverIds": [], "endpoints": [], "issues": ["Config file not found"]}
    try:
        raw = json.loads(config_path.read_text(encoding="utf-8"))
    except Exception as exc:
        return {
            "status": "unreadable_config",
            "serverIds": [],
            "endpoints": [],
            "issues": [f"Unreadable JSON config: {redact_secrets(str(exc))}"],
        }
    if not isinstance(raw, dict) or not isinstance(raw.get("mcpServers"), dict):
        return {
            "status": "unreadable_config",
            "serverIds": [],
            "endpoints": [],
            "issues": ["Missing mcpServers object"],
        }

    servers: dict[str, Any] = raw["mcpServers"]
    zyx_entries: dict[str, str] = {}
    issues: list[str] = []
    has_legacy = False

    for server_id, entry in servers.items():
        if not isinstance(entry, dict):
            continue
        raw_url = str(entry.get("url") or entry.get("serverUrl") or "")
        norm_url = normalize_endpoint_origin(raw_url) if raw_url else ""
        is_zyx = (
            server_id in KNOWN_ZYX_SERVER_IDS
            or "zyxacademy.com" in norm_url
            or "/api/mcp/authoring" in norm_url
        )
        if not is_zyx:
            continue
        zyx_entries[server_id] = norm_url
        if server_id in LEGACY_SERVER_IDS:
            has_legacy = True
            issues.append(f"Legacy server ID {server_id!r} detected")

    if has_legacy:
        return {
            "status": "legacy_server_id",
            "serverIds": sorted(zyx_entries.keys()),
            "endpoints": [zyx_entries[k] for k in sorted(zyx_entries.keys())],
            "issues": issues,
        }
    if expected_server_id not in zyx_entries:
        return {
            "status": "absent",
            "serverIds": sorted(zyx_entries.keys()),
            "endpoints": [zyx_entries[k] for k in sorted(zyx_entries.keys())],
            "issues": [f"Expected server ID {expected_server_id!r} not present"],
        }

    expected_norm = normalize_endpoint_origin(expected_endpoint)
    actual_norm = zyx_entries[expected_server_id]
    if actual_norm != expected_norm:
        return {
            "status": "drift",
            "serverIds": sorted(zyx_entries.keys()),
            "endpoints": [zyx_entries[k] for k in sorted(zyx_entries.keys())],
            "issues": [f"Endpoint {actual_norm!r} does not match expected {expected_norm!r}"],
        }

    return {
        "status": "healthy",
        "serverIds": sorted(zyx_entries.keys()),
        "endpoints": [zyx_entries[k] for k in sorted(zyx_entries.keys())],
        "issues": [],
    }


def inspect_installed_plugin_dir(
    installed_dir: Path,
    canonical_root: Path,
    environment: str,
) -> dict[str, Any]:
    """Inspect a host plugin directory against canonical release and skill checksums."""
    config = ENVIRONMENTS[environment]
    if not installed_dir.exists():
        return {
            "environment": environment,
            "path": str(installed_dir),
            "status": "absent",
            "installedVersion": None,
            "expectedVersion": None,
            "skillChecksumMatch": False,
            "mcpConfigStatus": "absent",
            "issues": ["Plugin directory does not exist"],
        }

    canonical_release = load_release_metadata(canonical_root)
    expected_version = str(canonical_release["version"])

    with_temp_dir = canonical_root.parent / f".tmp-doctor-canonical-{environment}-{os.getpid()}"
    try:
        canonical_summary = configure_plugin(canonical_root, environment, output_dir=with_temp_dir)
    finally:
        if with_temp_dir.exists():
            shutil.rmtree(with_temp_dir, ignore_errors=True)

    issues: list[str] = []
    installed_version: str | None = None
    release_path = installed_dir / "release.json"
    codex_path = installed_dir / ".codex-plugin" / "plugin.json"
    claude_path = installed_dir / ".claude-plugin" / "plugin.json"

    try:
        if release_path.is_file():
            installed_version = str(read_json(release_path).get("version") or "")
        elif codex_path.is_file():
            installed_version = str(read_json(codex_path).get("version") or "")
        elif claude_path.is_file():
            installed_version = str(read_json(claude_path).get("version") or "")
    except Exception as exc:
        return {
            "environment": environment,
            "path": str(installed_dir),
            "status": "unreadable_config",
            "installedVersion": None,
            "expectedVersion": expected_version,
            "skillChecksumMatch": False,
            "mcpConfigStatus": "unreadable_config",
            "issues": [f"Unreadable manifest: {redact_secrets(str(exc))}"],
        }

    mcp_path = installed_dir / ".mcp.json"
    mcp_report = inspect_mcp_json_file(mcp_path, config["server_id"], config["endpoint"])
    issues.extend(mcp_report["issues"])

    skill_match = True
    for skill in EXPECTED_SKILLS:
        rel_skill = f"skills/{skill}/SKILL.md"
        installed_skill = installed_dir / Path(rel_skill)
        if not installed_skill.is_file():
            skill_match = False
            issues.append(f"Missing {rel_skill}")
            continue
        raw = installed_skill.read_bytes().replace(b"\r\n", b"\n").replace(b"\r", b"\n")
        digest = hashlib.sha256(raw).hexdigest()
        if digest != canonical_summary["fileHashes"][rel_skill]:
            skill_match = False
            issues.append(f"Checksum drift in {rel_skill}")
        if (installed_dir / "skills" / skill / "references").exists():
            skill_match = False
            issues.append(f"Legacy references/ directory still present in skills/{skill}")

    if mcp_report["status"] in {"unreadable_config", "legacy_server_id"}:
        status = mcp_report["status"]
    elif installed_version != expected_version or not skill_match or mcp_report["status"] != "healthy":
        status = "drift"
    else:
        status = "healthy"

    return {
        "environment": environment,
        "pluginId": config["plugin_id"],
        "path": str(installed_dir),
        "status": status,
        "installedVersion": installed_version,
        "expectedVersion": expected_version,
        "skillChecksumMatch": skill_match,
        "mcpConfigStatus": mcp_report["status"],
        "serverIds": mcp_report["serverIds"],
        "endpoints": mcp_report["endpoints"],
        "issues": issues,
    }


def run_doctor(
    plugin_root: Path,
    environments: list[str],
    codex_dir: Path | None = None,
    claude_dir: Path | None = None,
    antigravity_dir: Path | None = None,
    antigravity_mcp_config: Path | None = None,
) -> dict[str, Any]:
    """Run read-only, secret-redacted diagnostics across host plugin locations."""
    home = Path.home()
    antigravity_base = antigravity_dir or (home / ".gemini" / "config" / "plugins")
    ag_mcp_path = antigravity_mcp_config or (home / ".gemini" / "antigravity" / "mcp_config.json")

    reports: list[dict[str, Any]] = []
    for env_name in environments:
        cfg = ENVIRONMENTS[env_name]
        plugin_id = cfg["plugin_id"]

        ag_plugin_path = (
            antigravity_base
            if antigravity_dir and (antigravity_dir / "skills").exists()
            else antigravity_base / plugin_id
        )
        ag_report = inspect_installed_plugin_dir(ag_plugin_path, plugin_root, env_name)
        ag_report["host"] = "antigravity"
        ag_mcp = inspect_mcp_json_file(ag_mcp_path, cfg["server_id"], cfg["endpoint"])
        ag_report["hostMcpConfig"] = {
            "path": str(ag_mcp_path),
            "status": ag_mcp["status"],
            "serverIds": ag_mcp["serverIds"],
            "endpoints": ag_mcp["endpoints"],
            "issues": ag_mcp["issues"],
        }
        if ag_mcp["status"] in {"legacy_server_id", "unreadable_config"}:
            ag_report["status"] = ag_mcp["status"]
        elif ag_report["status"] == "healthy" and ag_mcp["status"] != "healthy":
            ag_report["status"] = "drift"
        reports.append(ag_report)

        if codex_dir is not None:
            target = codex_dir if (codex_dir / "skills").exists() else (codex_dir / plugin_id)
            codex_report = inspect_installed_plugin_dir(target, plugin_root, env_name)
            codex_report["host"] = "codex"
            reports.append(codex_report)

        if claude_dir is not None:
            target = claude_dir if (claude_dir / "skills").exists() else (claude_dir / plugin_id)
            claude_report = inspect_installed_plugin_dir(target, plugin_root, env_name)
            claude_report["host"] = "claude"
            reports.append(claude_report)

    overall_ok = all(r["status"] == "healthy" for r in reports)
    return {
        "ok": overall_ok,
        "readOnly": True,
        "reports": reports,
    }


def is_forbidden_host_cache_path(target_path: Path) -> bool:
    """Return True if target_path points inside ~/.codex/plugins/cache or ~/.claude/plugins/cache."""
    posix_lower = target_path.resolve().as_posix().lower()
    return "/.codex/plugins/cache" in posix_lower or "/.claude/plugins/cache" in posix_lower


def replace_managed_directory(built_dir: Path, managed_target: Path, metadata: dict[str, Any]) -> None:
    """Safely replace a script-managed plugin directory using ownership marker, temp sibling, and backup."""
    if is_symlink_or_reparse(managed_target):
        raise ValueError("Refusing to sync into symlink or reparse target directory")
    resolved_target = managed_target.resolve()
    if resolved_target == Path(resolved_target.anchor):
        raise ValueError("Refusing to sync into filesystem root")
    if is_forbidden_host_cache_path(resolved_target):
        raise ValueError("Refusing to mutate internal host plugin cache directory")
    if is_repo_source_plugin_dir(resolved_target):
        raise ValueError("Refusing to overwrite repository source plugin directory")
    if built_dir.resolve() in resolved_target.parents or resolved_target in built_dir.resolve().parents:
        raise ValueError("Managed target directory must not overlap with build artifact directory")

    marker_path = resolved_target / OWNERSHIP_MARKER_FILENAME
    if resolved_target.exists():
        has_entries = any(resolved_target.iterdir())
        if has_entries and not marker_path.is_file():
            raise ValueError(
                f"Target directory {resolved_target} is non-empty and lacks ownership marker "
                f"{OWNERSHIP_MARKER_FILENAME}. Refusing to overwrite unmanaged directory."
            )

    parent_dir = resolved_target.parent
    parent_dir.mkdir(parents=True, exist_ok=True)
    tmp_dir = parent_dir / f".{resolved_target.name}.tmp-{os.getpid()}"
    bak_dir = parent_dir / f".{resolved_target.name}.bak-{os.getpid()}"

    if tmp_dir.exists():
        shutil.rmtree(tmp_dir)
    if bak_dir.exists():
        shutil.rmtree(bak_dir)

    shutil.copytree(built_dir, tmp_dir)
    write_json(
        tmp_dir / OWNERSHIP_MARKER_FILENAME,
        {
            "managedBy": "zyx-authoring-mcp-sync",
            "environment": metadata["environment"],
            "pluginId": metadata["pluginId"],
            "version": metadata["version"],
            "payloadHash": metadata["payloadHash"],
        },
    )

    had_existing = resolved_target.exists()
    try:
        if had_existing:
            os.replace(resolved_target, bak_dir)
        os.replace(tmp_dir, resolved_target)
    except Exception as exc:
        if tmp_dir.exists():
            shutil.rmtree(tmp_dir, ignore_errors=True)
        if had_existing and bak_dir.exists() and not resolved_target.exists():
            os.replace(bak_dir, resolved_target)
        raise RuntimeError(f"Failed to swap managed target directory; backup restored: {exc}") from exc
    finally:
        if bak_dir.exists() and resolved_target.exists():
            shutil.rmtree(bak_dir, ignore_errors=True)


def update_host_mcp_config_file(config_path: Path, environment: str) -> dict[str, Any]:
    """Update only the targeted Zyx MCP server entry in a host config file while preserving non-Zyx entries."""
    cfg = ENVIRONMENTS[environment]
    if is_symlink_or_reparse(config_path):
        raise ValueError("Refusing to modify symlinked host config file")

    if config_path.exists():
        raw = read_json(config_path)
    else:
        raw = {"mcpServers": {}}

    servers = raw.get("mcpServers")
    if not isinstance(servers, dict):
        raise ValueError("Host config mcpServers must be a JSON object")

    for server_id in servers:
        if server_id in LEGACY_SERVER_IDS:
            raise ValueError(
                f"Legacy MCP server ID {server_id!r} found in {config_path.name}. "
                "Remove or migrate the legacy entry explicitly before syncing."
            )

    use_server_url = config_path.name == "mcp_config.json" or any(
        isinstance(v, dict) and "serverUrl" in v for v in servers.values()
    )
    existing_entry = servers.get(cfg["server_id"])
    if isinstance(existing_entry, dict):
        for k, v in existing_entry.items():
            if k not in {"type", "url", "serverUrl"}:
                raise ValueError(
                    f"Existing entry {cfg['server_id']!r} contains custom field {k!r}; "
                    "refusing to overwrite automatically."
                )

    if use_server_url:
        servers[cfg["server_id"]] = {"serverUrl": cfg["endpoint"]}
    else:
        servers[cfg["server_id"]] = {"type": "http", "url": cfg["endpoint"]}

    raw["mcpServers"] = servers
    write_json(config_path, raw)
    return {
        "updatedConfigPath": str(config_path),
        "serverId": cfg["server_id"],
        "preservedServers": sorted(k for k in servers if k != cfg["server_id"]),
    }


def run_sync(
    plugin_root: Path,
    environment: str,
    artifacts_root: Path,
    managed_target_dir: Path | None = None,
    host_config_path: Path | None = None,
) -> dict[str, Any]:
    """Build environment artifact and optionally sync a script-managed directory and host config."""
    if environment not in ENVIRONMENTS:
        raise ValueError(f"Explicit valid environment required; got {environment!r}")
    cfg = ENVIRONMENTS[environment]
    env_artifact_root = artifacts_root.resolve() / environment
    package_out_dir = env_artifact_root / cfg["plugin_id"]

    summary = configure_plugin(plugin_root, environment, output_dir=package_out_dir)
    metadata_path = env_artifact_root / "build-metadata.json"
    write_json(metadata_path, summary)

    result: dict[str, Any] = {
        **summary,
        "artifactDir": str(package_out_dir),
        "metadataFile": str(metadata_path),
        "managedTargetSynced": None,
        "hostConfigUpdated": None,
        "hostActions": [
            f"Codex Desktop: reload plugin {cfg['plugin_id']} or start a new session.",
            f"Claude Code: reload plugin {cfg['plugin_id']} from the updated source directory.",
            f"Antigravity IDE: verify {cfg['server_id']} in mcp_config.json and reload window if skill triggers changed.",
        ],
    }

    if managed_target_dir is not None:
        replace_managed_directory(package_out_dir, managed_target_dir, summary)
        result["managedTargetSynced"] = str(managed_target_dir.resolve())

    if host_config_path is not None:
        result["hostConfigUpdated"] = update_host_mcp_config_file(host_config_path.resolve(), environment)

    return result


def verify_release_progression(candidate_dir: Path, baseline_dir: Path) -> dict[str, Any]:
    """Verify SemVer progression and payload hash collision rules between candidate and baseline packages."""
    cand_release = load_release_metadata(candidate_dir)
    cand_version = str(cand_release["version"])
    cand_semver = parse_semver(cand_version)
    cand_hash, _ = compute_package_payload_hash(candidate_dir)

    base_release_path = baseline_dir / "release.json"
    if base_release_path.is_file():
        base_version = str(read_json(base_release_path).get("version", "0.0.0"))
    else:
        codex_path = baseline_dir / ".codex-plugin" / "plugin.json"
        base_version = str(read_json(codex_path).get("version", "0.0.0")) if codex_path.is_file() else "0.0.0"

    base_semver = parse_semver(base_version)
    try:
        base_hash, _ = compute_package_payload_hash(baseline_dir)
    except Exception:
        base_hash = ""

    if cand_semver < base_semver:
        return {
            "ok": False,
            "status": "version_regression",
            "candidateVersion": cand_version,
            "baselineVersion": base_version,
            "candidatePayloadHash": cand_hash,
            "baselinePayloadHash": base_hash,
            "message": f"Candidate version {cand_version} is lower than baseline version {base_version}",
        }

    if cand_semver == base_semver:
        if cand_hash == base_hash:
            return {
                "ok": True,
                "status": "noop",
                "candidateVersion": cand_version,
                "baselineVersion": base_version,
                "candidatePayloadHash": cand_hash,
                "baselinePayloadHash": base_hash,
                "message": f"Version {cand_version} and payload hash {cand_hash[:12]} are identical (no-op).",
            }
        return {
            "ok": False,
            "status": "version_collision",
            "candidateVersion": cand_version,
            "baselineVersion": base_version,
            "candidatePayloadHash": cand_hash,
            "baselinePayloadHash": base_hash,
            "message": (
                f"Version collision: candidate version {cand_version} equals baseline {base_version} "
                f"but payload hash changed ({base_hash[:12]} -> {cand_hash[:12]}). Bump release.json version."
            ),
        }

    return {
        "ok": True,
        "status": "advance",
        "candidateVersion": cand_version,
        "baselineVersion": base_version,
        "candidatePayloadHash": cand_hash,
        "baselinePayloadHash": base_hash,
        "message": f"Release advances {base_version} -> {cand_version} [{cand_hash[:12]}].",
    }


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint supporting build, doctor, sync, verify-release, and legacy positional invocation."""
    args_list = list(sys.argv[1:] if argv is None else argv)
    default_plugin_root = Path(__file__).resolve().parent.parent

    if (
        len(args_list) >= 2
        and args_list[0] not in {"build", "doctor", "sync", "verify-release", "-h", "--help"}
        and args_list[1] in ENVIRONMENTS
    ):
        parser = argparse.ArgumentParser(prog="configure_environment.py")
        parser.add_argument("plugin_root", type=Path)
        parser.add_argument("environment", choices=sorted(ENVIRONMENTS.keys()))
        parser.add_argument("--output-dir", type=Path, default=None)
        parser.add_argument("--allow-in-place", action="store_true")
        parsed = parser.parse_args(args_list)
        configure_plugin(
            parsed.plugin_root.resolve(),
            parsed.environment,
            output_dir=parsed.output_dir,
            allow_in_place=parsed.allow_in_place,
        )
        return 0

    parser = argparse.ArgumentParser(
        prog="configure_environment.py",
        description="Build, inspect, and sync Zyx Authoring MCP plugin packages.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    build_parser = subparsers.add_parser("build", help="Render a validated environment plugin package")
    build_parser.add_argument("--plugin-root", type=Path, default=default_plugin_root)
    build_parser.add_argument("--environment", required=True, choices=sorted(ENVIRONMENTS.keys()))
    build_parser.add_argument("--output-dir", type=Path, required=True)
    build_parser.add_argument("--json", action="store_true")

    doctor_parser = subparsers.add_parser("doctor", help="Run read-only, secret-redacted host diagnostics")
    doctor_parser.add_argument("--plugin-root", type=Path, default=default_plugin_root)
    doctor_parser.add_argument("--environment", choices=[*sorted(ENVIRONMENTS.keys()), "all"], default="all")
    doctor_parser.add_argument("--codex-dir", type=Path, default=None)
    doctor_parser.add_argument("--claude-dir", type=Path, default=None)
    doctor_parser.add_argument("--antigravity-dir", type=Path, default=None)
    doctor_parser.add_argument("--antigravity-mcp-config", type=Path, default=None)
    doctor_parser.add_argument("--json", action="store_true")

    sync_parser = subparsers.add_parser("sync", help="Build artifact and optionally sync managed directory")
    sync_parser.add_argument("--plugin-root", type=Path, default=default_plugin_root)
    sync_parser.add_argument("--environment", required=True, choices=sorted(ENVIRONMENTS.keys()))
    sync_parser.add_argument(
        "--artifacts-root",
        type=Path,
        default=default_plugin_root.parent.parent / "artifacts" / "authoring-plugin",
    )
    sync_parser.add_argument("--managed-target-dir", type=Path, default=None)
    sync_parser.add_argument("--host-config", type=Path, default=None)
    sync_parser.add_argument("--json", action="store_true")

    verify_parser = subparsers.add_parser("verify-release", help="Check SemVer and payload hash progression")
    verify_parser.add_argument("--candidate-dir", type=Path, required=True)
    verify_parser.add_argument("--baseline-dir", type=Path, required=True)
    verify_parser.add_argument("--json", action="store_true")

    parsed = parser.parse_args(args_list)

    if parsed.command == "build":
        summary = configure_plugin(
            parsed.plugin_root.resolve(),
            parsed.environment,
            output_dir=parsed.output_dir,
        )
        if parsed.json:
            print(json.dumps(summary, indent=2))
        return 0

    if parsed.command == "doctor":
        envs = sorted(ENVIRONMENTS.keys()) if parsed.environment == "all" else [parsed.environment]
        report = run_doctor(
            parsed.plugin_root.resolve(),
            envs,
            codex_dir=parsed.codex_dir.resolve() if parsed.codex_dir else None,
            claude_dir=parsed.claude_dir.resolve() if parsed.claude_dir else None,
            antigravity_dir=parsed.antigravity_dir.resolve() if parsed.antigravity_dir else None,
            antigravity_mcp_config=parsed.antigravity_mcp_config.resolve() if parsed.antigravity_mcp_config else None,
        )
        if parsed.json:
            print(json.dumps(report, indent=2))
        else:
            for item in report["reports"]:
                print(
                    f"[{item['host']}:{item['environment']}] status={item['status']} "
                    f"version={item['installedVersion']} expected={item['expectedVersion']} "
                    f"path={item['path']}"
                )
                for issue in item["issues"]:
                    print(f"  - {redact_secrets(issue)}")
        return 0

    if parsed.command == "sync":
        result = run_sync(
            parsed.plugin_root.resolve(),
            parsed.environment,
            artifacts_root=parsed.artifacts_root.resolve(),
            managed_target_dir=parsed.managed_target_dir.resolve() if parsed.managed_target_dir else None,
            host_config_path=parsed.host_config.resolve() if parsed.host_config else None,
        )
        if parsed.json:
            print(json.dumps(result, indent=2))
        else:
            for action in result["hostActions"]:
                print(f"- {action}")
        return 0

    if parsed.command == "verify-release":
        verdict = verify_release_progression(
            parsed.candidate_dir.resolve(),
            parsed.baseline_dir.resolve(),
        )
        if parsed.json:
            print(json.dumps(verdict, indent=2))
        else:
            print(verdict["message"])
        return 0 if verdict["ok"] else 1

    return 1


if __name__ == "__main__":
    sys.exit(main())
