
import 'dart:async';
import 'dart:ui' show FontFeature;

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'subscription_service.dart';
import 'checkout_service.dart';

const Color black = Color(0xFF080808);
const Color red = Color(0xFFE50920);
const Color surface = Color(0xFF151515);
const Color green = Color(0xFF35D07F);

class SubscriptionScreen extends StatefulWidget {
  const SubscriptionScreen({super.key});

  @override
  State<SubscriptionScreen> createState() =>
      _SubscriptionScreenState();
}

class _SubscriptionScreenState extends State<SubscriptionScreen>
    with WidgetsBindingObserver {
  Timer? timer;

  bool loading = true;
  bool hasError = false;
  bool checkoutLoading = false;
  bool recoveryLoading = false;
  bool refreshing = false;

  String errorMessage = '';

  AccessStatus accessStatus = AccessStatus.unavailable;

  DateTime? trialEndsAt;
  DateTime? subscriptionEndsAt;

  @override
  void initState() {
    super.initState();

    WidgetsBinding.instance.addObserver(this);

    refreshStatus();

    timer = Timer.periodic(
      const Duration(seconds: 1),
          (_) => updateCountdown(),
    );
  }

  @override
  void dispose() {
    timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      refreshStatus();
    }
  }

  Future<void> refreshStatus() async {
    if (refreshing) return;

    refreshing = true;

    if (mounted) {
      setState(() {
        loading = true;
        hasError = false;
        errorMessage = '';
      });
    }

    try {
      final client = Supabase.instance.client;
      final user = client.auth.currentUser;

      if (user == null) {
        throw Exception('Please sign in again.');
      }

      final data = await client
          .from('subscriptions')
          .select(
        'status, trial_ends_at, subscription_expires_at',
      )
          .eq('user_id', user.id)
          .maybeSingle();

      if (data == null) {
        throw Exception(
          'Subscription record not found for this account.',
        );
      }

      final trialValue = data['trial_ends_at'];
      final subscriptionValue =
      data['subscription_expires_at'];

      final trialDate = trialValue == null
          ? null
          : DateTime.parse(trialValue.toString()).toUtc();

      final subscriptionDate = subscriptionValue == null
          ? null
          : DateTime.parse(
        subscriptionValue.toString(),
      ).toUtc();

      final now = DateTime.now().toUtc();

      AccessStatus status;

      if (data['status'] == 'active' &&
          subscriptionDate != null &&
          subscriptionDate.isAfter(now)) {
        status = AccessStatus.active;
      } else if (trialDate != null &&
          trialDate.isAfter(now)) {
        status = AccessStatus.trial;
      } else {
        status = AccessStatus.expired;
      }

      if (!mounted) return;

      setState(() {
        accessStatus = status;
        trialEndsAt = trialDate;
        subscriptionEndsAt = subscriptionDate;
        loading = false;
        hasError = false;
      });
    } catch (error) {
      debugPrint('SUBSCRIPTION ERROR: $error');

      if (!mounted) return;

      setState(() {
        loading = false;
        hasError = true;
        errorMessage = error.toString();
      });
    } finally {
      refreshing = false;
    }
  }

  void updateCountdown() {
    if (!mounted || loading || hasError) return;

    if (accessStatus == AccessStatus.trial &&
        trialEndsAt != null &&
        !trialEndsAt!.isAfter(DateTime.now().toUtc())) {
      refreshStatus();
    } else {
      setState(() {});
    }
  }

  String formatDuration(Duration duration) {
    if (duration.isNegative) {
      return '00:00:00';
    }

    final hours =
    duration.inHours.toString().padLeft(2, '0');

    final minutes =
    (duration.inMinutes % 60)
        .toString()
        .padLeft(2, '0');

    final seconds =
    (duration.inSeconds % 60)
        .toString()
        .padLeft(2, '0');

    return '$hours:$minutes:$seconds';
  }

  String get remainingTime {
    if (trialEndsAt == null) return '--:--:--';

    return formatDuration(
      trialEndsAt!.difference(DateTime.now().toUtc()),
    );
  }

  String formatDate(DateTime date) {
    final local = date.toLocal();

    return '${local.day.toString().padLeft(2, '0')}/'
        '${local.month.toString().padLeft(2, '0')}/'
        '${local.year}';
  }

  // RECOVER PREVIOUS PAYMENT WITHOUT MAKING A NEW PAYMENT.
  Future<void> recoverPayment() async {
    if (recoveryLoading || checkoutLoading) return;

    setState(() {
      recoveryLoading = true;
    });

    try {
      final recovered =
      await CheckoutService.recoverExistingPayment();

      if (!mounted) return;

      if (recovered) {
        await refreshStatus();

        if (!mounted) return;

        if (accessStatus == AccessStatus.active) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Your previous payment was recovered! '
                    'Your KENT STREAM subscription is active.',
              ),
              backgroundColor: green,
              duration: Duration(seconds: 6),
            ),
          );
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Payment was recovered. Refresh your subscription status.',
              ),
              backgroundColor: surface,
            ),
          );
        }
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'No successful payment was found. '
                  'No new payment has been made.',
            ),
            backgroundColor: surface,
            duration: Duration(seconds: 5),
          ),
        );
      }
    } catch (error) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            error.toString().replaceFirst('Exception: ', ''),
          ),
          backgroundColor: red,
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          recoveryLoading = false;
        });
      }
    }
  }

  Future<void> startPayment() async {
    if (checkoutLoading || recoveryLoading) return;

    setState(() {
      checkoutLoading = true;
    });

    try {
      await CheckoutService.startCheckout(context);

      if (!mounted) return;

      await refreshStatus();

      if (!mounted) return;

      if (accessStatus == AccessStatus.active) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Payment verified! Your KENT STREAM subscription is active.',
            ),
            backgroundColor: green,
            duration: Duration(seconds: 5),
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Payment was verified. Refresh your subscription shortly.',
            ),
            backgroundColor: surface,
          ),
        );
      }
    } catch (error) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            error.toString().replaceFirst('Exception: ', ''),
          ),
          backgroundColor: red,
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          checkoutLoading = false;
        });
      }
    }
  }

  Future<void> signOut() async {
    try {
      await Supabase.instance.client.auth.signOut();

      if (!mounted) return;

      Navigator.of(context).popUntil(
            (route) => route.isFirst,
      );
    } catch (error) {
      debugPrint('SIGN OUT ERROR: $error');

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Unable to sign out. Try again.'),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: black,
      appBar: AppBar(
        backgroundColor: black,
        elevation: 0,
        title: const Text(
          'KENT STREAM',
          style: TextStyle(
            fontSize: 19,
            fontWeight: FontWeight.w900,
            letterSpacing: 2,
          ),
        ),
        actions: [
          IconButton(
            onPressed: signOut,
            icon: const Icon(Icons.logout),
            tooltip: 'Sign out',
          ),
        ],
      ),
      body: SafeArea(
        child: loading
            ? const Center(
          child: CircularProgressIndicator(color: red),
        )
            : hasError
            ? errorView()
            : subscriptionView(),
      ),
      bottomNavigationBar: !loading && !hasError
          ? floatingSubscriptionPanel()
          : null,
    );
  }

  Widget errorView() {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(25),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.error_outline,
              color: red,
              size: 58,
            ),
            const SizedBox(height: 20),
            const Text(
              'Unable to load your subscription.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 19,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              errorMessage,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.white54,
                fontSize: 12,
              ),
            ),
            const SizedBox(height: 25),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton(
                onPressed: refreshStatus,
                style: ElevatedButton.styleFrom(
                  backgroundColor: red,
                  foregroundColor: Colors.white,
                ),
                child: const Text('TRY AGAIN'),
              ),
            ),
            TextButton(
              onPressed: signOut,
              child: const Text(
                'SIGN OUT',
                style: TextStyle(color: Colors.white70),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget subscriptionView() {
    final isTrial = accessStatus == AccessStatus.trial;
    final isActive = accessStatus == AccessStatus.active;

    return RefreshIndicator(
      onRefresh: refreshStatus,
      color: red,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(24, 30, 24, 30),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            const SizedBox(height: 25),
            Container(
              height: 100,
              width: 100,
              decoration: BoxDecoration(
                color: red,
                borderRadius: BorderRadius.circular(27),
                boxShadow: [
                  BoxShadow(
                    color: red.withOpacity(0.3),
                    blurRadius: 30,
                  ),
                ],
              ),
              child: const Center(
                child: Text(
                  'K',
                  style: TextStyle(
                    fontSize: 72,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 30),
            Text(
              isTrial
                  ? 'Welcome to KENT STREAM'
                  : isActive
                  ? 'Your subscription is active.'
                  : 'Your free trial has ended.',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 14),
            Text(
              isTrial
                  ? 'Enjoy movies, shows and entertainment during your free trial.'
                  : isActive
                  ? 'You have full access to KENT STREAM. Enjoy your entertainment.'
                  : 'Subscribe now to continue watching your favourite movies and shows.',
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.white60,
                fontSize: 14,
                height: 1.7,
              ),
            ),
            const SizedBox(height: 35),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(22),
              decoration: BoxDecoration(
                color: surface,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: Colors.white12),
              ),
              child: Column(
                children: [
                  const Text(
                    'KENT STREAM MEMBERSHIP',
                    style: TextStyle(
                      color: Colors.white54,
                      fontSize: 11,
                      letterSpacing: 2,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 20),
                  if (isTrial) ...[
                    const Icon(
                      Icons.play_circle_fill,
                      color: green,
                      size: 48,
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'FREE TRIAL',
                      style: TextStyle(
                        color: green,
                        fontSize: 23,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'You currently have free access.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.white54),
                    ),
                  ] else if (isActive) ...[
                    const Icon(
                      Icons.verified,
                      color: green,
                      size: 48,
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'ACTIVE MEMBERSHIP',
                      style: TextStyle(
                        color: green,
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    if (subscriptionEndsAt != null) ...[
                      const SizedBox(height: 12),
                      Text(
                        'Expires: ${formatDate(subscriptionEndsAt!)}',
                        style: const TextStyle(
                          color: Colors.white60,
                        ),
                      ),
                    ],
                  ] else ...[
                    const Icon(
                      Icons.lock_outline,
                      color: red,
                      size: 48,
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'MEMBERSHIP EXPIRED',
                      style: TextStyle(
                        color: red,
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Choose a subscription to continue watching.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.white54),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 25),
            const Text(
              'ENTERTAINMENT WITHOUT LIMITS',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white30,
                fontSize: 10,
                letterSpacing: 2,
              ),
            ),
            const SizedBox(height: 20),
            recoveryButton(),
            const SizedBox(height: 8),
            TextButton(
              onPressed: refreshStatus,

              child: const Text(
                'REFRESH SUBSCRIPTION',
                style: TextStyle(color: Colors.white70),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget recoveryButton() {
    return SizedBox(
      width: double.infinity,
      height: 48,
      child: OutlinedButton(
        onPressed:
        recoveryLoading || checkoutLoading ? null : recoverPayment,
        style: OutlinedButton.styleFrom(
          foregroundColor: green,
          side: const BorderSide(color: green),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        child: recoveryLoading
            ? const SizedBox(
          height: 22,
          width: 22,
          child: CircularProgressIndicator(
            color: green,
            strokeWidth: 2,
          ),
        )
            : const Text(
          'RECOVER PREVIOUS PAYMENT',
          style: TextStyle(
            fontWeight: FontWeight.w900,
            letterSpacing: 0.5,
          ),
        ),
      ),
    );
  }

  Widget floatingSubscriptionPanel() {
    final isTrial = accessStatus == AccessStatus.trial;
    final isActive = accessStatus == AccessStatus.active;

    return Container(
      padding: const EdgeInsets.fromLTRB(18, 14, 18, 12),
      decoration: BoxDecoration(
        color: const Color(0xFF111111),
        border: const Border(
          top: BorderSide(color: Colors.white12),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.5),
            blurRadius: 20,
            offset: const Offset(0, -5),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (isTrial) ...[
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.timer_outlined,
                    color: green,
                    size: 19,
                  ),
                  const SizedBox(width: 8),
                  const Text(
                    'FREE TRIAL ENDS IN',
                    style: TextStyle(
                      color: Colors.white70,
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 1,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 5),
              Text(
                remainingTime,
                style: const TextStyle(
                  color: green,
                  fontSize: 30,
                  fontWeight: FontWeight.w900,
                  fontFeatures: [
                    FontFeature.tabularFigures(),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              paymentButton(),
              const SizedBox(height: 5),
              const Text(
                'Subscribe anytime to continue enjoying KENT STREAM.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.white38,
                  fontSize: 10,
                ),
              ),
            ] else if (!isActive) ...[
              const Text(
                'YOUR FREE TRIAL HAS ENDED',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w900,
                  fontSize: 14,
                  letterSpacing: 1,
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'Subscribe to continue watching on KENT STREAM.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.white60,
                  fontSize: 12,
                ),
              ),
              const SizedBox(height: 13),
              paymentButton(),
            ] else ...[
              const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.verified,
                    color: green,
                    size: 22,
                  ),
                  SizedBox(width: 8),
                  Text(
                    'YOUR SUBSCRIPTION IS ACTIVE',
                    style: TextStyle(
                      color: green,
                      fontSize: 13,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ),
              if (subscriptionEndsAt != null) ...[
                const SizedBox(height: 6),
                Text(
                  'Membership expires ${formatDate(subscriptionEndsAt!)}',
                  style: const TextStyle(
                    color: Colors.white54,
                    fontSize: 11,
                  ),
                ),
              ],
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  onPressed: () {
                    Navigator.pop(context);
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: red,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: const Text(
                    'BACK TO KENT STREAM',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      letterSpacing: 1,
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget paymentButton() {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: ElevatedButton(
        onPressed: checkoutLoading || recoveryLoading
            ? null
            : startPayment,
        style: ElevatedButton.styleFrom(
          backgroundColor: red,
          disabledBackgroundColor: red.withOpacity(0.5),
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          elevation: 5,
        ),
        child: checkoutLoading
            ? const SizedBox(
          height: 23,
          width: 23,
          child: CircularProgressIndicator(
            color: Colors.white,
            strokeWidth: 2,
          ),
        )
            : const Text(
          'SUBSCRIBE NOW  •  ₦1,200 / MONTH',
          style: TextStyle(
            fontWeight: FontWeight.w900,
            fontSize: 13,
            letterSpacing: 0.5,
          ),
        ),
      ),
    );
  }
}
