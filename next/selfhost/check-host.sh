#!/usr/bin/env bash
# Read-only capacity check for a DEDICATED QWIZ self-hosted Supabase test machine.
# Does not install anything, contact production, collect secrets or modify the OS.
set -u

errors=0
warnings=0
ok(){ printf '[OK] %s\n' "$1"; }
warn(){ printf '[WARN] %s\n' "$1"; warnings=$((warnings+1)); }
fail(){ printf '[FAIL] %s\n' "$1"; errors=$((errors+1)); }

printf '%s\n' 'QWIZ-PARTY / self-hosted host preflight (read-only)'
if [[ "$(uname -s)" == "Linux" ]]; then ok "Linux detected"; else fail "Requires Linux (use a Linux VM when on Windows/macOS)"; fi

if command -v getconf >/dev/null 2>&1; then
  cpu="$(getconf _NPROCESSORS_ONLN 2>/dev/null || printf 0)"
else cpu=0; fi
if [[ "$cpu" =~ ^[0-9]+$ ]] && (( cpu >= 4 )); then ok "$cpu CPU cores (recommended >=4)";
elif [[ "$cpu" =~ ^[0-9]+$ ]] && (( cpu >= 2 )); then warn "$cpu CPU cores (minimum >=2, recommended >=4)";
else fail "Fewer than 2 CPU cores or count unavailable"; fi

if [[ -r /proc/meminfo ]]; then
  ram_kb="$(awk '/^MemTotal:/ {print $2;exit}' /proc/meminfo)"
else ram_kb=0; fi
if [[ "$ram_kb" =~ ^[0-9]+$ ]] && (( ram_kb >= 8*1024*1024 )); then ok "RAM >=8 GiB";
elif [[ "$ram_kb" =~ ^[0-9]+$ ]] && (( ram_kb >= 4*1024*1024 )); then warn "RAM >=4 GiB but <8 GiB recommended";
else fail "RAM <4 GiB or not reported"; fi

# Warn on available disk space in the *current directory*. Use the intended Docker data drive.
if command -v df >/dev/null 2>&1; then
  free_kb="$(df -Pk . | awk 'NR==2 {print $4}')"
else free_kb=0; fi
if [[ "$free_kb" =~ ^[0-9]+$ ]] && (( free_kb >= 80*1024*1024 )); then ok "Free disk >=80 GiB on current filesystem";
elif [[ "$free_kb" =~ ^[0-9]+$ ]] && (( free_kb >= 40*1024*1024 )); then warn "Free disk >=40 GiB but <80 GiB recommended";
else fail "Free disk <40 GiB on current filesystem (or size unavailable)"; fi

for cmd in git curl openssl; do
  if command -v "$cmd" >/dev/null 2>&1; then ok "$cmd available";
  else warn "$cmd is missing (official installer may install it)"; fi
done
if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then ok "Docker daemon reachable";
  else warn "Docker installed but daemon inaccessible for this user"; fi
  if docker compose version >/dev/null 2>&1; then ok "Docker Compose available";
  else warn "Docker Compose missing"; fi
else
  warn "Docker not installed (official installer can provide Docker Engine)";
fi
if command -v timedatectl >/dev/null 2>&1; then
  state="$(timedatectl show -p NTPSynchronized --value 2>/dev/null || true)"
  if [[ "$state" == "yes" ]]; then ok "NTP synchronized";
  else warn "NTP not confirmed; time drift causes JWT expiry and timers to disagree"; fi
fi

printf 'SUMMARY errors=%d warnings=%d\n' "$errors" "$warnings"
if ((errors>0)); then exit 1; fi
exit 0
