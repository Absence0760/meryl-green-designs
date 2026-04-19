# ----------------------------------------------------------------------------
# API Gateway v2 (HTTP API) in front of the Lambda.
#
# Replaces the Lambda Function URL — that path hit an undiagnosable AWS-side
# 403 in this account + af-south-1 that blocked both public (NONE) and
# CloudFront-signed (AWS_IAM via OAC) invocations. HTTP API uses a
# different gateway pipeline and is unaffected.
#
# The API is publicly invocable at its execute-api URL. CloudFront fronts
# it at merylgreendesigns.com/api/*. Application-level authorization
# (email verification on order lookup, HMAC on Sanity webhooks, signature
# on PayFast ITN, rate limiting) gates the actual sensitive routes — the
# HTTP API itself is an open reverse proxy to Hono.
# ----------------------------------------------------------------------------

resource "aws_apigatewayv2_api" "backend" {
  name          = "${local.project}-backend"
  protocol_type = "HTTP"
  description   = "HTTP API fronting the Hono backend Lambda"

  # CORS handled by the Hono app (ALLOWED_ORIGINS env var) so requests
  # from the frontend's origin get the right headers. Leaving the HTTP
  # API's own CORS off avoids two overlapping CORS layers.
}

resource "aws_apigatewayv2_integration" "backend" {
  api_id                 = aws_apigatewayv2_api.backend.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.backend.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
  timeout_milliseconds   = 29000
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.backend.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.backend.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.backend.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "apigateway_invoke" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.backend.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.backend.execution_arn}/*/*"
}

# Strip the https:// and any trailing path from the invoke URL so it can
# be used as a CloudFront origin domain_name.
locals {
  api_gateway_host = replace(replace(aws_apigatewayv2_api.backend.api_endpoint, "https://", ""), "/", "")
}
