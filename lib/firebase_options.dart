import 'package:flutter/foundation.dart';
import 'package:firebase_core/firebase_core.dart';

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (defaultTargetPlatform == TargetPlatform.android) {
      return const FirebaseOptions(
        apiKey: 'YOUR_ANDROID_API_KEY',
        appId: 'YOUR_ANDROID_APP_ID',
        messagingSenderId: 'YOUR_SENDER_ID',
        projectId: 'myworld-self-talk',
        storageBucket: 'myworld-self-talk.appspot.com',
      );
    }
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      return const FirebaseOptions(
        apiKey: 'YOUR_IOS_API_KEY',
        appId: 'YOUR_IOS_APP_ID',
        messagingSenderId: 'YOUR_SENDER_ID',
        projectId: 'myworld-self-talk',
        storageBucket: 'myworld-self-talk.appspot.com',
        iosClientId: 'YOUR_IOS_CLIENT_ID',
        iosBundleId: 'com.example.myWorld',
      );
    }
    throw UnsupportedError(
      'DefaultFirebaseOptions have not been configured for this platform.',
    );
  }
}
