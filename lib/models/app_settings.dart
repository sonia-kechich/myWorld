class AppSettings {
  final String userId;
  final bool darkMode;
  final bool hapticFeedback;
  final bool lockOnLaunch;
  final bool biometricEnabled;
  final String? passcodeHash;
  final int autoDeleteDays;
  final bool showTimestamps;
  final String language;

  const AppSettings({
    required this.userId,
    this.darkMode = true,
    this.hapticFeedback = true,
    this.lockOnLaunch = false,
    this.biometricEnabled = false,
    this.passcodeHash,
    this.autoDeleteDays = 0,
    this.showTimestamps = true,
    this.language = 'en',
  });

  Map<String, dynamic> toJson() {
    return {
      'userId': userId,
      'darkMode': darkMode,
      'hapticFeedback': hapticFeedback,
      'lockOnLaunch': lockOnLaunch,
      'biometricEnabled': biometricEnabled,
      'passcodeHash': passcodeHash,
      'autoDeleteDays': autoDeleteDays,
      'showTimestamps': showTimestamps,
      'language': language,
    };
  }

  factory AppSettings.fromJson(Map<String, dynamic> json) {
    return AppSettings(
      userId: json['userId'] as String,
      darkMode: json['darkMode'] as bool? ?? true,
      hapticFeedback: json['hapticFeedback'] as bool? ?? true,
      lockOnLaunch: json['lockOnLaunch'] as bool? ?? false,
      biometricEnabled: json['biometricEnabled'] as bool? ?? false,
      passcodeHash: json['passcodeHash'] as String?,
      autoDeleteDays: json['autoDeleteDays'] as int? ?? 0,
      showTimestamps: json['showTimestamps'] as bool? ?? true,
      language: json['language'] as String? ?? 'en',
    );
  }

  AppSettings copyWith({
    String? userId,
    bool? darkMode,
    bool? hapticFeedback,
    bool? lockOnLaunch,
    bool? biometricEnabled,
    String? passcodeHash,
    int? autoDeleteDays,
    bool? showTimestamps,
    String? language,
  }) {
    return AppSettings(
      userId: userId ?? this.userId,
      darkMode: darkMode ?? this.darkMode,
      hapticFeedback: hapticFeedback ?? this.hapticFeedback,
      lockOnLaunch: lockOnLaunch ?? this.lockOnLaunch,
      biometricEnabled: biometricEnabled ?? this.biometricEnabled,
      passcodeHash: passcodeHash ?? this.passcodeHash,
      autoDeleteDays: autoDeleteDays ?? this.autoDeleteDays,
      showTimestamps: showTimestamps ?? this.showTimestamps,
      language: language ?? this.language,
    );
  }
}
