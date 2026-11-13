
import 'package:flutter/material.dart';

class ProviderWebView extends StatelessWidget {
  final String url;

  const ProviderWebView({
    super.key,
    required this.url,
  });

  @override
  Widget build(BuildContext context) {
    return const ColoredBox(
      color: Colors.black,
      child: Center(
        child: Text(
          'Browser view is not available on this platform.',
          style: TextStyle(
            color: Colors.white,
          ),
        ),
      ),
    );
  }
}
