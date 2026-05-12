# ----------------------------------------------------------------------------
# S3 bucket hosting the prerendered SvelteKit site
# ----------------------------------------------------------------------------

resource "aws_s3_bucket" "frontend" {
  bucket = "${local.project}-frontend"

  # Belt-and-braces guard against accidental teardown via `terraform destroy`
  # or a stray `terraform apply` after the resource block is removed. Bucket
  # contents (the deployed site) are deleted along with the bucket and would
  # require a re-deploy to restore. To genuinely tear down, set this to
  # `false`, apply, then run destroy.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Versioning is forward-only — existing objects aren't retroactively versioned.
# New deploys create object versions, giving us a one-step rollback path via
# S3's versioning API instead of having to re-run a prior deploy workflow.
resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Cap the cost of versioning by expiring superseded versions after 30 days.
# That's a generous rollback window for a site that deploys on every release
# tag; older versions are dead weight.
resource "aws_s3_bucket_lifecycle_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

resource "aws_s3_bucket_ownership_controls" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Only CloudFront (via OAC) can read objects from the bucket.
data "aws_iam_policy_document" "frontend_bucket_policy" {
  statement {
    sid       = "AllowCloudFrontServicePrincipalRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.frontend.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.frontend_bucket_policy.json
}

# ----------------------------------------------------------------------------
# ACM certificate (must live in us-east-1 for CloudFront)
# ----------------------------------------------------------------------------

resource "aws_acm_certificate" "frontend" {
  provider = aws.us_east_1

  domain_name               = var.domain_name
  subject_alternative_names = ["www.${var.domain_name}"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# DNS-validation records in Route 53.
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.frontend.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = var.route53_zone_id
}

resource "aws_acm_certificate_validation" "frontend" {
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.frontend.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

# ----------------------------------------------------------------------------
# CloudFront Origin Access Control + distribution
# ----------------------------------------------------------------------------

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${local.project}-frontend-oac"
  description                       = "OAC for the Meryl Green Designs frontend bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# CloudFront Function that rewrites /api/foo → /foo before forwarding to
# the API Gateway origin. This lets the Hono app keep routes mounted at
# /orders, /products, etc. while the public API surface lives under /api/*.
resource "aws_cloudfront_function" "strip_api_prefix" {
  name    = "${local.project}-strip-api-prefix"
  runtime = "cloudfront-js-2.0"
  comment = "Strip /api prefix from request URI before forwarding to API Gateway"
  publish = true

  code = <<-EOT
    function handler(event) {
      var request = event.request;
      if (request.uri === '/api' || request.uri === '/api/') {
        request.uri = '/';
      } else if (request.uri.startsWith('/api/')) {
        request.uri = request.uri.substring(4);
      }
      return request;
    }
  EOT
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Meryl Green Designs frontend"
  default_root_object = "index.html"
  price_class         = "PriceClass_100" # North America + Europe. Cheapest class that still covers ZA traffic well.

  aliases = [var.domain_name, "www.${var.domain_name}"]

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "s3-frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  origin {
    domain_name = local.api_gateway_host
    origin_id   = "api-gateway-backend"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # /api/* → Lambda origin. Strips the /api prefix via CloudFront Function
  # so the Hono app sees its normal route paths. No caching (API responses
  # are dynamic). Forwards all HTTP methods that the backend handles.
  ordered_cache_behavior {
    path_pattern               = "/api/*"
    target_origin_id           = "api-gateway-backend"
    viewer_protocol_policy     = "https-only"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled
    origin_request_policy_id   = "b689b0a8-53d0-40ab-baf2-68738e2966ac" # Managed-AllViewerExceptHostHeader
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.strip_api_prefix.arn
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-frontend"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    cache_policy_id            = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
  }

  # SvelteKit's static adapter emits a `/404.html` that is the SPA fallback
  # shell — it boots the client runtime, reads the real URL from the browser,
  # and renders the matching page. We serve it with HTTP 200 so direct
  # visits to dynamic routes (e.g. `/shop/[slug]`) are treated as valid
  # content rather than errors (which would hurt SEO and trip 4xx monitors).
  #
  # If the SPA determines that the URL really has no matching route, it
  # renders its own in-page "not found" state — still returned as 200 at the
  # HTTP layer, which is the standard SPA convention. Genuinely missing
  # assets (e.g. a deleted image) still surface as 404s from S3 directly
  # because CloudFront only overrides the HTML path.
  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/404.html"
    error_caching_min_ttl = 10
  }

  # 403s from S3 (private object or nonexistent prefix) behave the same way
  # — route them through the SPA fallback so the client runtime gets a
  # chance to resolve the URL.
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/404.html"
    error_caching_min_ttl = 10
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.frontend.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
}

# ----------------------------------------------------------------------------
# Route 53 alias records pointing the apex and www at the distribution
# ----------------------------------------------------------------------------

resource "aws_route53_record" "apex" {
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "www" {
  zone_id = var.route53_zone_id
  name    = "www.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}
