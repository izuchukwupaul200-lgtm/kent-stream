
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:webview_flutter/webview_flutter.dart';

class CheckoutService {
  static const String backendUrl =
      'https://kent-stream.onrender.com';

  // RECOVER AN EXISTING SUCCESSFUL PAYSTACK PAYMENT.
  // This does not start a new payment.
  static Future<bool> recoverExistingPayment() async {
    final supabase = Supabase.instance.client;
    final session = supabase.auth.currentSession;
    final user = supabase.auth.currentUser;

    if (session == null || user == null) {
      throw Exception('Please sign in again.');
    }

    final client = HttpClient();

    try {
      final result = await _post(
        client,
        '/api/paystack/recover',
        session.accessToken,
        {},
      );

      debugPrint('KENT PAYSTACK RECOVERY: $result');

      return result['paid'] == true;
    } on TimeoutException {
      throw Exception('Payment recovery timed out. Please try again.');
    } on SocketException {
      throw Exception('No internet connection. Please try again.');
    } finally {
      client.close(force: true);
    }
  }

  // START A NEW PAYSTACK SUBSCRIPTION PAYMENT.
  static Future<void> startCheckout(BuildContext context) async {
    final supabase = Supabase.instance.client;
    final session = supabase.auth.currentSession;
    final user = supabase.auth.currentUser;

    if (session == null || user == null) {
      throw Exception('Please sign in again.');
    }

    final client = HttpClient();

    try {
      // STEP 1: Initialize payment securely on the backend.
      final prepareData = await _post(
        client,
        '/api/paystack/prepare',
        session.accessToken,
        {},
      );

      final reference = prepareData['reference']?.toString();
      final checkoutUrl =
      prepareData['authorization_url']?.toString();

      if (reference == null ||
          reference.isEmpty ||
          checkoutUrl == null ||
          checkoutUrl.isEmpty) {
        throw Exception('Paystack checkout details are incomplete.');
      }

      final uri = Uri.tryParse(checkoutUrl);

      if (uri == null ||
          uri.scheme != 'https' ||
          uri.host != 'checkout.paystack.com') {
        throw Exception('Invalid Paystack checkout address.');
      }

      if (!context.mounted) return;

      // STEP 2: Open Paystack checkout inside KENT STREAM.
      final completed = await Navigator.of(context).push<bool>(
        MaterialPageRoute(
          builder: (_) => _PaystackCheckoutPage(
            checkoutUrl: checkoutUrl,
          ),
        ),
      );

      if (!context.mounted) return;

      if (completed != true) {
        throw Exception(
          'Payment checkout was closed. '
              'If you completed payment, use the recovery option '
              'before trying again.',
        );
      }

      // STEP 3: Verify the transaction directly with our backend.
      final verifyData = await _post(
        client,
        '/api/paystack/verify',
        session.accessToken,
        {
          'reference': reference,
        },
      );

      // STEP 4: Accept success only after backend confirmation.
      if (verifyData['paid'] != true) {
        throw Exception(
          verifyData['message']?.toString() ??
              'Payment has not yet been confirmed. '
                  'Please check your subscription shortly.',
        );
      }

      debugPrint('KENT PAYSTACK PAYMENT VERIFIED: $reference');
    } on TimeoutException {
      throw Exception(
        'Payment server timed out. Please try again.',
      );
    } on SocketException {
      throw Exception(
        'No internet connection. Please try again.',
      );
    } finally {
      client.close(force: true);
    }
  }

  // COMMON BACKEND POST REQUEST.
  static Future<Map<String, dynamic>> _post(
      HttpClient client,
      String path,
      String accessToken,
      Map<String, dynamic> body,
      ) async {
    debugPrint('--------------------------------');
    debugPrint('KENT PAYMENT URL: $backendUrl$path');

    final request = await client
        .postUrl(Uri.parse('$backendUrl$path'))
        .timeout(const Duration(seconds: 45));

    request.headers.set(
      HttpHeaders.authorizationHeader,
      'Bearer $accessToken',
    );

    request.headers.set(
      HttpHeaders.contentTypeHeader,
      'application/json',
    );

    request.write(jsonEncode(body));

    final response = await request.close().timeout(
      const Duration(seconds: 45),
    );

    final responseBody =
    await response.transform(utf8.decoder).join();

    debugPrint('KENT PAYMENT STATUS: ${response.statusCode}');
    debugPrint('KENT PAYMENT RESPONSE: $responseBody');
    debugPrint('--------------------------------');

    dynamic decoded;

    try {
      decoded = jsonDecode(responseBody);
    } catch (_) {
      throw Exception('Invalid response from payment server.');
    }

    if (decoded is! Map<String, dynamic>) {
      throw Exception('Unexpected response from payment server.');
    }

    if (response.statusCode < 200 ||
        response.statusCode >= 300) {
      throw Exception(
        decoded['error']?.toString() ??
            decoded['message']?.toString() ??
            'Payment request failed.',
      );
    }

    return decoded;
  }
}

// PAYSTACK CHECKOUT WEBVIEW.
class _PaystackCheckoutPage extends StatefulWidget {
  final String checkoutUrl;

  const _PaystackCheckoutPage({
    required this.checkoutUrl,
  });

  @override
  State<_PaystackCheckoutPage> createState() =>
      _PaystackCheckoutPageState();
}

class _PaystackCheckoutPageState
    extends State<_PaystackCheckoutPage> {
  late final WebViewController controller;
  bool isLoading = true;
  String? loadingError;

  @override
  void initState() {
    super.initState();

    controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (url) {
            _checkPaymentCallback(url);
          },
          onNavigationRequest: (request) {
            final completed =
            _checkPaymentCallback(request.url);

            if (completed) {
              return NavigationDecision.prevent;
            }

            return NavigationDecision.navigate;
          },
          onPageFinished: (_) {
            if (mounted) {
              setState(() {
                isLoading = false;
              });
            }
          },
          onWebResourceError: (error) {
            if (error.isForMainFrame == true && mounted) {
              setState(() {
                loadingError =
                'Unable to load checkout. Please check your internet connection.';
                isLoading = false;
              });
            }
          },
        ),
      )
      ..loadRequest(Uri.parse(widget.checkoutUrl));
  }

  // Paystack redirects to our backend callback after checkout.
  bool _checkPaymentCallback(String url) {
    final uri = Uri.tryParse(url);

    if (uri == null) return false;

    if (uri.host == 'kent-stream.onrender.com' &&
        uri.path == '/api/paystack/callback') {
      if (mounted && Navigator.of(context).canPop()) {
        Navigator.of(context).pop(true);
      }

      return true;
    }

    return false;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF080808),
      appBar: AppBar(
        backgroundColor: const Color(0xFF080808),
        foregroundColor: Colors.white,
        title: const Text('KENT STREAM PAYMENT'),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () {
            Navigator.of(context).pop(false);
          },
        ),
      ),
      body: Stack(
        children: [
          if (loadingError == null)
            WebViewWidget(controller: controller),

          if (isLoading && loadingError == null)
            const Center(
              child: CircularProgressIndicator(
                color: Color(0xFFE50920),
              ),
            ),

          if (loadingError != null)
            Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.wifi_off,
                      color: Colors.white,
                      size: 48,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      loadingError!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton(
                      onPressed: () {
                        setState(() {
                          loadingError = null;
                          isLoading = true;
                        });

                        controller.reload();
                      },
                      child: const Text('Try again'),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
