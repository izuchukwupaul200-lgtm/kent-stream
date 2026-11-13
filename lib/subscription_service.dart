
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:supabase_flutter/supabase_flutter.dart';

enum AccessStatus {
  trial,
  active,
  expired,
  unavailable,
}

class SubscriptionService {
  static final supabase = Supabase.instance.client;

  static const String backendUrl =
      'https://kent-stream.onrender.com';

  static Future<AccessStatus> checkAccess() async {
    final user = supabase.auth.currentUser;

    if (user == null) {
      return AccessStatus.unavailable;
    }

    try {
      final data = await supabase
          .from('subscriptions')
          .select(
        'status, trial_ends_at, subscription_expires_at',
      )
          .eq('user_id', user.id)
          .maybeSingle();

      if (data == null || data['trial_ends_at'] == null) {
        return AccessStatus.unavailable;
      }

      final now = DateTime.now().toUtc();

      final trialEnd =
      DateTime.parse(data['trial_ends_at']).toUtc();

      final subscriptionEnd =
      data['subscription_expires_at'] == null
          ? null
          : DateTime.parse(
        data['subscription_expires_at'],
      ).toUtc();

      if (data['status'] == 'active' &&
          subscriptionEnd != null &&
          subscriptionEnd.isAfter(now)) {
        return AccessStatus.active;
      }

      if (data['status'] == 'trial' &&
          trialEnd.isAfter(now)) {
        return AccessStatus.trial;
      }

      return AccessStatus.expired;
    } catch (_) {
      return AccessStatus.unavailable;
    }
  }

  static Future<Map<String, dynamic>> checkBackend() async {
    final client = HttpClient();

    try {
      final request = await client
          .getUrl(Uri.parse('$backendUrl/health'))
          .timeout(const Duration(seconds: 30));

      final response = await request.close().timeout(
        const Duration(seconds: 30),
      );

      final body = await response.transform(
        utf8.decoder,
      ).join();

      return {
        'success': response.statusCode == 200,
        'data': jsonDecode(body),
      };
    } catch (error) {
      return {
        'success': false,
        'message': error.toString(),
      };
    } finally {
      client.close();
    }
  }
}
