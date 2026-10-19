# Android builds and GitHub releases

The **Android** workflow builds on every branch push and pull request. It can
also be run manually. It is independent of the web build and Pages deployment.
The native Linux job in **Build** runs the CTest suite, including touch layout
checks. Android CI also installs the APK on an API 34 emulator and checks that
it launches in landscape and opens gameplay without a native crash. Its screenshot and logs are
saved as `reckless-drivin-android-smoke` artifacts. Releases wait for this check.

## Download a test build

Open **Actions → Android → a successful run → Artifacts** and download
`reckless-drivin-android-debug`. Extract `app-debug.apk` and install it on a
64-bit Android device (Android 5.0 or newer), for example:

```bash
adb install -r app-debug.apk
```

This APK is debug signed. Use the signed release below for distribution and
upgrades with a persistent signing identity.

## One-time release signing setup

Keep a backup of the release keystore and its passwords. Every future APK
update must use the same signing key.

If you do not already have a release key, generate one outside the checkout
(the command prompts for passwords):

```bash
keytool -genkeypair -v -keystore "$HOME/reckless-drivin-release.jks" \
  -alias reckless-drivin -keyalg RSA -keysize 2048 -validity 10000
```

Add these **repository Actions secrets** in GitHub settings, or use `gh`:

```bash
base64 < "$HOME/reckless-drivin-release.jks" | \
  gh secret set ANDROID_KEYSTORE_BASE64 --repo LachlanBWWright/RecklessDrivinPort

gh secret set ANDROID_KEYSTORE_PASSWORD --repo LachlanBWWright/RecklessDrivinPort
gh secret set ANDROID_KEY_ALIAS --repo LachlanBWWright/RecklessDrivinPort
gh secret set ANDROID_KEY_PASSWORD --repo LachlanBWWright/RecklessDrivinPort
```

Enter the alias chosen above for `ANDROID_KEY_ALIAS`. If the key and keystore
use the same password, set both password secrets to that value. Do not commit
the keystore or passwords. The workflow fails with a clear error if any release
signing secret is missing; it never substitutes a debug key.

## Publish a release

1. Commit and push the changes you want to ship. Uncommitted changes are not
   included in GitHub Actions builds.
2. Tag that commit and push the tag:

   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

3. Wait for **Android** to finish. The tag determines the version name. The
   workflow run number supplies a monotonically increasing Android version
   code. Prerelease tags such as `v1.1.0-beta.1` are supported.
4. After packaging and emulator gameplay checks pass, the workflow publishes
   the release automatically. Open **Releases** to download the signed APK.
   Use a prerelease tag such as `v1.1.0-beta.1` when you want a test release.

The published release includes:

- A signed APK for direct installation, with `resources.dat` embedded.
- `SHA256SUMS` and `BUILD.txt` recording the commit, version, and version code.

For an existing tag, you can rerun its Actions run. Once this workflow exists
on the default branch, **Run workflow** also supports selecting the tag and
checking **release**. Its optional **version_code** input lets you provide a
code higher than a previously distributed build, if necessary. A branch ref
cannot be used for a release. Published releases are not overwritten by reruns.

This workflow prepares GitHub downloads; it does not upload to Google Play.
The current target SDK remains 34. Play submission requires a separate review
of its current target API and store requirements.

## Local build and verification

Install JDK 17 and these Android SDK components:

```bash
sdkmanager 'platform-tools' 'platforms;android-34' 'build-tools;35.0.0' \
  'ndk;28.2.13676358' 'cmake;3.22.1'
```

Set `JAVA_HOME` to JDK 17 and `ANDROID_HOME` to your SDK, then run:

```bash
./scripts/build-android.sh
./scripts/verify-android.sh port/android/app/build/outputs/apk/debug/app-debug.apk
```

The helper uses the checked-in Gradle wrapper and downloads checksum-pinned
SDL 2.32.10 into your user cache. `SDL2_SOURCE_DIR` can override that download
for an existing source tree. The default tasks build debug and unsigned
release APKs. Resources are read directly
from `port/resources/resources.dat`, without a manual copy step.

For a locally signed release, export `ANDROID_KEYSTORE_PATH` (absolute path),
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`,
then run:

```bash
./scripts/build-android.sh :app:assembleRelease \
  -PrequireReleaseSigning=true -PversionName=1.0.0 -PversionCode=1
./scripts/verify-android.sh port/android/app/build/outputs/apk/release/app-release.apk
```

`verify-android.sh` checks the embedded resource pack, arm64-v8a and x86_64
native libraries, 16 KB ELF/ZIP alignment, and APK signatures. Unsigned
release APKs can be checked with a second argument of `false`.

Tool versions: AGP 8.9.2, Gradle 8.11.1, JDK 17, NDK 28.2.13676358,
CMake 3.22.1, and SDK Build Tools 35.0.0. Modern packaging and NDK alignment
follow [Android's 16 KB guidance](https://developer.android.com/guide/practices/page-sizes).
Signing follows [Android's app signing documentation](https://developer.android.com/studio/publish/app-signing).

## Crash details

On the next launch after a crash, Android displays a scrollable report with a
**Copy details** button. Java exceptions are saved locally on all supported
Android versions. Native crashes and unresponsive-app reports use Android 11+
crash history; Android 12+ can also supply the native signal, fault address,
and backtrace. Details depend on what Android retained. Reports stay on the
device and are shown once after dismissal.
