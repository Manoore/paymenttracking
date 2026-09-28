import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Light / System / Dark preference, saved on the device.
class ThemeController extends ChangeNotifier {
  static const _key = 'theme_mode';
  final _storage = const FlutterSecureStorage();
  ThemeMode mode = ThemeMode.system;

  Future<void> load() async {
    final v = await _storage.read(key: _key);
    mode = ThemeMode.values.firstWhere((m) => m.name == v, orElse: () => ThemeMode.system);
  }

  Future<void> set(ThemeMode m) async {
    mode = m;
    notifyListeners();
    await _storage.write(key: _key, value: m.name);
  }
}

class ThemeModePicker extends StatelessWidget {
  const ThemeModePicker({super.key, required this.controller});
  final ThemeController controller;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) => SegmentedButton<ThemeMode>(
        segments: const [
          ButtonSegment(value: ThemeMode.light, icon: Icon(Icons.light_mode_outlined), label: Text('Light')),
          ButtonSegment(value: ThemeMode.system, icon: Icon(Icons.brightness_auto_outlined), label: Text('System')),
          ButtonSegment(value: ThemeMode.dark, icon: Icon(Icons.dark_mode_outlined), label: Text('Dark')),
        ],
        selected: {controller.mode},
        onSelectionChanged: (s) => controller.set(s.first),
      ),
    );
  }
}
