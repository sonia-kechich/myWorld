import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:intl/intl.dart';

import '../models/message.dart';
import '../theme/app_colors.dart';
import 'full_screen_image.dart';

class MessageBubble extends StatelessWidget {
  final Message message;
  final VoidCallback? onDelete;

  const MessageBubble({
    super.key,
    required this.message,
    this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final isPositive = message.isPositive;

    return GestureDetector(
      onLongPress: onDelete != null
          ? () => _showDeleteDialog(context)
          : null,
      child: Container(
        margin: EdgeInsets.only(
          bottom: 8,
          left: isPositive ? 48 : 0,
          right: isPositive ? 0 : 48,
        ),
        child: Row(
          mainAxisAlignment: isPositive
              ? MainAxisAlignment.end
              : MainAxisAlignment.start,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            if (!isPositive) _buildAvatar('😔', AppColors.negativeBubble),
            Flexible(
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: isPositive
                      ? AppColors.positiveBubble
                      : AppColors.negativeBubble,
                  borderRadius: BorderRadius.only(
                    topLeft: const Radius.circular(18),
                    topRight: const Radius.circular(18),
                    bottomLeft: isPositive
                        ? const Radius.circular(18)
                        : Radius.zero,
                    bottomRight: isPositive
                        ? Radius.zero
                        : const Radius.circular(18),
                  ),
                  border: Border.all(
                    color: isPositive
                        ? AppColors.positiveBorder
                        : AppColors.negativeBorder,
                    width: 1,
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (message.text != null && message.text!.isNotEmpty)
                      Text(
                        message.text!,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                        ),
                      ),
                    if (message.imageUrl != null)
                      GestureDetector(
                        onTap: () => Navigator.push(
                          context,
                          MaterialPageRoute<void>(
                            builder: (context) => FullScreenImage(
                              imageUrl: message.imageUrl!,
                            ),
                          ),
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: CachedNetworkImage(
                            imageUrl: message.imageUrl!,
                            width: 200,
                            height: 200,
                            fit: BoxFit.cover,
                            placeholder: (context, url) => Container(
                              width: 200,
                              height: 200,
                              color: AppColors.surfaceLight,
                              child: const Center(
                                child: CircularProgressIndicator(),
                              ),
                            ),
                            errorWidget: (context, url, error) =>
                                const Icon(
                              Icons.broken_image,
                              color: Colors.white54,
                              size: 48,
                            ),
                          ),
                        ),
                      ),
                    const SizedBox(height: 4),
                    Align(
                      alignment: Alignment.bottomRight,
                      child: Text(
                        DateFormat('HH:mm').format(message.timestamp),
                        style: const TextStyle(
                          color: Colors.white54,
                          fontSize: 11,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (isPositive) _buildAvatar('😊', AppColors.positiveBubble),
          ],
        ),
      ),
    );
  }

  Widget _buildAvatar(String emoji, Color color) {
    return Container(
      width: 36,
      height: 36,
      margin: const EdgeInsets.symmetric(horizontal: 6),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: color,
        border: Border.all(
          color: Colors.white24,
          width: 1,
        ),
      ),
      child: Center(
        child: Text(emoji, style: const TextStyle(fontSize: 18)),
      ),
    );
  }

  void _showDeleteDialog(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppColors.surfaceDark,
        title: const Text(
          'Delete message?',
          style: TextStyle(color: AppColors.textPrimary),
        ),
        content: const Text(
          'This message will be permanently deleted.',
          style: TextStyle(color: AppColors.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              onDelete?.call();
            },
            child: const Text(
              'Delete',
              style: TextStyle(color: AppColors.negativeActive),
            ),
          ),
        ],
      ),
    );
  }
}
