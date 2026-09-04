# iOS Build Guide — Qython Mobile

This document covers the complete iOS build pipeline for the Qython React Native mobile app, from local development to App Store submission.

## Prerequisites

### Required Software

| Tool | Minimum Version | Notes |
|------|----------------|-------|
| **Xcode** | 16.0+ | Install from Mac App Store |
| **CocoaPods** | 1.15+ | `sudo gem install cocoapods` |
| **Node.js** | 22.11+ | Required by the monorepo |
| **Ruby** | 3.0+ | Ships with macOS; needed for CocoaPods |

### Required Accounts

- **Apple Developer Account** ($99/year) — required for device testing and distribution
- **Firebase Project** — for push notifications and analytics

### Xcode Command Line Tools

```bash
xcode-select --install
```

After installing Xcode, open it once and accept the license agreement.

---

## Firebase iOS Setup

### 1. Download GoogleService-Info.plist

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select the Qython project
3. Navigate to **Project Settings** (gear icon) > **General**
4. Under **Your apps**, find the iOS app (bundle ID: `ai.qython.app`)
   - If no iOS app exists, click **Add app** > **iOS** and follow the wizard
5. Download `GoogleService-Info.plist`

### 2. Place the File

```bash
cp ~/Downloads/GoogleService-Info.plist packages/mobile/ios/QythonMobile/GoogleService-Info.plist
```

**Important:** This file is gitignored. Never commit it to the repository. A template exists at `GoogleService-Info.plist.example` for reference.

### 3. Upload APNs Key to Firebase

Push notifications require an APNs authentication key:

1. Go to [Apple Developer > Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/authkeys/list)
2. Click **Keys** > **+** (Create a new key)
3. Name it `Qython APNs Key`
4. Check **Apple Push Notifications service (APNs)**
5. Click **Continue** > **Register**
6. Download the `.p8` key file (you can only download it once)
7. Note the **Key ID** shown on the page
8. In Firebase Console, go to **Project Settings** > **Cloud Messaging**
9. Under **Apple app configuration**, click **Upload** next to APNs Authentication Key
10. Upload the `.p8` file, enter the Key ID and your Team ID

---

## Build Steps

### Initial Setup (First Time)

```bash
# From the monorepo root
npm install

# Install iOS dependencies
cd packages/mobile
npm run ios:pod-install
```

### Running in Debug Mode

```bash
# Start Metro bundler (in a separate terminal)
npm run dev

# Build and run on iOS Simulator
npm run ios:build-debug
```

To run on a specific simulator:

```bash
npx react-native run-ios --simulator "iPhone 16 Pro"
```

### Running on a Physical Device

1. Open the Xcode workspace:
   ```bash
   npm run ios:open-xcode
   ```
