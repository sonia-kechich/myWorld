import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';
import 'package:encrypt/encrypt.dart' as enc;

class SecurityService {
  static const FlutterSecureStorage _secureStorage = FlutterSecureStorage();
  static final LocalAuthentication _localAuth = LocalAuthentication();

  static const String _passcodeKey = 'myworld_passcode_hash';
  static const String _passcodeSaltKey = 'myworld_passcode_salt';

  /// Derives a 32-byte AES key from a passcode using SHA-256 with a salt.
  static Uint8List _deriveKey(String passcode, String salt) {
    final input = utf8.encode('$salt:$passcode');
    // Apply multiple rounds of SHA-256 to slow brute-force attacks.
    var hash = sha256.convert(input).bytes;
    for (var i = 0; i < 10000; i++) {
      hash = sha256.convert([...hash, ...input]).bytes;
    }
    return Uint8List.fromList(hash);
  }

  /// Stores a secure passcode hash using a salted SHA-256 KDF.
  static Future<void> setPasscode(String passcode) async {
    final salt = _generateSalt();
    final derivedKey = _deriveKey(passcode, salt);
    final hash = base64.encode(derivedKey);
    await _secureStorage.write(key: _passcodeSaltKey, value: salt);
    await _secureStorage.write(key: _passcodeKey, value: hash);
  }

  /// Verifies the provided passcode against the stored hash.
  static Future<bool> verifyPasscode(String passcode) async {
    final salt = await _secureStorage.read(key: _passcodeSaltKey);
    final storedHash = await _secureStorage.read(key: _passcodeKey);
    if (salt == null || storedHash == null) return false;

    final derivedKey = _deriveKey(passcode, salt);
    final hash = base64.encode(derivedKey);
    return hash == storedHash;
  }

  /// Generates a random salt string from the current time for key derivation.
  static String _generateSalt() {
    final now = DateTime.now().microsecondsSinceEpoch;
    return sha256.convert(utf8.encode(now.toString())).toString();
  }

  /// Removes the stored passcode.
  static Future<void> removePasscode() async {
    await _secureStorage.delete(key: _passcodeKey);
    await _secureStorage.delete(key: _passcodeSaltKey);
  }

  /// Checks whether biometric authentication is available on this device.
  static Future<bool> canUseBiometrics() async {
    try {
      return await _localAuth.canCheckBiometrics ||
          await _localAuth.isDeviceSupported();
    } catch (_) {
      return false;
    }
  }

  /// Prompts the user to authenticate using biometrics.
  static Future<bool> authenticateWithBiometrics() async {
    final canAuthenticate = await canUseBiometrics();
    if (!canAuthenticate) return false;

    try {
      return await _localAuth.authenticate(
        localizedReason: 'Authenticate to access myWorld',
        options: const AuthenticationOptions(biometricOnly: true),
      );
    } catch (_) {
      return false;
    }
  }

  /// Encrypts a plaintext string using AES-256.
  /// Returns a base64-encoded string of the form "iv:ciphertext".
  static String encryptText(String plaintext, String keyText) {
    final salt = _generateSalt();
    final keyBytes = _deriveKey(keyText, salt);
    final key = enc.Key(Uint8List.fromList(keyBytes));
    final iv = enc.IV.fromSecureRandom(16);
    final encrypter = enc.Encrypter(enc.AES(key));
    final encrypted = encrypter.encrypt(plaintext, iv: iv);
    return '$salt:${iv.base64}:${encrypted.base64}';
  }

  /// Decrypts a ciphertext string produced by [encryptText].
  static String decryptText(String ciphertext, String keyText) {
    final parts = ciphertext.split(':');
    if (parts.length != 3) return ciphertext;

    final salt = parts[0];
    final iv = enc.IV.fromBase64(parts[1]);
    final keyBytes = _deriveKey(keyText, salt);
    final key = enc.Key(Uint8List.fromList(keyBytes));
    final encrypter = enc.Encrypter(enc.AES(key));
    return encrypter.decrypt64(parts[2], iv: iv);
  }
}

