# ----------------------------------------------------------------------------
# CloudFront response headers policy
#
# Layered defenses applied to every response from the distribution:
#
# - HSTS (Strict-Transport-Security) tells browsers "this domain is HTTPS-only,
#   never accept HTTP" — protects first-time visitors on hostile networks
#   from MITM downgrade attacks before our redirect-to-https fires. Once you
#   apply this, also submit the apex to https://hstspreload.org/ so the
#   browser knows on first visit, not just after one prior HTTPS request.
#
# - X-Frame-Options: DENY prevents clickjacking via iframe embedding.
#
# - X-Content-Type-Options: nosniff stops browsers from MIME-guessing
#   uploaded assets into something exploitable.
#
# - Referrer-Policy: strict-origin-when-cross-origin keeps query strings
#   (including the customer's email in /track?ref=…&email=…) out of
#   external Referer headers.
#
# CSP is intentionally not set here — the static site loads first-party JS
# plus Google Fonts and Sanity images; defining a watertight CSP for that
# without breaking things is more work than it's worth at this scale. Add
# later if XSS surface grows (e.g. the site starts accepting user-generated
# content).
# ----------------------------------------------------------------------------

resource "aws_cloudfront_response_headers_policy" "security" {
  name = "${local.project}-security-headers"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000 # 1 year
      include_subdomains         = true
      preload                    = true
      override                   = true
    }

    frame_options {
      frame_option = "DENY"
      override     = true
    }

    content_type_options {
      override = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
  }
}
