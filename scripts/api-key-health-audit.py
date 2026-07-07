#!/usr/bin/env python3
"""Daily API key health and spend audit.

This script deliberately keeps secret values in memory only. Reports contain
provider/account labels, validation status, and spend metadata, never tokens.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


WORKSPACE = Path("/home/davesalter/.openclaw/workspace")
AUDIT_DIR = WORKSPACE / "state" / "api-key-audits"
SNAPSHOT_DIR = AUDIT_DIR / "snapshots"
OPENCLAW_DIR = Path("/home/davesalter/.openclaw")
def audit_now() -> dt.datetime:
    raw = os.environ.get("AUDIT_NOW_UTC")
    if raw:
        parsed = dt.datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=dt.timezone.utc)
        return parsed.astimezone(dt.timezone.utc)
    return dt.datetime.now(dt.timezone.utc)


NOW_UTC = audit_now()
NOW_LOCAL_LABEL = os.environ.get("AUDIT_NOW_LOCAL_LABEL", NOW_UTC.isoformat())
TODAY = NOW_UTC.date().isoformat()

SECRET_NAME_RE = re.compile(r"(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)", re.I)
ASSIGN_RE = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$")


def read_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    try:
        lines = path.read_text(errors="ignore").splitlines()
    except OSError:
        return values
    for line in lines:
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        match = ASSIGN_RE.match(line)
        if not match:
            continue
        name, value = match.groups()
        value = value.strip()
        if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
            value = value[1:-1]
        values[name] = value
    return values


def proc_env(pid: str) -> dict[str, str]:
    try:
        data = (Path("/proc") / pid / "environ").read_bytes()
    except OSError:
        return {}
    env: dict[str, str] = {}
    for part in data.split(b"\0"):
        if b"=" not in part:
            continue
        k, v = part.split(b"=", 1)
        try:
            env[k.decode()] = v.decode()
        except UnicodeDecodeError:
            continue
    return env


def proc_cmdline(pid: str) -> str:
    try:
        return (Path("/proc") / pid / "cmdline").read_bytes().replace(b"\0", b" ").decode(errors="ignore")
    except OSError:
        return ""


def find_secret(name: str) -> tuple[str | None, list[str]]:
    sources: list[str] = []
    if os.environ.get(name):
        sources.append("current environment")
        return os.environ[name], sources

    for path in [OPENCLAW_DIR / ".env", OPENCLAW_DIR / "gateway.systemd.env"]:
        values = read_env_file(path)
        if values.get(name):
            sources.append(str(path))
            return values[name], sources

    candidates: list[tuple[int, int, str]] = []
    proc_root = Path("/proc")
    for p in proc_root.iterdir():
        if not p.name.isdigit():
            continue
        env = proc_env(p.name)
        value = env.get(name)
        if not value:
            continue
        hay = " ".join([proc_cmdline(p.name), env.get("OPENCLAW_CONFIG_PATH", ""), env.get("OPENCLAW_STATE_DIR", "")]).lower()
        score = 0
        if "openclaw" in hay:
            score += 10
        if "gateway" in hay:
            score += 5
        candidates.append((score, int(p.name), value))
    if candidates:
        candidates.sort(reverse=True)
        sources.append("running OpenClaw process environment")
        return candidates[0][2], sources
    return None, sources


def http_json(
    url: str,
    *,
    headers: dict[str, str] | None = None,
    timeout: int = 20,
) -> tuple[int | None, dict[str, Any] | list[Any] | None, str | None]:
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            try:
                return resp.status, json.loads(raw.decode("utf-8")), None
            except json.JSONDecodeError:
                return resp.status, None, "non_json_response"
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")[:500]
        return exc.code, None, body
    except Exception as exc:  # noqa: BLE001 - audit must record provider errors.
        return None, None, str(exc)


def status_from_code(code: int | None) -> str:
    if code is None:
        return "error"
    if 200 <= code < 300:
        return "valid"
    if code in {401, 403}:
        return "unauthorized"
    if code == 429:
        return "quota_or_rate_limited"
    if code >= 500:
        return "provider_error"
    return "error"


def run_json(args: list[str], timeout: int = 25) -> tuple[bool, Any, str]:
    try:
        proc = subprocess.run(args, text=True, capture_output=True, timeout=timeout, check=False)
    except Exception as exc:  # noqa: BLE001
        return False, None, str(exc)
    if proc.returncode != 0:
        return False, None, (proc.stderr or proc.stdout).strip()[:500]
    try:
        return True, json.loads(proc.stdout or "{}"), ""
    except json.JSONDecodeError:
        return True, (proc.stdout or "").strip()[:500], ""


def openai_costs(api_key: str, start_date: dt.date, end_date: dt.date) -> tuple[float | None, dict[str, Any] | None, str | None]:
    start_ts = int(dt.datetime.combine(start_date, dt.time.min, tzinfo=dt.timezone.utc).timestamp())
    end_ts = int(dt.datetime.combine(end_date, dt.time.min, tzinfo=dt.timezone.utc).timestamp())
    query = urllib.parse.urlencode({"start_time": start_ts, "end_time": end_ts, "bucket_width": "1d", "limit": 31})
    code, data, err = http_json(
        f"https://api.openai.com/v1/organization/costs?{query}",
        headers={"Authorization": f"Bearer {api_key}"},
    )
    if code != 200 or not isinstance(data, dict):
        return None, None, f"costs_unavailable_http_{code}: {err or 'no details'}"
    total = 0.0
    buckets = data.get("data") or []
    if not isinstance(buckets, list):
        return None, data, "unexpected_costs_shape"
    for bucket in buckets:
        if not isinstance(bucket, dict):
            continue
        for result in bucket.get("results") or []:
            if not isinstance(result, dict):
                continue
            amount = result.get("amount") or {}
            value = amount.get("value") if isinstance(amount, dict) else None
            if isinstance(value, (int, float)):
                total += float(value)
    return round(total, 6), data, None


def daily_costs_from_cost_payload(data: dict[str, Any] | None) -> dict[str, float]:
    daily: dict[str, float] = {}
    if not data:
        return daily
    for bucket in data.get("data") or []:
        if not isinstance(bucket, dict):
            continue
        start = bucket.get("start_time")
        if not isinstance(start, int):
            continue
        day = dt.datetime.fromtimestamp(start, tz=dt.timezone.utc).date().isoformat()
        total = 0.0
        for result in bucket.get("results") or []:
            if not isinstance(result, dict):
                continue
            amount = result.get("amount") or {}
            value = amount.get("value") if isinstance(amount, dict) else None
            if isinstance(value, (int, float)):
                total += float(value)
        daily[day] = round(total, 6)
    return daily


def load_prior_snapshots() -> list[dict[str, Any]]:
    snapshots = []
    if not SNAPSHOT_DIR.exists():
        return snapshots
    for path in sorted(SNAPSHOT_DIR.glob("*.json")):
        try:
            snapshots.append(json.loads(path.read_text()))
        except Exception:
            continue
    return snapshots


def prior_daily_spend(provider: str, days: int = 7) -> list[float]:
    values: list[tuple[str, float]] = []
    for snap in load_prior_snapshots():
        if snap.get("date") == TODAY:
            continue
        for item in snap.get("providers", []):
            if item.get("provider") != provider:
                continue
            spend = item.get("spend_usd_today")
            if isinstance(spend, (int, float)):
                values.append((str(snap.get("date") or ""), float(spend)))
    values.sort()
    return [value for _, value in values[-days:]]


def discover_configured_secret_names() -> list[str]:
    names = set()
    managed = os.environ.get("OPENCLAW_SERVICE_MANAGED_ENV_KEYS", "")
    for part in re.split(r"[\s,]+", managed):
        if part:
            names.add(part)
    for path in [OPENCLAW_DIR / ".env", OPENCLAW_DIR / "gateway.systemd.env"]:
        for name in read_env_file(path):
            if SECRET_NAME_RE.search(name):
                names.add(name)
    return sorted(names)


def redact_error(value: str | None) -> str | None:
    if not value:
        return value
    try:
        parsed = json.loads(value)
        err = parsed.get("error") if isinstance(parsed, dict) else None
        if isinstance(err, dict):
            bits = []
            if err.get("status"):
                bits.append(str(err["status"]))
            if err.get("message"):
                bits.append(str(err["message"]))
            if bits:
                value = ": ".join(bits)
    except Exception:
        pass
    status_match = re.search(r'"status"\s*:\s*"([^"]+)"', value)
    message_match = re.search(r'"message"\s*:\s*"([^"]+)"', value)
    if status_match or message_match:
        bits = []
        if status_match:
            bits.append(status_match.group(1))
        if message_match:
            bits.append(message_match.group(1))
        value = ": ".join(bits)
    value = re.sub(r"sk-[A-Za-z0-9_-]+", "sk-REDACTED", value)
    value = re.sub(r"AIza[A-Za-z0-9_-]+", "AIza-REDACTED", value)
    value = re.sub(r"Bearer\s+[A-Za-z0-9._-]+", "Bearer REDACTED", value, flags=re.I)
    return value[:300]


def main() -> int:
    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)

    providers: list[dict[str, Any]] = []
    warnings: list[str] = []
    unavailable: list[str] = []

    configured_secret_names = discover_configured_secret_names()
    key, sources = find_secret("OPENAI_API_KEY")
    if key:
        code, models, err = http_json(
            "https://api.openai.com/v1/models",
            headers={"Authorization": f"Bearer {key}"},
        )
        status = status_from_code(code)
        provider: dict[str, Any] = {
            "provider": "OpenAI",
            "account": "configured OPENAI_API_KEY",
            "credential": "redacted",
            "configured": True,
            "sources": sources,
            "validation_status": status,
            "validation_http_status": code,
            "usage_available": False,
            "spend_available": False,
            "spend_usd_today": None,
            "spend_usd_7d": None,
            "cap_available": False,
            "cap_percent": None,
            "notes": [],
        }
        if status != "valid":
            provider["notes"].append(redact_error(err) or "validation failed")
            warnings.append(f"OpenAI key validation status: {status}")
        else:
            if isinstance(models, dict):
                provider["model_count_visible"] = len(models.get("data") or [])
        start_7 = NOW_UTC.date() - dt.timedelta(days=7)
        spend_7d, cost_payload, cost_err = openai_costs(key, start_7, NOW_UTC.date() + dt.timedelta(days=1))
        daily = daily_costs_from_cost_payload(cost_payload)
        today_spend = daily.get(TODAY)
        if spend_7d is not None:
            provider["spend_available"] = True
            provider["spend_usd_7d"] = spend_7d
            provider["spend_usd_today"] = today_spend if today_spend is not None else 0.0
            provider["daily_spend_usd"] = daily
        else:
            provider["notes"].append(redact_error(cost_err) or "spend unavailable")
            unavailable.append("OpenAI spend API unavailable for this credential")
        history = prior_daily_spend("OpenAI", 7)
        if provider.get("spend_usd_today") is not None:
            today_value = float(provider["spend_usd_today"])
            if history:
                avg = sum(history) / len(history)
                provider["prior_7_snapshot_average_usd"] = round(avg, 6)
                if today_value >= max(1.0, 2 * avg) and today_value - avg >= 1.0:
                    warnings.append(f"OpenAI spend is unusually high: ${today_value:.2f} today vs ${avg:.2f} prior snapshot daily average")
            else:
                provider["notes"].append("Not enough local snapshot history for 7-day anomaly comparison")
        providers.append(provider)
    elif "OPENAI_API_KEY" in configured_secret_names:
        providers.append({
            "provider": "OpenAI",
            "account": "configured OPENAI_API_KEY",
            "credential": "redacted",
            "configured": True,
            "validation_status": "not_found_at_runtime",
            "spend_available": False,
            "notes": ["OPENAI_API_KEY is advertised/configured but no runtime value was readable"],
        })
        warnings.append("OpenAI key configured but not readable at runtime")
    else:
        unavailable.append("OpenAI not configured")

    for provider_name, env_names, test_url in [
        ("Anthropic", ["ANTHROPIC_API_KEY"], "https://api.anthropic.com/v1/models"),
        ("Google/Gemini API key", ["GEMINI_API_KEY", "GOOGLE_API_KEY"], "https://generativelanguage.googleapis.com/v1beta/models"),
        ("GitHub", ["GITHUB_TOKEN", "GH_TOKEN"], "https://api.github.com/user"),
    ]:
        found = False
        for env_name in env_names:
            secret, secret_sources = find_secret(env_name)
            if not secret:
                continue
            found = True
            headers: dict[str, str] = {}
            url = test_url
            if provider_name == "Anthropic":
                headers = {"x-api-key": secret, "anthropic-version": "2023-06-01"}
            elif provider_name == "Google/Gemini API key":
                url = f"{test_url}?key={urllib.parse.quote(secret)}"
            else:
                headers = {"Authorization": f"Bearer {secret}", "Accept": "application/vnd.github+json"}
            code, _, err = http_json(url, headers=headers)
            status = status_from_code(code)
            item = {
                "provider": provider_name,
                "account": env_name,
                "credential": "redacted",
                "configured": True,
                "sources": secret_sources,
                "validation_status": status,
                "validation_http_status": code,
                "spend_available": False,
                "cap_available": False,
                "notes": ["spend/usage cap not exposed through this minimal key check"],
            }
            if status != "valid":
                item["notes"].append(redact_error(err) or "validation failed")
                warnings.append(f"{provider_name} credential {env_name} validation status: {status}")
            providers.append(item)
        if not found:
            unavailable.append(f"{provider_name} not configured via recognized env vars")

    notion_path = Path("/home/davesalter/.config/openclaw/notion-token")
    if notion_path.exists():
        token = notion_path.read_text().strip()
        code, data, err = http_json(
            "https://api.notion.com/v1/users/me",
            headers={"Authorization": f"Bearer {token}", "Notion-Version": "2022-06-28"},
        )
        status = status_from_code(code)
        item = {
            "provider": "Notion",
            "account": "local OpenClaw Notion token",
            "credential": "redacted",
            "configured": True,
            "sources": [str(notion_path)],
            "validation_status": status,
            "validation_http_status": code,
            "spend_available": False,
            "cap_available": False,
            "notes": ["Notion usage/spend is unavailable through this integration token"],
        }
        if isinstance(data, dict):
            bot = data.get("bot") or {}
            owner = bot.get("owner") if isinstance(bot, dict) else None
            item["account_detail"] = data.get("name") or (owner.get("workspace_name") if isinstance(owner, dict) else None)
        if status != "valid":
            item["notes"].append(redact_error(err) or "validation failed")
            warnings.append(f"Notion token validation status: {status}")
        providers.append(item)

    for account, client in [("Dave@DRS-Engineering.net", ""), ("drs7890@gmail.com", "personal")]:
        args = ["gog", "auth", "status", "--account", account, "--json"]
        if client:
            args.extend(["--client", client])
        ok, payload, err = run_json(args)
        status = "configured" if ok else "error"
        item = {
            "provider": "Google Workspace/Gmail OAuth",
            "account": account,
            "credential": "OAuth refresh token redacted",
            "configured": ok,
            "validation_status": status,
            "spend_available": False,
            "cap_available": False,
            "notes": ["Gmail/Google Workspace spend is not exposed through OAuth user credentials"],
        }
        if ok and isinstance(payload, dict):
            acct = payload.get("account") or {}
            item["credential_exists"] = bool(acct.get("credentials_exists"))
            item["client"] = acct.get("client") or client or "default"
        else:
            item["notes"].append(redact_error(err) or "gog auth status failed")
            warnings.append(f"Google/Gmail OAuth status failed for {account}")
        providers.append(item)

    ok, remotes, err = run_json(["rclone", "listremotes"])
    if ok:
        text = remotes if isinstance(remotes, str) else ""
        if "Dropbox:" in text:
            ok2, _, err2 = run_json(["rclone", "lsf", "Dropbox:", "--max-depth", "1"], timeout=30)
            status = "valid" if ok2 else "error"
            item = {
                "provider": "Dropbox",
                "account": "rclone remote Dropbox",
                "credential": "OAuth token redacted",
                "configured": True,
                "validation_status": status,
                "spend_available": False,
                "cap_available": False,
                "notes": ["Dropbox spend is unavailable through this OAuth file API credential"],
            }
            if not ok2:
                item["notes"].append(redact_error(err2) or "rclone lsf failed")
                warnings.append("Dropbox rclone remote validation failed")
            providers.append(item)
        else:
            unavailable.append("Dropbox rclone remote not configured")
    else:
        unavailable.append(f"rclone remote discovery failed: {redact_error(err)}")

    app_gmail = os.environ.get("AUDIT_GMAIL_APP_STATUS_JSON")
    if app_gmail:
        try:
            payload = json.loads(app_gmail)
            providers.append({
                "provider": "Gmail connector",
                "account": payload.get("email") or "configured Gmail connector",
                "credential": "connector credential redacted",
                "configured": True,
                "validation_status": "valid",
                "spend_available": False,
                "cap_available": False,
                "notes": ["Gmail connector profile read succeeded; spend unavailable through Gmail API"],
            })
        except json.JSONDecodeError:
            pass
    app_dropbox = os.environ.get("AUDIT_DROPBOX_APP_STATUS_JSON")
    if app_dropbox:
        try:
            payload = json.loads(app_dropbox)
            providers.append({
                "provider": "Dropbox connector",
                "account": payload.get("email") or payload.get("display_name") or "configured Dropbox connector",
                "credential": "connector credential redacted",
                "configured": True,
                "validation_status": "valid",
                "spend_available": False,
                "cap_available": False,
                "notes": [f"Dropbox connector profile read succeeded; team={payload.get('team_name') or 'n/a'}; spend unavailable through Dropbox file API"],
            })
        except json.JSONDecodeError:
            pass

    total_spend = 0.0
    spend_provider_count = 0
    for item in providers:
        spend = item.get("spend_usd_today")
        if isinstance(spend, (int, float)):
            total_spend += float(spend)
            spend_provider_count += 1

    snapshot = {
        "timestamp_utc": NOW_UTC.isoformat(),
        "date": TODAY,
        "local_time_label": NOW_LOCAL_LABEL,
        "workspace": str(WORKSPACE),
        "configured_secret_names": configured_secret_names,
        "providers": providers,
        "total_spend_usd_available_today": round(total_spend, 6),
        "spend_provider_count": spend_provider_count,
        "warnings": warnings,
        "unavailable": unavailable,
    }

    stamp = NOW_UTC.strftime("%Y%m%dT%H%M%SZ")
    snapshot_path = SNAPSHOT_DIR / f"{stamp}.json"
    report_path = AUDIT_DIR / f"{stamp}.md"
    latest_path = AUDIT_DIR / "latest.md"

    snapshot_path.write_text(json.dumps(snapshot, indent=2, sort_keys=True) + "\n")

    lines = [
        "# API Key Health and Spend Audit",
        "",
        f"- Time: {NOW_LOCAL_LABEL} ({NOW_UTC.isoformat()})",
        f"- Workspace: `{WORKSPACE}`",
        f"- Total API spend available today: `${total_spend:.2f}` across {spend_provider_count} provider(s)",
        "",
        "## Warnings",
    ]
    if warnings:
        lines.extend(f"- {warning}" for warning in warnings)
    else:
        lines.append("- None.")
    lines.extend(["", "## Provider Checks", ""])
    for item in providers:
        lines.append(f"### {item.get('provider')} - {item.get('account')}")
        lines.append(f"- Credential: {item.get('credential', 'redacted')}")
        lines.append(f"- Validation: {item.get('validation_status')}")
        if item.get("validation_http_status") is not None:
            lines.append(f"- Validation HTTP status: {item.get('validation_http_status')}")
        if item.get("spend_available"):
            lines.append(f"- Spend today: `${float(item.get('spend_usd_today') or 0):.2f}`")
            lines.append(f"- Spend last 7 days: `${float(item.get('spend_usd_7d') or 0):.2f}`")
        else:
            lines.append("- Spend: unavailable through this credential/API")
        if item.get("cap_available"):
            lines.append(f"- Cap usage: {item.get('cap_percent')}%")
        else:
            lines.append("- Cap/limit comparison: unavailable")
        notes = item.get("notes") or []
        for note in notes:
            lines.append(f"- Note: {note}")
        lines.append("")
    lines.extend(["## Unavailable Or Not Configured", ""])
    if unavailable:
        lines.extend(f"- {entry}" for entry in unavailable)
    else:
        lines.append("- None.")
    lines.extend(["", "## Files", "", f"- Snapshot: `{snapshot_path}`", f"- Report: `{report_path}`"])
    report = "\n".join(lines) + "\n"
    report_path.write_text(report)
    latest_path.write_text(report)

    print(json.dumps({"snapshot": str(snapshot_path), "report": str(report_path), "latest": str(latest_path), "warnings": warnings, "total_spend": round(total_spend, 6)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
