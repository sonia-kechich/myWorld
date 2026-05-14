import 'package:intl/intl.dart';

enum Mood { positive, negative }

class Message {
  final String id;
  final String userId;
  final String? text;
  final String? imageUrl;
  final String? localImagePath;
  final Mood mood;
  final DateTime timestamp;
  final DateTime? editedAt;
  final bool isDeleted;
  final double? sentimentScore;

  const Message({
    required this.id,
    required this.userId,
    this.text,
    this.imageUrl,
    this.localImagePath,
    required this.mood,
    required this.timestamp,
    this.editedAt,
    this.isDeleted = false,
    this.sentimentScore,
  });

  bool get isPositive => mood == Mood.positive;

  String get formattedTime => DateFormat('HH:mm').format(timestamp);

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'userId': userId,
      'text': text,
      'imageUrl': imageUrl,
      'localImagePath': localImagePath,
      'mood': mood.name,
      'timestamp': timestamp.toIso8601String(),
      'editedAt': editedAt?.toIso8601String(),
      'isDeleted': isDeleted,
      'sentimentScore': sentimentScore,
    };
  }

  factory Message.fromJson(Map<String, dynamic> json) {
    return Message(
      id: json['id'] as String,
      userId: json['userId'] as String,
      text: json['text'] as String?,
      imageUrl: json['imageUrl'] as String?,
      localImagePath: json['localImagePath'] as String?,
      mood: Mood.values.firstWhere(
        (m) => m.name == json['mood'],
        orElse: () => Mood.positive,
      ),
      timestamp: DateTime.parse(json['timestamp'] as String),
      editedAt: json['editedAt'] != null
          ? DateTime.parse(json['editedAt'] as String)
          : null,
      isDeleted: json['isDeleted'] as bool? ?? false,
      sentimentScore: (json['sentimentScore'] as num?)?.toDouble(),
    );
  }

  Message copyWith({
    String? id,
    String? userId,
    String? text,
    String? imageUrl,
    String? localImagePath,
    Mood? mood,
    DateTime? timestamp,
    DateTime? editedAt,
    bool? isDeleted,
    double? sentimentScore,
  }) {
    return Message(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      text: text ?? this.text,
      imageUrl: imageUrl ?? this.imageUrl,
      localImagePath: localImagePath ?? this.localImagePath,
      mood: mood ?? this.mood,
      timestamp: timestamp ?? this.timestamp,
      editedAt: editedAt ?? this.editedAt,
      isDeleted: isDeleted ?? this.isDeleted,
      sentimentScore: sentimentScore ?? this.sentimentScore,
    );
  }
}
