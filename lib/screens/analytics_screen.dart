import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../models/message.dart';
import '../theme/app_colors.dart';

class AnalyticsScreen extends StatefulWidget {
  const AnalyticsScreen({super.key});

  @override
  State<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends State<AnalyticsScreen> {
  int _positiveCount = 0;
  int _negativeCount = 0;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadAnalytics();
  }

  Future<void> _loadAnalytics() async {
    final userId = FirebaseAuth.instance.currentUser?.uid;
    if (userId == null) return;

    try {
      final snapshot = await FirebaseFirestore.instance
          .collection('users')
          .doc(userId)
          .collection('messages')
          .where('isDeleted', isEqualTo: false)
          .get();

      final messages =
          snapshot.docs.map((d) => Message.fromJson(d.data())).toList();

      if (mounted) {
        setState(() {
          _positiveCount =
              messages.where((m) => m.mood == Mood.positive).length;
          _negativeCount =
              messages.where((m) => m.mood == Mood.negative).length;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final total = _positiveCount + _negativeCount;
    final positiveRatio = total > 0 ? _positiveCount / total : 0.5;

    return Scaffold(
      appBar: AppBar(title: const Text('Analytics')),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [AppColors.cosmicStart, AppColors.cosmicEnd],
          ),
        ),
        child: _isLoading
            ? const Center(child: CircularProgressIndicator())
            : Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Mood Distribution',
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 24),
                    _buildMoodBar(positiveRatio),
                    const SizedBox(height: 32),
                    Row(
                      children: [
                        Expanded(
                          child: _buildStatCard(
                            label: 'Positive',
                            count: _positiveCount,
                            color: AppColors.positiveActive,
                            emoji: '😊',
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: _buildStatCard(
                            label: 'Negative',
                            count: _negativeCount,
                            color: AppColors.negativeActive,
                            emoji: '😔',
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),
                    _buildStatCard(
                      label: 'Total Messages',
                      count: total,
                      color: AppColors.positiveBorder,
                      emoji: '💬',
                    ),
                  ],
                ),
              ),
      ),
    );
  }

  Widget _buildMoodBar(double positiveRatio) {
    return Column(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Row(
            children: [
              Expanded(
                flex: (positiveRatio * 100).round(),
                child: Container(
                  height: 24,
                  color: AppColors.positiveActive,
                ),
              ),
              Expanded(
                flex: 100 - (positiveRatio * 100).round(),
                child: Container(
                  height: 24,
                  color: AppColors.negativeActive,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              '😊 ${(positiveRatio * 100).toStringAsFixed(0)}%',
              style: const TextStyle(color: AppColors.textPrimary),
            ),
            Text(
              '${((1 - positiveRatio) * 100).toStringAsFixed(0)}% 😔',
              style: const TextStyle(color: AppColors.textPrimary),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildStatCard({
    required String label,
    required int count,
    required Color color,
    required String emoji,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surfaceDark,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(
        children: [
          Text(emoji, style: const TextStyle(fontSize: 32)),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                count.toString(),
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  color: color,
                ),
              ),
              Text(
                label,
                style: const TextStyle(
                  fontSize: 14,
                  color: AppColors.textSecondary,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
