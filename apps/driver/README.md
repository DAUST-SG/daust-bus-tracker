# DAUST Bus — driver app

Android app (Kotlin + Compose) that sends the bus position to the Convex HTTP API. Driver UI is in French.

## Build

Needs JDK 17+ and the Android SDK (platform 36). With Android Studio, open this folder and it installs the SDK. From the command line:

```bash
sdkmanager --licenses
sdkmanager "platforms;android-36" "build-tools;36.0.0" "platform-tools"
echo "sdk.dir=$HOME/Library/Android/sdk" > local.properties   # or wherever the SDK lives
./gradlew :app:testDebugUnitTest :app:assembleDebug
```

The APK lands in `app/build/outputs/apk/debug/`. Sideload it with `adb install -r <apk>`.

## Server URL

Set in `gradle.properties` (`siteUrl`) or per build:

```bash
./gradlew :app:assembleDebug -PsiteUrl=http://10.0.2.2:3211   # emulator → local `npx convex dev`
```

Debug builds allow plain `http://`; release builds only `https://`.

## Pairing a phone

Create a token on the server, then type it into the app's first screen:

```bash
cd ../web && npx convex run devices:provision '{"busCode":"BUS-1","label":"Driver phone"}'
```

## Field tests (Sprint 3 Definition of Done)

- Screen off 60+ min: positions keep arriving.
- Airplane mode 10 min: queued positions arrive afterwards, in order.
- Tracking stops by itself at the end of service hours.