2. Select your device in the device toolbar
3. Configure signing (see [Code Signing](#code-signing) below)
4. Press **Cmd+R** to build and run

### Building for Release

```bash
npm run ios:build-release
```

### Cleaning the Build

If you encounter build issues after dependency changes:

```bash
npm run ios:clean
```

This removes the `Pods/` and `build/` directories, then runs `pod install` again.

---

## Code Signing

### Development (Local Testing)

1. Open `QythonMobile.xcworkspace` in Xcode
2. Select the **QythonMobile** target
3. Go to **Signing & Capabilities**
4. Check **Automatically manage signing**
5. Select your **Team** (Apple Developer account)
6. Xcode will create a development provisioning profile automatically

### Distribution (TestFlight / App Store)

For distribution builds, you need:

| Asset | Purpose |
|-------|---------|
| **Distribution Certificate** | Signs the app binary |
| **App ID** | `ai.qython.app` registered in Apple Developer portal |
| **Provisioning Profile** | Links the certificate, App ID, and allowed devices |

#### Creating a Distribution Certificate

1. In Xcode, go to **Settings** > **Accounts** > Select your team > **Manage Certificates**
2. Click **+** > **Apple Distribution**
3. Xcode generates and installs the certificate automatically

#### Entitlements

The app includes the following entitlements (configured in `QythonMobile.entitlements`):

- **Push Notifications** (`aps-environment`) — set to `development` (Xcode changes this to `production` for distribution builds automatically)
- **Associated Domains** — `applinks:qython.ai` for universal links / deep linking

---

## TestFlight Deployment

### 1. Archive the App

1. In Xcode, select **Product** > **Destination** > **Any iOS Device (arm64)**
2. Select **Product** > **Archive**
3. Wait for the archive to complete (this may take several minutes)

### 2. Upload to App Store Connect

1. In the **Organizer** window (opens automatically after archiving), select the latest archive
2. Click **Distribute App**
3. Select **TestFlight & App Store** > **Distribute**
4. Follow the prompts (Xcode handles signing automatically if configured)

### 3. Submit for TestFlight Review

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Select the Qython app
3. Go to **TestFlight** tab
4. The new build will appear after processing (5-30 minutes)
5. Add **Export Compliance Information** (the app does not use non-standard encryption if only using HTTPS)
6. Add testers (internal or external groups)

### 4. Testing

Internal testers (up to 100 team members) can install immediately. External testers (up to 10,000) require a brief Apple review first.

---

## App Store Submission Checklist

Before submitting to the App Store, ensure:

### App Configuration

- [ ] **Bundle ID** matches `ai.qython.app` in Apple Developer portal
- [ ] **Version number** (`CFBundleShortVersionString`) is incremented
- [ ] **Build number** (`CFBundleVersion`) is incremented
- [ ] **Display name** is set to "Qython"
- [ ] **Entitlements** file is properly configured (push notifications, associated domains)
- [ ] `aps-environment` will be set to `production` automatically for App Store builds

### Required Assets

- [ ] **App Icon** — 1024x1024 PNG (no alpha channel, no rounded corners)
- [ ] **Screenshots** — at minimum for iPhone 6.7" (1290x2796) and 6.5" (1284x2778)
- [ ] **iPad screenshots** if supporting iPad
- [ ] **App Preview video** (optional but recommended)

### App Store Connect Metadata

- [ ] **App name**: Qython
- [ ] **Subtitle** (max 30 characters)
- [ ] **Description** (up to 4000 characters)
- [ ] **Keywords** (up to 100 characters, comma-separated)
- [ ] **Support URL**: https://qython.ai/support
- [ ] **Privacy Policy URL**: https://qython.ai/privacy
- [ ] **Category**: Medical (primary), Education (secondary)
- [ ] **Age Rating** questionnaire completed
- [ ] **Copyright**: Qython

### Privacy & Permissions

- [ ] **App Privacy details** filled in App Store Connect (data collection practices)
- [ ] All `NS*UsageDescription` strings are meaningful and specific:
  - Camera: clinical documentation and profile pictures
  - Photo Library: attaching images to clinical documents
  - Microphone: voice-to-text clinical transcription
  - Speech Recognition: real-time voice transcription
  - Location: region-specific clinical guidelines

### Technical Requirements

- [ ] App tested on **multiple device sizes** (iPhone SE, iPhone 16, iPhone 16 Pro Max)
- [ ] App works correctly in **both orientations** on iPad (if supported)
- [ ] **Dark mode** displays correctly
- [ ] **No crashes** on launch or during core flows
- [ ] **Push notifications** work in production environment
- [ ] **Deep links** (`qython.ai`) resolve correctly
- [ ] **Offline behavior** is graceful (no crashes, appropriate messaging)
- [ ] **Accessibility**: VoiceOver labels on interactive elements

### Common Rejection Reasons to Avoid

- Missing login credentials for Apple reviewers (provide a demo account)
- Incomplete metadata or placeholder text
- Broken links in the app
- Requesting permissions without using them
- App crashes during review

---

## Troubleshooting

### `pod install` Fails

```bash
# Update CocoaPods repo
pod repo update

# If still failing, clear the cache
cd packages/mobile/ios
rm -rf Pods Podfile.lock
pod install --repo-update
```

### Build Fails with Signing Errors

1. Open Xcode > **Settings** > **Accounts**
2. Ensure your Apple ID is added and the team is visible
3. In the target settings, toggle **Automatically manage signing** off and on
4. Clean build folder: **Product** > **Clean Build Folder** (Cmd+Shift+K)

### "No Bundle URL present" Error

The Metro bundler is not running or not reachable:

```bash
# In a separate terminal
cd packages/mobile
npm run dev
```

### Firebase / Push Notification Issues

- Verify `GoogleService-Info.plist` is in the correct location and added to the Xcode project
- Ensure the `BUNDLE_ID` in the plist matches the app's bundle identifier
- Check that the APNs key is uploaded to Firebase Console
- Push notifications do not work in the iOS Simulator; test on a physical device

### Archive Fails with "No Signing Certificate"

1. Go to [Apple Developer > Certificates](https://developer.apple.com/account/resources/certificates/list)
2. Ensure you have an **Apple Distribution** certificate
3. If expired, create a new one via Xcode or the portal
4. Download and double-click to install in Keychain

### "Module 'FirebaseCore' not found"

```bash
cd packages/mobile
npm run ios:clean
```

This reinstalls all CocoaPods dependencies from scratch.

### Build Succeeds but App Crashes on Launch

Check the Xcode console for crash logs. Common causes:

- Missing `GoogleService-Info.plist` (Firebase crashes at `FirebaseApp.configure()`)
- Incorrect bundle ID in Firebase configuration
- Missing required Info.plist keys

---

## Available npm Scripts

| Script | Description |
|--------|-------------|
| `npm run ios` | Run on iOS (default simulator) |
| `npm run ios:pod-install` | Install CocoaPods dependencies |
| `npm run ios:build-debug` | Build and run in Debug mode |
| `npm run ios:build-release` | Build and run in Release mode |
| `npm run ios:open-xcode` | Open the Xcode workspace |
| `npm run ios:clean` | Clean Pods and build, then reinstall pods |
