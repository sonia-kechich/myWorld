class AppUser {
  final String id;
  final String email;
  final String? displayName;
  final String? photoUrl;
  final DateTime createdAt;
  final DateTime lastActive;
  final bool isAnonymous;
  final int messageCount;
  final int streakDays;

  const AppUser({
    required this.id,
    required this.email,
    this.displayName,
    this.photoUrl,
    required this.createdAt,
    required this.lastActive,
    this.isAnonymous = false,
    this.messageCount = 0,
    this.streakDays = 0,
  });

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'email': email,
      'displayName': displayName,
      'photoUrl': photoUrl,
      'createdAt': createdAt.toIso8601String(),
      'lastActive': lastActive.toIso8601String(),
      'isAnonymous': isAnonymous,
      'messageCount': messageCount,
      'streakDays': streakDays,
    };
  }

  factory AppUser.fromJson(Map<String, dynamic> json) {
    return AppUser(
      id: json['id'] as String,
      email: json['email'] as String,
      displayName: json['displayName'] as String?,
      photoUrl: json['photoUrl'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      lastActive: DateTime.parse(json['lastActive'] as String),
      isAnonymous: json['isAnonymous'] as bool? ?? false,
      messageCount: json['messageCount'] as int? ?? 0,
      streakDays: json['streakDays'] as int? ?? 0,
    );
  }

  AppUser copyWith({
    String? id,
    String? email,
    String? displayName,
    String? photoUrl,
    DateTime? createdAt,
    DateTime? lastActive,
    bool? isAnonymous,
    int? messageCount,
    int? streakDays,
  }) {
    return AppUser(
      id: id ?? this.id,
      email: email ?? this.email,
      displayName: displayName ?? this.displayName,
      photoUrl: photoUrl ?? this.photoUrl,
      createdAt: createdAt ?? this.createdAt,
      lastActive: lastActive ?? this.lastActive,
      isAnonymous: isAnonymous ?? this.isAnonymous,
      messageCount: messageCount ?? this.messageCount,
      streakDays: streakDays ?? this.streakDays,
    );
  }
}
