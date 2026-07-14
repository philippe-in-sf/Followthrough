#!/usr/bin/env bash
set -euo pipefail

apex_host="${DOMAIN_CHECK_APEX:-followthrough.dev}"
www_host="${DOMAIN_CHECK_WWW:-www.followthrough.dev}"
expected_ip="${DOMAIN_CHECK_EXPECTED_IP:-162.0.213.176}"
expected_www_cname="${DOMAIN_CHECK_EXPECTED_WWW_CNAME:-}"
version_path="${DOMAIN_CHECK_VERSION_PATH:-/api/version}"
expected_issuer="${DOMAIN_CHECK_EXPECTED_ISSUER:-}"
expiry_days="${DOMAIN_CHECK_EXPIRY_DAYS:-30}"

if [ -z "$expected_www_cname" ]; then
  expected_www_cname="${apex_host}."
fi

if [ -z "$expected_issuer" ]; then
  expected_issuer="Let's Encrypt"
fi

case "$expiry_days" in
  ""|*[!0-9]*)
    echo "DOMAIN_CHECK_EXPIRY_DAYS must be a non-negative integer" >&2
    exit 2
    ;;
esac

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

failures=0

section() {
  printf '\n== %s ==\n' "$1"
}

pass() {
  printf 'ok: %s\n' "$1"
}

fail() {
  printf 'fail: %s\n' "$1" >&2
  failures=$((failures + 1))
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "missing required command: $1"
  fi
}

check_dns_a() {
  local host="$1"
  local records

  section "DNS A ${host}"
  records="$(dig +short "$host" A || true)"
  printf '%s\n' "$records"

  if printf '%s\n' "$records" | grep -Fx "$expected_ip" >/dev/null; then
    pass "${host} resolves to ${expected_ip}"
  else
    fail "${host} does not resolve to expected IP ${expected_ip}"
  fi
}

check_www_cname() {
  local cname

  section "DNS CNAME ${www_host}"
  cname="$(dig +short "$www_host" CNAME | sed -n '1p' || true)"
  printf '%s\n' "$cname"

  if [ "$cname" = "$expected_www_cname" ]; then
    pass "${www_host} aliases to ${expected_www_cname}"
  else
    fail "${www_host} CNAME is '${cname:-<none>}', expected ${expected_www_cname}"
  fi
}

check_https_version() {
  local host="$1"
  local url="https://${host}${version_path}"
  local body

  section "HTTPS ${url}"
  if body="$(curl --fail --silent --show-error "$url")"; then
    printf '%s\n' "$body"
    pass "${url} responded"
  else
    fail "${url} did not respond successfully"
  fi
}

fetch_cert() {
  local host="$1"
  local cert_file="$tmp_dir/${host}.pem"

  if openssl s_client -servername "$host" -connect "${host}:443" </dev/null 2>/dev/null \
    | openssl x509 -outform PEM > "$cert_file"; then
    if [ -s "$cert_file" ]; then
      printf '%s\n' "$cert_file"
      return 0
    fi
  fi

  return 1
}

check_cert() {
  local host="$1"
  local cert_file
  local expiry_seconds=$((expiry_days * 24 * 60 * 60))

  section "TLS certificate ${host}"
  if ! cert_file="$(fetch_cert "$host")"; then
    fail "could not read certificate from ${host}:443"
    return
  fi

  openssl x509 -in "$cert_file" -noout -subject -issuer -dates
  openssl x509 -in "$cert_file" -noout -ext subjectAltName

  if openssl x509 -in "$cert_file" -noout -issuer | grep -F "$expected_issuer" >/dev/null; then
    pass "${host} issuer includes ${expected_issuer}"
  else
    fail "${host} issuer does not include ${expected_issuer}"
  fi

  if openssl x509 -in "$cert_file" -noout -ext subjectAltName | grep -F "DNS:${host}" >/dev/null; then
    pass "${host} is present in certificate SANs"
  else
    fail "${host} is missing from certificate SANs"
  fi

  if openssl x509 -in "$cert_file" -checkend "$expiry_seconds" -noout >/dev/null; then
    pass "${host} certificate is valid for more than ${expiry_days} days"
  else
    fail "${host} certificate expires within ${expiry_days} days"
  fi
}

section "Tooling"
require_command dig
require_command curl
require_command openssl

if [ "$failures" -eq 0 ]; then
  check_dns_a "$apex_host"
  check_www_cname
  check_dns_a "$www_host"
  check_https_version "$apex_host"
  check_https_version "$www_host"
  check_cert "$apex_host"
  check_cert "$www_host"
fi

if [ "$failures" -gt 0 ]; then
  printf '\nDomain check failed with %s issue(s).\n' "$failures" >&2
  exit 1
fi

printf '\nDomain check passed.\n'
