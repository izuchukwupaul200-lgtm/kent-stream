
import 'dart:html' as html;
import 'dart:ui_web' as ui_web;

import 'package:flutter/material.dart';

class ProviderWebView extends StatelessWidget {
  final String url;

  const ProviderWebView({
    super.key,
    required this.url,
  });

  static final Set<String> registeredViews = {};

  String get viewType => 'kent-provider-${url.hashCode}';

  @override
  Widget build(BuildContext context) {
    if (!registeredViews.contains(viewType)) {
      ui_web.platformViewRegistry.registerViewFactory(
        viewType,
            (int viewId) {
          final iframe = html.IFrameElement()
            ..src = url
            ..style
                .setProperty('border', 'none')
            ..style
                .setProperty('width', '100%')
            ..style
                .setProperty('height', '100%')
            ..allow =
                'autoplay; fullscreen; encrypted-media; picture-in-picture'
            ..allowFullscreen = true;

          return iframe;
        },
      );

      registeredViews.add(viewType);
    }

    return HtmlElementView(
      viewType: viewType,
    );
  }
}
