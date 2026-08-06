# Cloud JWT key migration

LiveFlow supports RS256 user tokens so customer installations never receive
the central server's JWT signing secret.

## Key ownership

- `CLOUD_JWT_PRIVATE_KEY`: central server only. Store it in the hosting
  provider's protected secret manager.
- `CLOUD_JWT_PUBLIC_KEY`: central server and local desktop backend. It is safe
  to distribute.
- `JWT_SECRET`: unique per installation. It remains responsible for local
  overlay and short-lived effect-access tokens.

The private and public values may use real newlines or escaped `\n`.

## Migration order

1. Generate a 2048-bit or stronger RSA key pair in an approved secure
   environment.
2. Configure both `CLOUD_JWT_PRIVATE_KEY` and `CLOUD_JWT_PUBLIC_KEY` on the
   central server.
3. Put only the public key at
   `desktop/assets/cloud-jwt-public.pem` before building the customer
   installer, or set `LIVEFLOW_CLOUD_JWT_PUBLIC_KEY` in the desktop runtime
   environment.
4. Deploy the central server. New login/register responses will contain RS256
   tokens.
5. Build and test the desktop installer with the matching public key.
6. Existing HS256 sessions may continue only where their local installation
   can verify them. Require users to sign in again at migration time.
7. Remove every legacy shared JWT secret from build and hosting configuration.

## Verification

- Decode a new login token header and confirm `alg` is `RS256`.
- Confirm the desktop accepts the token using only the public key.
- Confirm changing the public key makes the token fail.
- Confirm HS384, `none`, and other algorithms are rejected.
- Confirm the packaged resources contain the public key and never the private
  key.

Do not publish the migrated build until the central server and desktop use the
same key pair.
