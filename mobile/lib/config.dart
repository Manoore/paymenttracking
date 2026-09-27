/// API base URL, set at build time:
///   flutter run --dart-define=API_URL=https://your-api.onrender.com
/// Android emulator reaches the host machine at 10.0.2.2.
const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:4000');
