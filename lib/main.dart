import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'subscription_service.dart';
import 'subscription_screen.dart';

import 'provider_web_view_stub.dart'
if (dart.library.html) 'provider_web_view_web.dart';

const Color black = Color(0xFF080808);
const Color red = Color(0xFFE50920);
const Color surface = Color(0xFF151515);

const String providerUrl = 'https://net77.cc/series';

const String supabaseUrl =
    'https://iitwmvnzjhhekxfwjypx.supabase.co';

const String supabasePublishableKey =
    'sb_publishable_0i41IsZ1bZybqkTJg3ocpw__INFj9AY';

final supabase = Supabase.instance.client;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Supabase.initialize(
    url: supabaseUrl,
    publishableKey: supabasePublishableKey,
  );

  if (!kIsWeb) {
    await SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
    ]);

    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(
        statusBarColor: black,
        systemNavigationBarColor: black,
        statusBarIconBrightness: Brightness.light,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
    );
  }

  runApp(const KentStreamApp());
}

class KentStreamApp extends StatelessWidget {
  const KentStreamApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'KENT STREAM',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: black,
        primaryColor: red,
        fontFamily: 'Arial',
        colorScheme: const ColorScheme.dark(
          primary: red,
          surface: surface,
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: surface,
          hintStyle: const TextStyle(color: Colors.white38),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 18,
            vertical: 19,
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.all(Radius.circular(12)),
            borderSide: BorderSide.none,
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.all(Radius.circular(12)),
            borderSide: BorderSide(color: Colors.white12),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.all(Radius.circular(12)),
            borderSide: BorderSide(color: red, width: 1.4),
          ),
        ),
      ),
      home: const SplashScreen(),
    );
  }
}

