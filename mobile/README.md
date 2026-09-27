# Capture Hub – mobile (Flutter)

Android + iOS client for the Capture Hub API.

```bash
flutter pub get
# Android emulator against a local API (host machine = 10.0.2.2)
flutter run
# Against the deployed Render API
flutter run --dart-define=API_URL=https://YOUR-API.onrender.com
flutter build apk --release --dart-define=API_URL=https://YOUR-API.onrender.com
flutter build ipa --release --dart-define=API_URL=https://YOUR-API.onrender.com   # on a Mac
```

Security notes: the refresh token is stored with `flutter_secure_storage`
(Keychain / Android Keystore); access tokens stay in memory. Release builds
only allow HTTPS; plain HTTP is enabled for Android debug builds only.

Windows note: very long project paths can exceed the 260-character limit
during `flutter` commands. Keep the repo in a short path such as `C:\dev\paymenttracking`.
