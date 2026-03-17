import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/app_user.dart';
import '../theme/app_colors.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final PageController _pageController = PageController();
  int _currentPage = 0;
  bool _isLoading = false;

  final List<Map<String, dynamic>> _pages = const [
    {
      'title': 'Welcome to myWorld',
      'subtitle': 'A private space for your inner conversations.',
      'icon': Icons.chat_bubble_outline,
      'color': AppColors.positiveActive,
    },
    {
      'title': 'Two Sides of You',
      'subtitle':
          'Express both your positive and negative feelings freely.',
      'icon': Icons.switch_account,
      'color': AppColors.negativeActive,
    },
    {
      'title': 'Complete Privacy',
      'subtitle':
          'All your conversations are private and securely stored.',
      'icon': Icons.lock_outline,
      'color': AppColors.success,
    },
  ];

  Future<void> _completeOnboarding() async {
    if (_isLoading) return;
    setState(() => _isLoading = true);

    try {
      final userCredential =
          await FirebaseAuth.instance.signInAnonymously();
      final user = userCredential.user;
      if (user != null) {
        final now = DateTime.now();
        await FirebaseFirestore.instance
            .collection('users')
            .doc(user.uid)
            .set(AppUser(
              id: user.uid,
              email: 'anonymous@myworld.app',
              createdAt: now,
              lastActive: now,
              isAnonymous: true,
            ).toJson());

        if (mounted) {
          Navigator.pushReplacementNamed(context, '/home');
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [AppColors.cosmicStart, AppColors.cosmicEnd],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              Expanded(
                child: PageView.builder(
                  controller: _pageController,
                  onPageChanged: (index) =>
                      setState(() => _currentPage = index),
                  itemCount: _pages.length,
                  itemBuilder: (context, index) {
                    final page = _pages[index];
                    return Padding(
                      padding: const EdgeInsets.all(32),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Container(
                            width: 130,
                            height: 130,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: (page['color'] as Color)
                                  .withOpacity(0.15),
                              border: Border.all(
                                color: (page['color'] as Color)
                                    .withOpacity(0.5),
                                width: 2,
                              ),
                            ),
                            child: Icon(
                              page['icon'] as IconData,
                              size: 64,
                              color: page['color'] as Color,
                            ),
                          ),
                          const SizedBox(height: 48),
                          Text(
                            page['title'] as String,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontSize: 26,
                              fontWeight: FontWeight.bold,
                              color: AppColors.textPrimary,
                            ),
                          ),
                          const SizedBox(height: 16),
                          Text(
                            page['subtitle'] as String,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontSize: 16,
                              color: AppColors.textSecondary,
                              height: 1.5,
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
              // Page indicators
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  _pages.length,
                  (index) => AnimatedContainer(
                    duration: const Duration(milliseconds: 300),
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    width: _currentPage == index ? 20 : 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: _currentPage == index
                          ? AppColors.positiveActive
                          : AppColors.textSecondary,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 32),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: ElevatedButton(
                  onPressed: _isLoading
                      ? null
                      : _currentPage == _pages.length - 1
                          ? _completeOnboarding
                          : () => _pageController.nextPage(
                                duration:
                                    const Duration(milliseconds: 300),
                                curve: Curves.easeInOut,
                              ),
                  child: _isLoading
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : Text(
                          _currentPage == _pages.length - 1
                              ? 'Get Started'
                              : 'Next',
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                ),
              ),
              const SizedBox(height: 32),
            ],
          ),
        ),
      ),
    );
  }
}
