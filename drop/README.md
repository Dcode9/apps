# D-Drop (Ephemeral, Zero-Knowledge File & Text Vault)

An anonymous, temporary, and secure file & text transfer tool built for **Dcode9/apps**. Anyone can upload any file or secret text note and receive a clean 6-character access code and direct share link. No authentication, sign-in, or account creation is required for sending or receiving.

---

## Key Features

1. **Zero Sign-In & Anonymous**:
   - Complete access for anyone without logging in or providing personal details.
   - Zero access logs or IP tracking stored with drops.

2. **Temporary 6-Character Codes & Direct Links**:
   - Every drop generates a 6-character human-readable code (e.g. `8F4-29K`) with unambiguous characters (`[2-9A-Z]`).
   - Direct shareable URLs with embedded keys for 1-click access: `https://.../drop/#code=8F429K&key=...`.
   - Dynamic QR Code generated client-side for mobile camera transfers.

3. **Military-Grade Security & Safety**:
   - **Zero-Knowledge Client-Side Encryption (AES-256-GCM)**: Plaintext files and notes are encrypted in browser memory via the W3C Web Cryptography API before transmission. Decryption keys are stored strictly in the URL `#fragment` (never sent to the server in HTTP requests).
   - **Password-Derived Keys (PBKDF2)**: When optional password protection is enabled, the 256-bit encryption key is derived directly from the passphrase using PBKDF2 (100,000 rounds, SHA-256), eliminating the need to memorize or exchange long random keys.
   - **Safe File Serving**: Enforced `Content-Disposition: attachment`, `Content-Security-Policy: default-src 'none'; sandbox`, and `X-Content-Type-Options: nosniff` prevent stored XSS or in-browser script execution.
   - **PostgreSQL Row-Level Security (RLS)**: Direct `SELECT *` table queries are completely denied to anonymous clients. Drops can only be looked up by exact code verification through `SECURITY DEFINER` stored procedures.

4. **Lifecycle & Self-Destruction**:
   - **Burn After Reading**: Option to automatically destroy the drop immediately upon the first view or download.
   - **Configurable TTL**: Auto-expiration periods (10 minutes, 1 hour, 24 hours, 7 days).
   - **Creator Early Destruction**: Creators receive a private `delete_token` to immediately wipe the drop from both the database and cloud storage on demand.
   - **Automated Garbage Collection**: Expired drops and abandoned storage objects are cleaned up automatically.

5. **Utilitarian & Minimalist Interface**:
   - High-contrast dark utilitarian UI inspired by Dieter Rams, Linear, and Apple developer tools.
   - Drag-and-drop file upload, file size formatting, and global clipboard paste (`Cmd+V` / `Ctrl+V` to drop copied files or text notes anywhere).
   - Monospace text note editor with line & character counters.
   - Live countdown ticker for drop expiration.
   - Responsive layout for desktop and mobile devices.

---

## Architecture & Data Flow

```
   [ Uploader Browser ]
          │
          ├─► 1. (Optional) Client-side AES-256-GCM encryption in memory
          ├─► 2. Calls Supabase RPC `create_drop` with TTL & metadata
          ├─► 3. Uploads binary ciphertext to Supabase Storage bucket `drops`
          └─► 4. Displays 6-character Code, Direct Link with `#key`, and QR Code
                                   │
                                   ▼
                       [ PostgreSQL (Supabase) ]
                       - Table `public.drops` (RLS strictly enforced)
                       - Stored Procedure `create_drop`
                       - Stored Procedure `claim_drop`
                       - Stored Procedure `delete_drop`
                       - Bucket `storage.buckets/drops`
                                   │
   [ Recipient Browser ]           ▼
          ├─► 1. Enters 6-character code (or clicks direct link)
          ├─► 2. Calls Supabase RPC `claim_drop` (verifies TTL, burn status, password)
          ├─► 3. Downloads ciphertext from storage or reads text payload
          ├─► 4. Decrypts locally in browser memory using key from URL hash or password
          └─► 5. Prompts safe file download or displays sanitized monospace text
```

---

## Serverless API Reference (`/api/drop`)

In addition to direct browser-to-Supabase communication, a serverless API endpoint is available for programmatic CLI/curl access:

### Create Drop
```bash
POST /api/drop
Content-Type: application/json

{
  "action": "create",
  "type": "text",
  "textContent": "My confidential note",
  "burnAfterReading": true,
  "ttlSeconds": 3600
}
```

### Claim Drop
```bash
GET /api/drop?code=8F4-29K
```

### Download File Stream
```bash
GET /api/drop?code=8F4-29K&download=1
```

### Destroy Drop Early
```bash
DELETE /api/drop?code=8F4-29K&token=<delete_token>
```
