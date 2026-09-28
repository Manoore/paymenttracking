import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Accent palettes (same five as the web app): main colour + gradient partner.
class Accent {
  const Accent(this.id, this.label, this.from, this.to);
  final String id;
  final String label;
  final Color from;
  final Color to;
}

const accents = [
  Accent('indigo', 'Indigo', Color(0xFF4F46E5), Color(0xFF7C3AED)),
  Accent('ocean', 'Ocean', Color(0xFF0E7490), Color(0xFF0EA5E9)),
  Accent('sunset', 'Sunset', Color(0xFFDC4A2E), Color(0xFFF59E0B)),
  Accent('grape', 'Grape', Color(0xFF9333EA), Color(0xFFDB2777)),
  Accent('forest', 'Forest', Color(0xFF15803D), Color(0xFF0D9488)),
];

/// Colour per record type (matches the web): payments blue, expenses orange, …
const typeColorsLight = {
  'payment': Color(0xFF2563EB),
  'expense': Color(0xFFEA580C),
  'deposit': Color(0xFF16A34A),
  'document': Color(0xFF7C3AED),
  'place': Color(0xFFDB2777),
  'idea': Color(0xFFD97706),
  'note': Color(0xFF0D9488),
  'link': Color(0xFF0284C7),
};
const typeColorsDark = {
  'payment': Color(0xFF7AA7FF),
  'expense': Color(0xFFFB923C),
  'deposit': Color(0xFF4ADE80),
  'document': Color(0xFFB794FF),
  'place': Color(0xFFF472B6),
  'idea': Color(0xFFFBBF24),
  'note': Color(0xFF2DD4BF),
  'link': Color(0xFF38BDF8),
};

Color typeColor(BuildContext context, String type) {
  final dark = Theme.of(context).brightness == Brightness.dark;
  return (dark ? typeColorsDark : typeColorsLight)[type] ?? Theme.of(context).colorScheme.primary;
}

/// Light / System / Dark preference and accent palette, saved on the device.
class ThemeController extends ChangeNotifier {
  static const _key = 'theme_mode';
  static const _accentKey = 'accent';
  final _storage = const FlutterSecureStorage();
  ThemeMode mode = ThemeMode.system;
  Accent accent = accents.first;

  Future<void> load() async {
    final v = await _storage.read(key: _key);
    mode = ThemeMode.values.firstWhere((m) => m.name == v, orElse: () => ThemeMode.system);
    final a = await _storage.read(key: _accentKey);
    accent = accents.firstWhere((x) => x.id == a, orElse: () => accents.first);
  }

  Future<void> set(ThemeMode m) async {
    mode = m;
    notifyListeners();
    await _storage.write(key: _key, value: m.name);
  }

  Future<void> setAccent(Accent a) async {
    accent = a;
    notifyListeners();
    await _storage.write(key: _accentKey, value: a.id);
  }

  ThemeData themeFor(Brightness brightness) {
    final dark = brightness == Brightness.dark;
    final scheme = ColorScheme.fromSeed(seedColor: accent.from, brightness: brightness).copyWith(
      tertiary: accent.to,
      surface: dark ? const Color(0xFF151826) : Colors.white,
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: dark ? const Color(0xFF0D0F17) : const Color(0xFFF4F5FB),
      cardTheme: CardThemeData(
        elevation: 0,
        color: scheme.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: BorderSide(color: dark ? const Color(0xFF2A2F45) : const Color(0xFFE2E5EF)),
        ),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: dark ? const Color(0xFF0D0F17) : const Color(0xFFF4F5FB),
        surfaceTintColor: Colors.transparent,
      ),
      chipTheme: const ChipThemeData(shape: StadiumBorder()),
      inputDecorationTheme: InputDecorationTheme(border: OutlineInputBorder(borderRadius: BorderRadius.circular(14))),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(backgroundColor: accent.from, foregroundColor: Colors.white),
      navigationBarTheme: NavigationBarThemeData(indicatorColor: scheme.primaryContainer),
    );
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

class AccentPicker extends StatelessWidget {
  const AccentPicker({super.key, required this.controller});
  final ThemeController controller;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) => Wrap(spacing: 8, runSpacing: 8, children: [
        for (final a in accents)
          ChoiceChip(
            avatar: Container(
              width: 20,
              height: 20,
              decoration: BoxDecoration(shape: BoxShape.circle, gradient: LinearGradient(colors: [a.from, a.to])),
            ),
            label: Text(a.label),
            selected: controller.accent.id == a.id,
            onSelected: (_) => controller.setAccent(a),
          ),
      ]),
    );
  }
}

/// Gradient panel in the current accent (Home header).
BoxDecoration heroDecoration(ThemeController c) => BoxDecoration(
      borderRadius: BorderRadius.circular(24),
      gradient: LinearGradient(colors: [c.accent.from, c.accent.to], begin: Alignment.topLeft, end: Alignment.bottomRight),
    );
