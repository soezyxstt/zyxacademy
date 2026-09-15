#!/usr/bin/env python3

import json
import re
import sys
from pathlib import Path


ENVIRONMENTS = {
    "production": {
        "plugin_id": "zyx-authoring-mcp",
        "display_name": "Zyx Authoring MCP",
        "server_id": "zyx-authoring-production",
        "endpoint": "https://www.zyxacademy.com/api/mcp/authoring",
        "homepage": "https://www.zyxacademy.com/",
        "brand_color": "#2563EB",
        "short_description": "Author production Zyx content through MCP quality gates.",
    },
    "staging": {
        "plugin_id": "zyx-authoring-mcp-staging",
        "display_name": "Zyx Authoring MCP (Staging)",
        "server_id": "zyx-authoring-staging",
        "endpoint": "https://staging.zyxacademy.com/api/mcp/authoring",
        "homepage": "https://staging.zyxacademy.com/",
        "brand_color": "#F59E0B",
        "short_description": "Author staging Zyx content through MCP quality gates.",
    },
}


def read_json(file_path: Path) -> dict:
    """Read a UTF-8 JSON object from the plugin tree."""
    return json.loads(file_path.read_text(encoding="utf-8"))


def write_json(file_path: Path, value: dict) -> None:
    """Write a consistently formatted UTF-8 JSON object."""
    file_path.write_text(f"{json.dumps(value, indent=2)}\n", encoding="utf-8")


def configure_mcp_file(plugin_root: Path, relative_path: str, config: dict) -> None:
    """Replace the single MCP template entry with its environment identity."""
    file_path = plugin_root / relative_path
    data = read_json(file_path)
    servers = list(data.get("mcpServers", {}).values())
    if len(servers) != 1:
        raise ValueError(f"{relative_path} must contain exactly one MCP server template")

    data["mcpServers"] = {
        config["server_id"]: {
            **servers[0],
            "url": config["endpoint"],
        }
    }
    write_json(file_path, data)


def configure_plugin(plugin_root: Path, environment: str) -> None:
    """Apply one environment configuration across the mirrored plugin package."""
    config = ENVIRONMENTS[environment]
    configure_mcp_file(plugin_root, ".mcp.json", config)
    configure_mcp_file(plugin_root, "claude-desktop-config.example.json", config)

    claude_manifest_path = plugin_root / ".claude-plugin" / "plugin.json"
    claude_manifest = read_json(claude_manifest_path)
    claude_manifest.update(
        {
            "name": config["plugin_id"],
            "homepage": config["homepage"],
            "description": config["short_description"],
        }
    )
    write_json(claude_manifest_path, claude_manifest)

    codex_manifest_path = plugin_root / ".codex-plugin" / "plugin.json"
    codex_manifest = read_json(codex_manifest_path)
    codex_manifest.update(
        {
            "name": config["plugin_id"],
            "homepage": config["homepage"],
            "description": config["short_description"],
        }
    )
    interface = codex_manifest.get("interface")
    if interface is not None:
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

    readme_path = plugin_root / "README.md"
    readme = readme_path.read_text(encoding="utf-8")
    environment_block = "\n".join(
        [
            "<!-- BEGIN:environment-config -->",
            "## Active environment",
            "",
            f"- Environment: `{environment}`",
            f"- Plugin ID: `{config['plugin_id']}`",
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
    readme_path.write_text(updated_readme, encoding="utf-8")

    question_workflow_path = (
        plugin_root
        / "skills"
        / "zyx-question-authoring-mcp"
        / "references"
        / "workflow.md"
    )
    question_workflow = question_workflow_path.read_text(encoding="utf-8")
    connection_block = "\n".join(
        [
            "<!-- BEGIN:environment-connection -->",
            (
                f"Gunakan koneksi MCP `{config['server_id']}` untuk environment "
                f"`{environment}` di endpoint `{config['endpoint']}`. Jangan gunakan "
                "koneksi Zyx dari environment lain. Verifikasi identitas koneksi sebelum "
                "melakukan staging."
            ),
            "<!-- END:environment-connection -->",
        ]
    )
    updated_workflow, workflow_replacement_count = re.subn(
        r"<!-- BEGIN:environment-connection -->.*?<!-- END:environment-connection -->",
        connection_block,
        question_workflow,
        flags=re.DOTALL,
    )
    if workflow_replacement_count != 1:
        raise ValueError(
            "Question workflow must contain exactly one environment connection block"
        )
    question_workflow_path.write_text(updated_workflow, encoding="utf-8")

    print(
        f"Configured {config['plugin_id']} with MCP server {config['server_id']}"
    )


def main() -> None:
    """Validate CLI arguments and configure the requested plugin tree."""
    if len(sys.argv) != 3 or sys.argv[2] not in ENVIRONMENTS:
        raise SystemExit(
            "Usage: configure_environment.py <plugin-root> <production|staging>"
        )
    configure_plugin(Path(sys.argv[1]).resolve(), sys.argv[2])


if __name__ == "__main__":
    main()
