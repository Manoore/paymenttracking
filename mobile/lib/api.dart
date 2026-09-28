import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http_parser/http_parser.dart';
import 'package:mime/mime.dart';

import 'config.dart';

class ApiException implements Exception {
  ApiException(this.message, [this.status]);
  final String message;
  final int? status;
  @override
  String toString() => message;
}

/// A file picked from the camera, gallery or file system, ready to upload.
class PickedUpload {
  PickedUpload(this.name, this.bytes);
  final String name;
  final Uint8List bytes;
}

/// API client. The refresh token lives in the platform keystore (Keychain /
/// Android Keystore); the short-lived access token stays in memory.
class Api extends ChangeNotifier {
  Api() {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (_accessToken != null) options.headers['Authorization'] = 'Bearer $_accessToken';
          if (workspaceId != null) options.headers['X-Workspace-Id'] = workspaceId;
          handler.next(options);
        },
        onError: (e, handler) async {
          final retried = e.requestOptions.extra['retried'] == true;
          final isAuthCall = e.requestOptions.path.startsWith('/auth/');
          if (e.response?.statusCode == 401 && !retried && !isAuthCall && await _refresh()) {
            final opts = e.requestOptions..extra['retried'] = true;
            opts.headers['Authorization'] = 'Bearer $_accessToken';
            try {
              return handler.resolve(await _dio.fetch(opts));
            } on DioException catch (err) {
              return handler.next(err);
            }
          }
          handler.next(e);
        },
      ),
    );
  }

  static const _refreshKey = 'refresh_token';
  static const _workspaceKey = 'workspace_id';
  final _storage = const FlutterSecureStorage();
  final _dio = Dio(BaseOptions(
    baseUrl: '$apiUrl/api/v1',
    connectTimeout: const Duration(seconds: 30), // Render free tier can cold-start
    receiveTimeout: const Duration(seconds: 60),
  ));

  String? _accessToken;
  Future<bool>? _refreshing;
  Map<String, dynamic>? user;

  /// Active space (personal or family). null = the account's default.
  String? workspaceId;

  /// Members of the active space: [{userId, name, email, role}].
  List<Map<String, dynamic>> members = const [];

  List<Map<String, dynamic>> get workspaces => ((user?['workspaces'] as List?) ?? const []).cast<Map<String, dynamic>>();

  Map<String, dynamic>? get workspace {
    final id = workspaceId ?? user?['defaultWorkspaceId'];
    for (final w in workspaces) {
      if (w['id'] == id) return w;
    }
    return workspaces.isEmpty ? null : workspaces.first;
  }

  bool get isFamily => workspace?['kind'] == 'family';
  bool get canWrite => workspace?['role'] != 'viewer';
  String? get myId => user?['id'] as String?;

  String? nameOf(String? userId) {
    for (final m in members) {
      if (m['userId'] == userId) return m['name'] as String?;
    }
    return null;
  }

  /// Reload profile + members (after login, switching spaces, joining a family).
  Future<void> refreshContext() async {
    try {
      user = (await get('/auth/me'))['user'] as Map<String, dynamic>;
      final ids = workspaces.map((w) => w['id']).toSet();
      if (workspaceId != null && !ids.contains(workspaceId)) {
        workspaceId = null;
        await _storage.delete(key: _workspaceKey);
      }
      members = (((await get('/workspaces/current/members'))['members'] as List?) ?? const []).cast<Map<String, dynamic>>();
    } catch (_) {}
    notifyListeners();
  }

  Future<void> switchWorkspace(String? id) async {
    workspaceId = id;
    if (id == null) {
      await _storage.delete(key: _workspaceKey);
    } else {
      await _storage.write(key: _workspaceKey, value: id);
    }
    await refreshContext();
  }

  bool get signedIn => user != null;

  String fileUrl(String? relative) => relative == null ? '' : '$apiUrl$relative';

  /// On app start: try to resume the session from the stored refresh token.
  Future<void> restore() async {
    if (await _storage.read(key: _refreshKey) == null) return;
    workspaceId = await _storage.read(key: _workspaceKey);
    if (await _refresh()) await refreshContext();
  }

  // Single-flight refresh: the backend rotates refresh tokens on every use.
  Future<bool> _refresh() => _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);

  Future<bool> _doRefresh() async {
    final token = await _storage.read(key: _refreshKey);
    if (token == null) return false;
    try {
      final res = await _dio.post('/auth/refresh', data: {'refreshToken': token});
      _accessToken = res.data['accessToken'] as String;
      await _storage.write(key: _refreshKey, value: res.data['refreshToken'] as String);
      return true;
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) await _clear();
      return false;
    }
  }

  Future<String?> signupStatus() async {
    try {
      final res = await _dio.get('/auth/status');
      return (res.data['signupOpen'] == true) ? 'open' : 'closed';
    } catch (_) {
      return null;
    }
  }

  Future<void> login(String email, String password) => _session('/auth/login', {'email': email, 'password': password});

  Future<void> register(String name, String email, String password, {String? inviteToken}) => _session('/auth/register', {
        'name': name,
        'email': email,
        'password': password,
        'inviteToken': ?inviteToken,
      });

  /// Accepts a family invite (full link or just the token) for the signed-in user.
  Future<void> acceptInvite(String linkOrToken) async {
    final token = inviteTokenFrom(linkOrToken);
    final r = await post('/invites/$token/accept') as Map<String, dynamic>;
    await switchWorkspace(r['workspaceId'] as String?);
  }

  static String inviteTokenFrom(String linkOrToken) {
    final t = linkOrToken.trim();
    final i = t.lastIndexOf('/invite/');
    return (i >= 0 ? t.substring(i + 8) : t).split(RegExp(r'[?#/]')).first;
  }

  Future<void> _session(String path, Map<String, dynamic> body) async {
    final data = await post(path, body);
    _accessToken = data['accessToken'] as String;
    await _storage.write(key: _refreshKey, value: data['refreshToken'] as String);
    user = data['user'] as Map<String, dynamic>;
    workspaceId = null;
    await _storage.delete(key: _workspaceKey);
    await refreshContext();
  }

  /// Changing the password revokes every session; store the fresh one for this device.
  Future<void> changePassword(String current, String next) async {
    final data = await post('/auth/change-password', {'currentPassword': current, 'newPassword': next});
    _accessToken = data['accessToken'] as String;
    await _storage.write(key: _refreshKey, value: data['refreshToken'] as String);
  }

  Future<void> logout() async {
    final token = await _storage.read(key: _refreshKey);
    if (token != null) {
      try {
        await _dio.post('/auth/logout', data: {'refreshToken': token});
      } catch (_) {}
    }
    await _clear();
  }

  Future<void> _clear() async {
    _accessToken = null;
    user = null;
    members = const [];
    workspaceId = null;
    await _storage.delete(key: _workspaceKey);
    await _storage.delete(key: _refreshKey);
    notifyListeners();
  }

  Future<T> _wrap<T>(Future<Response<dynamic>> Function() call) async {
    try {
      final res = await call();
      return res.data as T;
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      if (status == 401 && signedIn) await _clear();
      final data = e.response?.data;
      // Removed from the selected space: fall back to the default one (not for read-only 403s).
      if (status == 403 && workspaceId != null && data is Map && (data['error'] as Map?)?['code'] == 'not_member') {
        await switchWorkspace(null);
      }
      String? msg;
      if (data is Map) {
        final err = data['error'];
        if (err is Map) {
          final details = err['details'];
          msg = (details is List && details.isNotEmpty && details.first is Map)
              ? details.first['message'] as String?
              : err['message'] as String?;
        }
      }
      throw ApiException(
        msg ??
            (e.type == DioExceptionType.connectionTimeout || e.type == DioExceptionType.connectionError
                ? "Can't reach the server. It may be waking up; try again."
                : 'Request failed${status != null ? ' ($status)' : ''}'),
        status,
      );
    }
  }

  Future<dynamic> get(String path, [Map<String, dynamic>? query]) {
    final q = <String, dynamic>{};
    query?.forEach((k, v) {
      if (v != null && v != '') q[k] = v.toString();
    });
    return _wrap(() => _dio.get(path, queryParameters: q));
  }

  Future<dynamic> post(String path, [Object? body]) => _wrap(() => _dio.post(path, data: body ?? const {}));
  Future<dynamic> patch(String path, Object body) => _wrap(() => _dio.patch(path, data: body));
  Future<dynamic> delete(String path) => _wrap(() => _dio.delete(path));

  /// Uploads files; returns created attachment JSON objects.
  Future<List<Map<String, dynamic>>> upload(List<PickedUpload> files, {String? captureId}) async {
    if (files.isEmpty) return const [];
    final form = FormData();
    if (captureId != null) form.fields.add(MapEntry('captureId', captureId));
    for (final f in files) {
      final type = lookupMimeType(f.name, headerBytes: f.bytes.take(16).toList()) ?? 'application/octet-stream';
      form.files.add(MapEntry('files', MultipartFile.fromBytes(f.bytes, filename: f.name, contentType: MediaType.parse(type))));
    }
    final data = await _wrap<Map<String, dynamic>>(() => _dio.post('/attachments', data: form));
    return (data['items'] as List).cast<Map<String, dynamic>>();
  }
}
