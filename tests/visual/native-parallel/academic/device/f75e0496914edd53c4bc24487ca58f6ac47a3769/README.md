# iOS build observation for run 45816738991

At revision `f75e0496914edd53c4bc24487ca58f6ac47a3769`, the macOS 15 ARM64 runner booted an iPhone 17 Pro on iOS 26.2 and completed CocoaPods installation. Xcode 26.3 then failed in ExpoModulesJSI. Swift reported `sending 'slot' risks causing data races` at `JavaScriptObject.swift:946:36`, and `xcodebuild` exited with code 65. [Run index](index.json) · [iOS build job](https://github.com/soezyxstt/zyxacademy/actions/runs/45816738991/job/139898364219)

The artifact contains 162 exported fixture definitions and zero screenshots. The app build stopped before installation, fixture rendering, or Maestro execution. This snapshot carries zero iOS parity credit. [Pinned iOS artifact](https://github.com/soezyxstt/zyxacademy/actions/runs/45816738991/artifacts/15116279193)

Download `academic-ios-evidence` from the linked run to reproduce the inspection. Compare the SHA-256 of `provenance.json`, `job-status.json`, `ios-toolchain.txt`, `simulator-booted.json`, `build.log` and `cases.json` with the index. The booted device appears in the iOS 26.2 runtime entry. The Swift diagnostic and exit code are in `build.log`.
