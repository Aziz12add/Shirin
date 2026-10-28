# Sample Generated Configs — VLESS & Trojan

این فایل با ژنراتور خود پنل (src/utils/configParsers.ts) تولید شده است.
مقادیر UUID و رمز Trojan را قبل از استفاده عوض کنید. در پنل، این لینک‌ها
به‌صورت خودکار برای هر کاربر با UUID/رمز اختصاصی ساخته می‌شوند.

## VLESS (WS + TLS, مسیر /vless)

```
vless://11111111-2222-3333-4444-555555555555@shirin.wasmer.app:443?type=ws&security=tls&path=%2Fvless&sni=shirin.wasmer.app&host=shirin.wasmer.app&encryption=none#Shirin-VLESS
```

## Trojan (WS + TLS, مسیر /trojan)

```
trojan://CHANGE_ME_TROJAN_PASSWORD@shirin.wasmer.app:443?type=ws&security=tls&path=%2Ftrojan&sni=shirin.wasmer.app&host=shirin.wasmer.app#Shirin-Trojan
```

## نکات

- مسیرهای WS باید با تنظیم `STRICT_PATHS` سرور هم‌خوان باشند: پیش‌فرض `/vless*` و `/trojan*`.
- پورت روی Wasmer از طریق `PORT` (پیش‌فرض 8080) تعیین می‌شود؛ کلاینت‌ها معمولاً 443 را از طریق TLS فرانتWasmer استفاده می‌کنند.
- برای هر کاربر واقعی، UUID و رمز Trojan از `UserAccount.uuid` و `UserAccount.trojanPassword` در پنل ساخته می‌شوند.
