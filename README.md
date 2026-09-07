# LiveTVApp — Codemagic-ready Android APK

Original Live TV starter project. It is not copied from OXOO source code.

## Backend

- Base URL: `https://sojib247.iceiy.com/`
- API endpoint: `/api/channels.php`
- Authentication header: `X-API-Key`

## API key security

The API key is **not stored in this ZIP or GitHub repository**. This is intentional because the previously shared key was exposed and should be rotated.

1. In Web Admin, disable the old exposed key.
2. Generate a fresh API key.
3. In Codemagic, open the app's **Environment variables**.
4. Add `LIVE_TV_API_KEY` and mark it **Secret**.
5. Start the `android-debug` workflow.

The build passes the secret to Gradle and the APK receives it through `BuildConfig`.

## Codemagic build

The included `codemagic.yaml` uses the Personal Free plan's macOS M2 machine and builds an installable debug APK. Codemagic exposes the APK as a build artifact.

## Project checks already applied

- AndroidX enabled
- API URL moved to BuildConfig
- API key moved out of source control
- API key validation before build
- Android TV launcher compatibility added
- Missing stream URL handling added
- Player lifecycle cleanup fixed
- Codemagic YAML added
- Gradle project files checked

Use only stream URLs you are authorized to distribute.
