use std::process::Command;

fn detect_channel() -> &'static str {
    if let Ok(explicit) = std::env::var("ZYX_APP_CHANNEL") {
        if explicit.trim().eq_ignore_ascii_case("nightly") {
            return "nightly";
        }
        if explicit.trim().eq_ignore_ascii_case("stable") {
            return "stable";
        }
    }

    for env_key in ["GITHUB_REF_NAME", "VERCEL_GIT_COMMIT_REF", "GIT_BRANCH"] {
        if let Ok(branch) = std::env::var(env_key) {
            if branch.trim() == "staging" {
                return "nightly";
            }
            if !branch.trim().is_empty() {
                return "stable";
            }
        }
    }

    if let Ok(output) = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()
    {
        if output.status.success() {
            let branch = String::from_utf8_lossy(&output.stdout);
            if branch.trim() == "staging" {
                return "nightly";
            }
        }
    }

    "stable"
}

fn detect_build_sha() -> String {
    for env_key in ["ZYX_APP_BUILD_ID", "GITHUB_SHA"] {
        if let Ok(value) = std::env::var(env_key) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return trimmed.chars().take(7).collect();
            }
        }
    }

    if let Ok(output) = Command::new("git")
        .args(["rev-parse", "--short=7", "HEAD"])
        .output()
    {
        if output.status.success() {
            let sha = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !sha.is_empty() {
                return sha;
            }
        }
    }

    "dev".to_string()
}

fn main() {
    println!("cargo:rerun-if-env-changed=ZYX_APP_CHANNEL");
    println!("cargo:rerun-if-env-changed=ZYX_APP_BUILD_ID");
    println!("cargo:rerun-if-env-changed=GITHUB_REF_NAME");
    println!("cargo:rerun-if-env-changed=GITHUB_SHA");
    println!("cargo:rustc-env=ZYX_BUILD_CHANNEL={}", detect_channel());
    println!("cargo:rustc-env=ZYX_BUILD_SHA={}", detect_build_sha());
    tauri_build::build()
}
