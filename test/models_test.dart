import 'package:flutter_test/flutter_test.dart';
import 'package:my_world/models/message.dart';
import 'package:my_world/models/app_user.dart';
import 'package:my_world/models/app_settings.dart';

void main() {
  group('Message model', () {
    test('toJson / fromJson round-trip', () {
      final now = DateTime(2024, 1, 15, 10, 30);
      final message = Message(
        id: 'test-id',
        userId: 'user-123',
        text: 'Hello world',
        mood: Mood.positive,
        timestamp: now,
      );

      final json = message.toJson();
      final restored = Message.fromJson(json);

      expect(restored.id, message.id);
      expect(restored.userId, message.userId);
      expect(restored.text, message.text);
      expect(restored.mood, message.mood);
      expect(restored.timestamp, message.timestamp);
      expect(restored.isDeleted, false);
    });

    test('isPositive returns true for positive mood', () {
      final message = Message(
        id: 'id',
        userId: 'uid',
        mood: Mood.positive,
        timestamp: DateTime.now(),
      );
      expect(message.isPositive, isTrue);
    });

    test('isPositive returns false for negative mood', () {
      final message = Message(
        id: 'id',
        userId: 'uid',
        mood: Mood.negative,
        timestamp: DateTime.now(),
      );
      expect(message.isPositive, isFalse);
    });

    test('formattedTime formats correctly', () {
      final message = Message(
        id: 'id',
        userId: 'uid',
        mood: Mood.positive,
        timestamp: DateTime(2024, 1, 15, 14, 5),
      );
      expect(message.formattedTime, '14:05');
    });

    test('copyWith updates only specified fields', () {
      final original = Message(
        id: 'id',
        userId: 'uid',
        text: 'original text',
        mood: Mood.positive,
        timestamp: DateTime.now(),
      );
      final updated = original.copyWith(text: 'updated text');

      expect(updated.text, 'updated text');
      expect(updated.id, original.id);
      expect(updated.mood, original.mood);
    });

    test('fromJson handles missing optional fields', () {
      final json = {
        'id': 'id',
        'userId': 'uid',
        'mood': 'negative',
        'timestamp': DateTime.now().toIso8601String(),
      };
      final message = Message.fromJson(json);
      expect(message.text, isNull);
      expect(message.imageUrl, isNull);
      expect(message.isDeleted, isFalse);
    });
  });

  group('AppUser model', () {
    test('toJson / fromJson round-trip', () {
      final now = DateTime(2024, 6, 1, 12, 0);
      final user = AppUser(
        id: 'user-1',
        email: 'test@example.com',
        createdAt: now,
        lastActive: now,
      );

      final json = user.toJson();
      final restored = AppUser.fromJson(json);

      expect(restored.id, user.id);
      expect(restored.email, user.email);
      expect(restored.isAnonymous, false);
      expect(restored.messageCount, 0);
      expect(restored.streakDays, 0);
    });

    test('copyWith works correctly', () {
      final now = DateTime.now();
      final user = AppUser(
        id: 'user-1',
        email: 'test@example.com',
        createdAt: now,
        lastActive: now,
      );
      final updated = user.copyWith(messageCount: 5, streakDays: 3);

      expect(updated.messageCount, 5);
      expect(updated.streakDays, 3);
      expect(updated.id, user.id);
    });
  });

  group('AppSettings model', () {
    test('default values', () {
      final settings = AppSettings(userId: 'user-1');

      expect(settings.darkMode, isTrue);
      expect(settings.hapticFeedback, isTrue);
      expect(settings.lockOnLaunch, isFalse);
      expect(settings.biometricEnabled, isFalse);
      expect(settings.autoDeleteDays, 0);
      expect(settings.showTimestamps, isTrue);
      expect(settings.language, 'en');
    });

    test('toJson / fromJson round-trip', () {
      final settings = AppSettings(
        userId: 'user-1',
        darkMode: false,
        language: 'fr',
      );

      final json = settings.toJson();
      final restored = AppSettings.fromJson(json);

      expect(restored.userId, settings.userId);
      expect(restored.darkMode, false);
      expect(restored.language, 'fr');
    });

    test('copyWith updates specified fields', () {
      final settings = AppSettings(userId: 'user-1');
      final updated = settings.copyWith(biometricEnabled: true);

      expect(updated.biometricEnabled, isTrue);
      expect(updated.userId, settings.userId);
      expect(updated.darkMode, settings.darkMode);
    });
  });
}