// ============================================================
// SPLASH SCREEN
// ============================================================

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    openNextScreen();
  }

  Future<void> openNextScreen() async {
    await Future.delayed(const Duration(seconds: 3));

    if (!mounted) return;

    final session = supabase.auth.currentSession;

    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) => session != null
            ? const AccessGateScreen()
            : const WelcomeScreen(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: black,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 78,
              height: 78,
              decoration: BoxDecoration(
                color: red,
                borderRadius: BorderRadius.circular(21),
                boxShadow: [
                  BoxShadow(
                    color: red.withOpacity(0.35),
                    blurRadius: 35,
                  ),
                ],
              ),
              child: const Center(
                child: Text(
                  'K',
                  style: TextStyle(
                    fontSize: 55,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 19),
            const Text(
              'KENT STREAM',
              style: TextStyle(
                fontSize: 25,
                letterSpacing: 4,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 9),
            const Text(
              'ENTERTAINMENT WITHOUT LIMITS',
              style: TextStyle(
                color: Colors.white38,
                fontSize: 9,
                letterSpacing: 2,
              ),
            ),
            const SizedBox(height: 65),
            SizedBox(
              width: 175,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(20),
                child: const LinearProgressIndicator(
                  minHeight: 3,
                  backgroundColor: Color(0xFF303030),
                  valueColor: AlwaysStoppedAnimation<Color>(red),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ============================================================
// WELCOME SCREEN
// ============================================================

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          Positioned.fill(
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Color(0xFF252020),
                    Color(0xFF111111),
                    black,
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            top: 100,
            right: -100,
            child: Container(
              width: 280,
              height: 280,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: red.withOpacity(0.08),
              ),
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 28),
              child: Column(
                children: [
                  const Spacer(),
                  Container(
                    height: 92,
                    width: 92,
                    decoration: BoxDecoration(
                      color: red,
                      borderRadius: BorderRadius.circular(24),
                      boxShadow: [
                        BoxShadow(
                          color: red.withOpacity(0.25),
                          blurRadius: 35,
                        ),
                      ],
                    ),
                    child: const Center(
                      child: Text(
                        'K',
                        style: TextStyle(
                          fontSize: 67,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 27),
                  const Text(
                    'KENT STREAM',
                    style: TextStyle(
                      fontSize: 32,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 2,
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'YOUR ENTERTAINMENT.\nYOUR WORLD.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.white70,
                      fontSize: 15,
                      height: 1.7,
                      letterSpacing: 2,
                    ),
                  ),
                  const Spacer(),
                  const Text(
                    'Welcome to a new entertainment experience.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.white54,
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(height: 26),
                  SizedBox(
                    width: double.infinity,
                    height: 57,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: red,
                        foregroundColor: Colors.white,
                        elevation: 8,
                        shadowColor: red.withOpacity(0.3),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(13),
                        ),
                      ),
                      onPressed: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => const LoginScreen(),
                          ),
                        );
                      },
                      child: const Text(
                        'GET STARTED',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 1.5,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 22),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Text(
                        'Already have an account? ',
                        style: TextStyle(color: Colors.white54),
                      ),
                      GestureDetector(
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => const LoginScreen(),
                            ),
                          );
                        },
                        child: const Text(
                          'Sign in',
                          style: TextStyle(
                            color: red,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 40),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ============================================================
// LOGIN AND SIGNUP
// ============================================================

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final emailController = TextEditingController();
  final passwordController = TextEditingController();

  bool isSignup = false;
  bool obscurePassword = true;
  bool isLoading = false;

  @override
  void dispose() {
    emailController.dispose();
    passwordController.dispose();
    super.dispose();
  }

  void showMessage(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  void openAccessGate() {
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(
        builder: (_) => const AccessGateScreen(),
      ),
          (route) => false,
    );
  }

  Future<void> continueToHome() async {
    final email = emailController.text.trim();
    final password = passwordController.text;

    if (email.isEmpty || password.isEmpty) {
      showMessage('Please enter your email and password.');
      return;
    }

    if (password.length < 6) {
      showMessage('Password must contain at least 6 characters.');
      return;
    }

    setState(() => isLoading = true);

    try {
      if (isSignup) {
        final response = await supabase.auth.signUp(
          email: email,
          password: password,
        );

        if (!mounted) return;

        if (response.session != null) {
          showMessage('Your KENT STREAM account is ready!');
          openAccessGate();
        } else {
          showMessage(
            'Registration received. Please confirm your email, then sign in.',
          );
        }
      } else {
        await supabase.auth.signInWithPassword(
          email: email,
          password: password,
        );

        if (!mounted) return;

        showMessage('Welcome back to KENT STREAM!');
        openAccessGate();
      }
    } on AuthException catch (error) {
      if (!mounted) return;
      showMessage(error.message);
    } catch (error) {
      if (!mounted) return;
      showMessage('Something went wrong. Please try again.');
      debugPrint('KENT AUTH ERROR: $error');
    } finally {
      if (mounted) {
        setState(() => isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: black,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text(
          'KENT STREAM',
          style: TextStyle(
            fontWeight: FontWeight.w900,
            letterSpacing: 2,
          ),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(25, 35, 25, 30),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(
                Icons.account_circle_outlined,
                color: red,
                size: 52,
              ),
              const SizedBox(height: 24),
              Text(
                isSignup ? 'Create account' : 'Welcome back',
                style: const TextStyle(
                  fontSize: 30,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 9),
              const Text(
                'Sign in to continue to KENT STREAM.',
                style: TextStyle(color: Colors.white54),
              ),
              const SizedBox(height: 38),
              const Text('EMAIL ADDRESS'),
              const SizedBox(height: 10),
              TextField(
                controller: emailController,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(
                  hintText: 'Enter your email',
                  prefixIcon: Icon(Icons.email_outlined),
                ),
              ),
              const SizedBox(height: 24),
              const Text('PASSWORD'),
              const SizedBox(height: 10),
              TextField(
                controller: passwordController,
                obscureText: obscurePassword,
                decoration: InputDecoration(
                  hintText: 'Enter your password',
                  prefixIcon: const Icon(Icons.lock_outline),
                  suffixIcon: IconButton(
                    icon: Icon(
                      obscurePassword
                          ? Icons.visibility_off
                          : Icons.visibility,
                    ),
                    onPressed: () {
                      setState(() {
                        obscurePassword = !obscurePassword;
                      });
                    },
                  ),
                ),
              ),
              const SizedBox(height: 32),
              SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: red,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  onPressed: isLoading ? null : continueToHome,
                  child: isLoading
                      ? const SizedBox(
                    height: 23,
                    width: 23,
                    child: CircularProgressIndicator(
                      color: Colors.white,
                      strokeWidth: 2,
                    ),
                  )
                      : Text(
                    isSignup ? 'CREATE ACCOUNT' : 'SIGN IN',
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      letterSpacing: 1,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 24),
              Center(
                child: TextButton(
                  onPressed: isLoading
                      ? null
                      : () {
                    setState(() {
                      isSignup = !isSignup;
                    });
                  },
                  child: Text(
                    isSignup
                        ? 'Already registered? Sign in'
                        : 'New to KENT STREAM? Create account',
                    style: const TextStyle(color: Colors.white70),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ============================================================
// SUBSCRIPTION ACCESS GATE
// ============================================================

class AccessGateScreen extends StatefulWidget {
  const AccessGateScreen({super.key});

  @override
  State<AccessGateScreen> createState() => _AccessGateScreenState();
}

class _AccessGateScreenState extends State<AccessGateScreen> {
  bool checking = true;
  bool failed = false;

  @override
  void initState() {
    super.initState();
    checkSubscription();
  }

  Future<void> checkSubscription() async {
    try {
      final access = await SubscriptionService.checkAccess();

      if (!mounted) return;

      final hasAccess =
          access == AccessStatus.trial ||
              access == AccessStatus.active;

      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => hasAccess
              ? const ProviderScreen()
              : const SubscriptionScreen(),
        ),
      );
    } catch (error) {
      debugPrint('SUBSCRIPTION CHECK ERROR: $error');

      if (!mounted) return;

      setState(() {
        checking = false;
        failed = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: black,
      body: Center(
        child: checking
            ? const Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(color: red),
            SizedBox(height: 18),
            Text(
              'Checking your subscription...',
              style: TextStyle(color: Colors.white70),
            ),
          ],
        )
            : Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.wifi_off,
              color: red,
              size: 45,
            ),
            const SizedBox(height: 16),
            const Text(
              'Unable to check your access.',
              style: TextStyle(color: Colors.white),
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: checkSubscription,
              style: ElevatedButton.styleFrom(
                backgroundColor: red,
              ),
              child: const Text('TRY AGAIN'),
            ),
          ],
        ),
      ),
    );
  }
}

// ============================================================
// FULLSCREEN VIDEO PLAYER
// ============================================================

class VideoFullscreenScreen extends StatefulWidget {
  final Widget video;
  final VoidCallback onVideoHidden;
  final WebViewController controller;
  final Future<void> Function() onNextEpisode;

  const VideoFullscreenScreen({
    super.key,
    required this.video,
    required this.onVideoHidden,
    required this.controller,
    required this.onNextEpisode,
  });

  @override
  State<VideoFullscreenScreen> createState() =>
      _VideoFullscreenScreenState();
}

class _VideoFullscreenScreenState
    extends State<VideoFullscreenScreen> {
  bool controlsVisible = true;
  bool isPlaying = true;
  bool isMuted = false;

  Timer? hideTimer;

  @override
  void initState() {
    super.initState();
    _scheduleHide();
  }

  void _scheduleHide() {
    hideTimer?.cancel();

    hideTimer = Timer(const Duration(seconds: 5), () {
      if (mounted) {
        setState(() => controlsVisible = false);
      }
    });
  }

  void _showControls() {
    if (!mounted) return;

    setState(() => controlsVisible = true);
    _scheduleHide();
  }

  Future<void> _runPlayerCommand(String javascript) async {
    try {
      await widget.controller.runJavaScript(javascript);
    } catch (error) {
      debugPrint('KENT PLAYER COMMAND ERROR: $error');
    }
  }

  Future<void> _togglePlayback() async {
    await _runPlayerCommand(r'''
      (() => {
        const videos = Array.from(document.querySelectorAll('video'));

        if (videos.length > 0) {
          videos.forEach(v => {
            if (v.paused) {
              v.play().catch(() => {});
            } else {
              v.pause();
            }
          });
        } else {
          const buttons = Array.from(
            document.querySelectorAll('button,[role="button"]')
          );

          const playButton = buttons.find(b =>
            /play|pause/i.test(
              (b.getAttribute('aria-label') || '') + ' ' +
              (b.getAttribute('title') || '')
            )
          );

          if (playButton) playButton.click();
        }
      })();
    ''');

    if (mounted) {
      setState(() => isPlaying = !isPlaying);
    }

    _scheduleHide();
  }

  Future<void> _rewind() async {
    await _runPlayerCommand(r'''
      (() => {
        document.querySelectorAll('video').forEach(v => {
          v.currentTime = Math.max(0, v.currentTime - 10);
        });
      })();
    ''');

    _showControls();
  }

  Future<void> _forward() async {
    await _runPlayerCommand(r'''
      (() => {
        document.querySelectorAll('video').forEach(v => {
          if (Number.isFinite(v.duration)) {
            v.currentTime = Math.min(
              v.duration,
              v.currentTime + 10
            );
          }
        });
      })();
    ''');

    _showControls();
  }

  Future<void> _toggleMute() async {
    final nextMuted = !isMuted;

    await _runPlayerCommand('''
      (() => {
        document.querySelectorAll('video').forEach(v => {
          v.muted = $nextMuted;
        });
      })();
    ''');

    if (mounted) {
      setState(() => isMuted = nextMuted);
    }

    _showControls();
  }

  Future<void> _openSubtitles() async {
    List<String> tracks = [];

    try {
      final result =
      await widget.controller.runJavaScriptReturningResult('''
        JSON.stringify(
          Array.from(document.querySelectorAll('video')).flatMap(v =>
            Array.from(v.textTracks).map((t, i) => ({
              index: i,
              label: t.label || t.language || ('Subtitle ' + (i + 1))
            }))
          )
        )
      ''');

      dynamic decoded = result;

      if (decoded is String) {
        decoded = jsonDecode(decoded);
      } else if (decoded is! List) {
        decoded = jsonDecode(decoded.toString());
      }

      if (decoded is List) {
        tracks = decoded
            .map((item) => (item['label'] ?? 'Subtitle').toString())
            .toList();
      }
    } catch (error) {
      debugPrint('KENT SUBTITLE ERROR: $error');
    }

    if (!mounted) return;

    if (tracks.isEmpty) {
      await _runPlayerCommand(r'''
        (() => {
          const buttons = Array.from(
            document.querySelectorAll('button,[role="button"],a')
          );

          const cc = buttons.find(b =>
            /subtitle|captions|\bcc\b/i.test(
              (b.innerText || '') + ' ' +
              (b.getAttribute('aria-label') || '') + ' ' +
              (b.getAttribute('title') || '')
            )
          );

          if (cc) cc.click();
        })();
      ''');

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Check the provider subtitle menu if subtitles are available.',
          ),
        ),
      );

      _showControls();
      return;
    }

    final selected = await showModalBottomSheet<int>(
      context: context,
      backgroundColor: surface,
      builder: (sheetContext) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 18, 20, 10),
              child: Text(
                'SUBTITLES',
                style: TextStyle(
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1.2,
                ),
              ),
            ),
            ListTile(
              leading: const Icon(Icons.subtitles_off_outlined),
              title: const Text('Off'),
              onTap: () => Navigator.pop(sheetContext, -1),
            ),
            for (var i = 0; i < tracks.length; i++)
              ListTile(
                leading: const Icon(Icons.closed_caption_outlined),
                title: Text(tracks[i]),
                onTap: () => Navigator.pop(sheetContext, i),
              ),
          ],
        ),
      ),
    );

    if (selected != null) {
      await _runPlayerCommand('''
        (() => {
          document.querySelectorAll('video').forEach(v => {
            Array.from(v.textTracks).forEach((t, i) => {
              t.mode = $selected === -1
                ? 'disabled'
                : (i === $selected ? 'showing' : 'disabled');
            });
          });
        })();
      ''');
    }

    _showControls();
  }

  Future<void> _next() async {
    await widget.onNextEpisode();

    if (!mounted) return;

    setState(() => isPlaying = true);
    _showControls();
  }

  void _goBack() {
    hideTimer?.cancel();
    widget.onVideoHidden();
  }

  Widget playerButton({
    required IconData icon,
    required String tooltip,
    required VoidCallback onPressed,
    double size = 29,
  }) {
    return IconButton(
      onPressed: onPressed,
      tooltip: tooltip,
      icon: Icon(
        icon,
        color: Colors.white,
        size: size,
      ),
      style: IconButton.styleFrom(
        backgroundColor: Colors.black.withOpacity(0.55),
        minimumSize: const Size(52, 52),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) _goBack();
      },
      child: Scaffold(
        backgroundColor: Colors.black,
        body: GestureDetector(
          behavior: HitTestBehavior.translucent,
          onTap: () {
            if (controlsVisible) {
              setState(() => controlsVisible = false);
              hideTimer?.cancel();
            } else {
              _showControls();
            }
          },
          child: Stack(
            fit: StackFit.expand,
            children: [
              Center(child: widget.video),

              if (controlsVisible) ...[
                Positioned.fill(
                  child: IgnorePointer(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            Colors.black.withOpacity(0.65),
                            Colors.transparent,
                            Colors.black.withOpacity(0.75),
                          ],
                          stops: const [0, 0.45, 1],
                        ),
                      ),
                    ),
                  ),
                ),

                // TOP BAR

                Positioned(
                  top: 12,
                  left: 12,
                  right: 12,
                  child: SafeArea(
                    child: Row(
                      children: [
                        playerButton(
                          icon: Icons.arrow_back,
                          tooltip: 'Back',
                          onPressed: _goBack,
                        ),
                        const SizedBox(width: 15),
                        const Text(
                          'KENT STREAM',
                          style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 2,
                            color: Colors.white,
                          ),
                        ),
                        const Spacer(),
                        playerButton(
                          icon: isMuted
                              ? Icons.volume_off
                              : Icons.volume_up,
                          tooltip: isMuted ? 'Unmute' : 'Mute',
                          onPressed: _toggleMute,
                        ),
                      ],
                    ),
                  ),
                ),

                // CENTER PLAYBACK BUTTONS

                Positioned.fill(
                  child: Center(
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        playerButton(
                          icon: Icons.replay_10,
                          tooltip: 'Rewind 10 seconds',
                          onPressed: _rewind,
                          size: 36,
                        ),
                        const SizedBox(width: 35),
                        IconButton(
                          onPressed: _togglePlayback,
                          tooltip: isPlaying ? 'Pause' : 'Play',
                          icon: Icon(
                            isPlaying
                                ? Icons.pause_circle_filled
                                : Icons.play_circle_fill,
                            color: Colors.white,
                            size: 75,
                          ),
                        ),
                        const SizedBox(width: 35),
                        playerButton(
                          icon: Icons.forward_10,
                          tooltip: 'Forward 10 seconds',
                          onPressed: _forward,
                          size: 36,
                        ),
                      ],
                    ),
                  ),
                ),

                // BOTTOM BAR

                Positioned(
                  left: 15,
                  right: 15,
                  bottom: 18,
                  child: SafeArea(
                    child: Row(
                      children: [
                        playerButton(
                          icon: Icons.closed_caption_outlined,
                          tooltip: 'Subtitles',
                          onPressed: _openSubtitles,
                        ),
                        const Spacer(),
                        playerButton(
                          icon: Icons.skip_next,
                          tooltip: 'Next episode',
                          onPressed: _next,
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    hideTimer?.cancel();
    super.dispose();
  }
}

// ============================================================
// MY KENT ACCOUNT PAGE
// ============================================================

class MyKentScreen extends StatefulWidget {
  const MyKentScreen({super.key});

  @override
  State<MyKentScreen> createState() => _MyKentScreenState();
}

class _MyKentScreenState extends State<MyKentScreen> {
  bool loading = true;
  Map<String, dynamic>? subscription;
  String? errorMessage;

  @override
  void initState() {
    super.initState();
    loadAccount();
  }

  Future<void> loadAccount() async {
    try {
      final user = supabase.auth.currentUser;

      if (user == null) {
        errorMessage = 'Please sign in again.';
      } else {
        subscription = await supabase
            .from('subscriptions')
            .select(
          'status, subscription_expires_at, next_billing_date',
        )
            .eq('user_id', user.id)
            .maybeSingle();
      }
    } catch (error) {
      debugPrint('MY KENT ERROR: $error');
      errorMessage = 'Unable to load your subscription details.';
    }

    if (mounted) {
      setState(() => loading = false);
    }
  }

  String formatDate(dynamic value) {
    if (value == null) return 'Not available';

    try {
      final date = DateTime.parse(value.toString()).toLocal();

      return '${date.day.toString().padLeft(2, '0')}/'
          '${date.month.toString().padLeft(2, '0')}/'
          '${date.year}';
    } catch (_) {
      return 'Not available';
    }
  }

  Future<void> signOut() async {
    await supabase.auth.signOut();

    if (!mounted) return;

    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(
        builder: (_) => const WelcomeScreen(),
      ),
          (route) => false,
    );
  }

  Widget detail(String label, String value, IconData icon) {
    return Container(
      margin: const EdgeInsets.only(bottom: 13),
      padding: const EdgeInsets.all(17),
      decoration: BoxDecoration(
        color: surface,
        borderRadius: BorderRadius.circular(13),
        border: Border.all(color: Colors.white10),
      ),
      child: Row(
        children: [
          Icon(icon, color: red, size: 23),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    color: Colors.white54,
                    fontSize: 11,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  value,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = supabase.auth.currentUser;
    final status =
        subscription?['status']?.toString() ?? 'Unknown';

    return Scaffold(
      backgroundColor: black,
      appBar: AppBar(
        backgroundColor: black,
        title: const Text(
          'MY KENT',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: loading
          ? const Center(
        child: CircularProgressIndicator(color: red),
      )
          : SingleChildScrollView(
        padding: const EdgeInsets.all(22),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Center(
              child: CircleAvatar(
                radius: 42,
                backgroundColor: red,
                child: Icon(
                  Icons.person,
                  color: Colors.white,
                  size: 45,
                ),
              ),
            ),
            const SizedBox(height: 18),
            const Center(
              child: Text(
                'YOUR KENT ACCOUNT',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
            const SizedBox(height: 8),
            Center(
              child: Text(
                user?.email ?? 'No email available',
                style: const TextStyle(color: Colors.white54),
              ),
            ),
            const SizedBox(height: 30),
            if (errorMessage != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 15),
                child: Text(
                  errorMessage!,
                  style: const TextStyle(color: red),
                ),
              ),
            detail(
              'ACCOUNT EMAIL',
              user?.email ?? 'Not available',
              Icons.email_outlined,
            ),
            detail(
              'SUBSCRIPTION STATUS',
              status.toUpperCase(),
              Icons.verified_user_outlined,
            ),
            detail(
              'SUBSCRIPTION EXPIRY',
              formatDate(
                subscription?['subscription_expires_at'],
              ),
              Icons.calendar_today,
            ),
            detail(
              'NEXT BILLING DATE',
              formatDate(subscription?['next_billing_date']),
              Icons.event_repeat,
            ),
            const SizedBox(height: 15),
            SizedBox(
              width: double.infinity,
              height: 54,
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: red,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => const SubscriptionScreen(),
                    ),
                  );
                },
                icon: const Icon(Icons.workspace_premium),
                label: const Text(
                  'SUBSCRIBE / RENEW',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.white,
                  side: const BorderSide(color: Colors.white24),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                onPressed: signOut,
                icon: const Icon(Icons.logout),
                label: const Text('SIGN OUT'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ============================================================
// PROVIDER WEBVIEW
// ============================================================

class ProviderScreen extends StatefulWidget {
  const ProviderScreen({super.key});

  @override
  State<ProviderScreen> createState() => _ProviderScreenState();
}

class _ProviderScreenState extends State<ProviderScreen> {
  late final WebViewController controller;

  bool isLoading = true;
  bool hasError = false;
  bool isFullscreen = false;
  bool fullscreenRouteOpen = false;
  bool isSeriesHome = true;
  bool isInlineVideoPlaying = false;

  int progress = 0;

  @override
  void initState() {
    super.initState();

    if (kIsWeb) {
      isLoading = false;
    } else {
      setupWebView();
    }
  }

  Future<void> setupWebView() async {
    controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(black)
      ..addJavaScriptChannel(
        'KentPlayerState',
        onMessageReceived: (message) {
          if (!mounted) return;

          final playing = message.message == 'playing';

          if (isInlineVideoPlaying != playing) {
            setState(() => isInlineVideoPlaying = playing);
          }
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (url) {
            if (!mounted) return;

            final uri = Uri.tryParse(url);
            final path = (uri?.path ?? '')
                .toLowerCase()
                .replaceAll(RegExp(r'/+$'), '');

            final seriesPath = path == '/series' ||
                path.startsWith('/series/') ||
                path.contains('/series/');

            setState(() {
              isLoading = true;
              hasError = false;
              progress = 0;
              isSeriesHome = seriesPath;
              isInlineVideoPlaying = false;
            });
          },
          onProgress: (value) {
            if (!mounted) return;
            setState(() => progress = value);
          },
          onPageFinished: (url) {
            if (!mounted) return;

            setState(() {
              isLoading = false;
              progress = 100;
            });

            unawaited(_installPlaybackWatcher());
          },
          onWebResourceError: (error) {
            debugPrint('KENT STREAM WEBVIEW ERROR');
            debugPrint('Code: ${error.errorCode}');
            debugPrint('Description: ${error.description}');
            debugPrint('URL: ${error.url}');

            if (error.isForMainFrame != true || !mounted) {
              return;
            }

            setState(() {
              hasError = true;
              isLoading = false;
            });
          },
        ),
      );

    if (controller.platform is AndroidWebViewController) {
      final androidController =
      controller.platform as AndroidWebViewController;

      await androidController.setMediaPlaybackRequiresUserGesture(
        false,
      );

      await androidController.setCustomWidgetCallbacks(
        onShowCustomWidget: (
            Widget video,
            VoidCallback onHidden,
            ) {
          if (!mounted || fullscreenRouteOpen) {
            onHidden();
            return;
          }

          isFullscreen = true;
          fullscreenRouteOpen = true;

          unawaited(
            SystemChrome.setPreferredOrientations([
              DeviceOrientation.landscapeLeft,
              DeviceOrientation.landscapeRight,
            ]),
          );

          unawaited(
            SystemChrome.setEnabledSystemUIMode(
              SystemUiMode.immersiveSticky,
            ),
          );

          Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) => VideoFullscreenScreen(
                video: video,
                onVideoHidden: onHidden,
                controller: controller,
                onNextEpisode: _nextEpisode,
              ),
              fullscreenDialog: true,
            ),
          ).then((_) {
            isFullscreen = false;
            fullscreenRouteOpen = false;
            unawaited(restorePortraitMode());
          });
        },
        onHideCustomWidget: () {
          isFullscreen = false;
          fullscreenRouteOpen = false;

          if (mounted && Navigator.of(context).canPop()) {
            Navigator.of(context).pop();
          }

          unawaited(restorePortraitMode());
        },
      );
    }

    await controller.loadRequest(Uri.parse(providerUrl));
  }

  Future<void> _installPlaybackWatcher() async {
    const script = r"""
      (() => {
        if (window.__kentPlaybackWatcherInstalled) return;
        window.__kentPlaybackWatcherInstalled = true;

        const report = () => {
          const videos = Array.from(
            document.querySelectorAll('video')
          );

          const playingVideo = videos.some(
            v => !v.paused && !v.ended
          );

          if (window.KentPlayerState) {
            KentPlayerState.postMessage(
              playingVideo ? 'playing' : 'stopped'
            );
          }
        };

        const bindVideos = () => {
          document.querySelectorAll('video').forEach(v => {
            if (v.__kentBound) return;

            v.__kentBound = true;

            ['play','playing','pause','ended','emptied'].forEach(e => {
              v.addEventListener(e, report);
            });
          });

          report();
        };

        bindVideos();

        new MutationObserver(bindVideos).observe(
          document.documentElement,
          {childList:true, subtree:true}
        );

        setInterval(bindVideos, 1200);
      })();
    """;

    try {
      await controller.runJavaScript(script);
    } catch (error) {
      debugPrint('KENT PLAYBACK WATCHER ERROR: $error');
    }
  }

  Future<void> _nextEpisode() async {
    try {
      await controller.runJavaScript(r"""
        (() => {
          const elements = Array.from(
            document.querySelectorAll('a,button,[role="button"]')
          );

          const next = elements.find(el => {
            const text = (
              (el.innerText || '') + ' ' +
              (el.getAttribute('aria-label') || '') + ' ' +
              (el.getAttribute('title') || '')
            ).trim();

            return /next\s*(episode|video|movie)?/i.test(text);
          });

          if (next) {
            next.click();
          } else {
            const videos = Array.from(
              document.querySelectorAll('video')
            );

            videos.forEach(v => {
              if (Number.isFinite(v.duration)) {
                v.currentTime = v.duration;
              }
            });
          }
        })();
      """);
    } catch (error) {
      debugPrint('KENT NEXT EPISODE ERROR: $error');
    }
  }

  Future<void> restorePortraitMode() async {
    if (kIsWeb) return;

    await SystemChrome.setEnabledSystemUIMode(
      SystemUiMode.edgeToEdge,
    );

    await SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
    ]);
  }

  Future<void> signOut() async {
    await supabase.auth.signOut();

    if (!mounted) return;

    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(
        builder: (_) => const WelcomeScreen(),
      ),
          (route) => false,
    );
  }

  Future<void> handleBack() async {
    if (isFullscreen) return;

    if (kIsWeb) {
      if (mounted) {
        Navigator.maybePop(context);
      }
      return;
    }

    if (await controller.canGoBack()) {
      await controller.goBack();
    } else {
      await SystemNavigator.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop || isFullscreen) return;
        await handleBack();
      },
      child: Scaffold(
        backgroundColor: black,
        body: SafeArea(
          child: Stack(
            children: [
              Positioned.fill(
                child: kIsWeb
                    ? ProviderWebView(url: providerUrl)
                    : WebViewWidget(controller: controller),
              ),

              // SMALL MY KENT BUTTON — BOTTOM LEFT
              // Trial countdown banner intentionally removed.

              if (!kIsWeb &&
                  isSeriesHome &&
                  !isInlineVideoPlaying &&
                  !isFullscreen &&
                  !isLoading &&
                  !hasError)
                Positioned(
                  left: 15,
                  bottom: 15,
                  child: SafeArea(
                    child: SizedBox(
                      height: 38,
                      child: ElevatedButton.icon(
                        onPressed: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => const MyKentScreen(),
                            ),
                          );
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: red,
                          foregroundColor: Colors.white,
                          elevation: 5,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 13,
                            vertical: 7,
                          ),
                          minimumSize: const Size(0, 38),
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(22),
                          ),
                        ),
                        icon: const Icon(
                          Icons.person_outline,
                          size: 16,
                        ),
                        label: const Text(
                          'MY KENT',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 0.8,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),

              // LOADING SCREEN

              if (!kIsWeb && isLoading)
                Positioned.fill(
                  child: Container(
                    color: black,
                    child: Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Text(
                            'KENT STREAM',
                            style: TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 3,
                            ),
                          ),
                          const SizedBox(height: 25),
                          SizedBox(
                            width: 180,
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(20),
                              child: LinearProgressIndicator(
                                value: progress == 0
                                    ? null
                                    : progress / 100,
                                minHeight: 3,
                                backgroundColor: Colors.white12,
                                valueColor:
                                const AlwaysStoppedAnimation<Color>(
                                  red,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 12),
                          const Text(
                            'Loading entertainment...',
                            style: TextStyle(
                              fontSize: 11,
                              color: Colors.white54,
                              letterSpacing: 1,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),

              // ERROR SCREEN

              if (!kIsWeb && hasError)
                Positioned.fill(
                  child: Container(
                    color: black,
                    padding: const EdgeInsets.all(25),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(
                          Icons.wifi_off_rounded,
                          color: red,
                          size: 55,
                        ),
                        const SizedBox(height: 20),
                        const Text(
                          'Unable to load the website',
                          style: TextStyle(
                            fontSize: 19,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 12),
                        const Text(
                          'Check your internet connection or whether the website allows embedded browsing.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Colors.white54),
                        ),
                        const SizedBox(height: 25),
                        ElevatedButton(
                          onPressed: () {
                            setState(() {
                              hasError = false;
                              isLoading = true;
                            });
                            controller.reload();
                          },
                          style: ElevatedButton.styleFrom(
                            backgroundColor: red,
                          ),
                          child: const Text('TRY AGAIN'),
                        ),
                      ],
                    ),
                  ),
                ),

              // ACCOUNT MENU

              if (!kIsWeb &&
                  isSeriesHome &&
                  !isInlineVideoPlaying &&
                  !isFullscreen)
                Positioned(
                  top: 8,
                  right: 8,
                  child: PopupMenuButton<String>(
                    color: surface,
                    icon: const Icon(
                      Icons.more_vert,
                      color: Colors.white,
                    ),
                    onSelected: (value) {
                      if (value == 'logout') {
                        signOut();
                      }
                    },
                    itemBuilder: (context) => const [
                      PopupMenuItem<String>(
                        value: 'logout',
                        child: Text('Sign out'),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    if (!kIsWeb) {
      unawaited(restorePortraitMode());
    }
    super.dispose();
  }
}