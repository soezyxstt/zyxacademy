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

fn main() {
    println!("cargo:rerun-if-env-changed=ZYX_APP_CHANNEL");
    println!("cargo:rerun-if-env-changed=GITHUB_REF_NAME");
    println!("cargo:rustc-env=ZYX_BUILD_CHANNEL={}", detect_channel());
    tauri_build::build()
}
